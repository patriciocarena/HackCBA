import { describe, expect, test } from 'bun:test'
import { appliedText, REFUSED, REJECTED } from '@/telegram/confirm-reply'
import { confirmCallback } from '@/telegram/confirm-callback'
import { liveCatalog } from '@/catalog/live-catalog'
import type { ConfirmRefusal } from '@/catalog/confirm-price-edit'
import type { PriceVersion } from '@/catalog/apply-edit'
import { ars } from '@/domain/money'
import type { CatalogRow } from '@/domain/price-for'
import type { PriceEditProposal } from '@/domain/types'
import type { Callback } from '@/telegram/callback'

const ADMIN = '99900011'
const STRANGER = '12345678'
const SLUG = 'bc_special_100_front'
const NOW = '2026-09-12T10:05:00.000Z'

const ROWS: CatalogRow[] = [{ slug: SLUG, familySlug: 'business_cards', kind: 'sale', label: '100 tarjetas', price: ars(12100) }]

function proposal(overrides: Partial<PriceEditProposal> = {}): PriceEditProposal {
  return {
    id: 'edit_1',
    familySlug: 'business_cards',
    operation: { op: 'percent', direction: 'raise', rate: 0.2 },
    lines: [{ slug: SLUG, familySlug: 'business_cards', label: '100 tarjetas', oldPrice: ars(12100), newPrice: ars(14520) }],
    state: 'proposed',
    source: 'audio',
    mediaId: 'voice_abc',
    proposedBy: ADMIN,
    proposedAt: '2026-09-12T10:00:00.000Z',
    resolvedBy: null,
    resolvedAt: null,
    ...overrides,
  }
}

function press(overrides: Partial<Callback> = {}): Callback {
  return {
    updateId: 900,
    callbackId: 'cbq_1',
    chatId: '55512345',
    privateChat: true,
    senderId: ADMIN,
    proposalId: 'edit_1',
    accepted: true,
    ...overrides,
  }
}

function wired(options: { held?: PriceEditProposal | null; rows?: CatalogRow[]; failing?: 'answer' | 'send' } = {}) {
  const store = new Map<string, PriceEditProposal>()
  if (options.held !== null) store.set('edit_1', options.held ?? proposal())

  const answered: { callbackId: string; text: string }[] = []
  const sent: { chatId: string; text: string }[] = []
  const versions: PriceVersion[] = []
  const catalog = liveCatalog(options.rows ?? ROWS)

  const onCallback = confirmCallback({
    load: async (id) => store.get(id) ?? null,
    save: async (saved) => void store.set(saved.id, saved),
    catalog,
    record: async (version) => void versions.push(version),
    isAdmin: (id) => id === ADMIN,
    answer: async (callbackId, text) => {
      if (options.failing === 'answer') throw new Error('telegram answerCallbackQuery 400')
      answered.push({ callbackId, text })
    },
    send: async (chatId, text) => {
      if (options.failing === 'send') throw new Error('telegram sendMessage 400')
      sent.push({ chatId, text })
    },
    versionId: () => 'v1',
    now: () => NOW,
  })

  return { onCallback, answered, sent, versions, catalog, store }
}

function priceOf(rows: CatalogRow[]): number {
  return rows.find((row) => row.slug === SLUG)?.price as number
}

describe('every press is answered, which is what clears the spinner', () => {
  test('an applied edit answers the query and tells the owner what moved and that it is live', async () => {
    const wiring = wired()

    await wiring.onCallback(press())

    expect(wiring.answered).toMatchObject([{ callbackId: 'cbq_1' }])
    expect(wiring.sent).toHaveLength(1)
    expect(wiring.sent[0]?.text).toBe('Aplicado, ya está en vigencia:\n100 tarjetas: $12.100 → $14.520')
  })

  test('a no answers the query and says nothing changed', async () => {
    const wiring = wired()

    await wiring.onCallback(press({ accepted: false }))

    expect(wiring.answered).toHaveLength(1)
    expect(wiring.sent).toMatchObject([{ text: REJECTED }])
    expect(priceOf(wiring.catalog.rows())).toBe(12100)
  })

  test('a stale proposal tells the owner why, and what to do about it', async () => {
    const wiring = wired({ rows: [{ slug: SLUG, familySlug: 'business_cards', kind: 'sale', label: '100 tarjetas', price: ars(13000) }] })

    await wiring.onCallback(press())

    expect(wiring.sent[0]?.text).toBe(REFUSED.stale)
    expect(wiring.sent[0]?.text).toContain('Mandame el audio de nuevo')
    expect(wiring.versions).toBeEmpty()
  })

  test('a proposal the store never held is named as missing', async () => {
    const wiring = wired({ held: null })

    await wiring.onCallback(press())

    expect(wiring.sent).toMatchObject([{ text: REFUSED.unknown_proposal }])
  })

  test('an already resolved proposal says so instead of applying twice', async () => {
    const wiring = wired({ held: proposal({ state: 'applied', resolvedBy: ADMIN, resolvedAt: NOW }) })

    await wiring.onCallback(press())

    expect(wiring.sent).toMatchObject([{ text: REFUSED.not_proposed }])
    expect(priceOf(wiring.catalog.rows())).toBe(12100)
  })

  test('every refusal the type allows has a sentence of its own', () => {
    const reasons: ConfirmRefusal[] = ['not_an_admin', 'unknown_proposal', 'not_proposed', 'not_a_time', 'not_a_person', 'stale']

    for (const reason of reasons) {
      expect(REFUSED[reason].length).toBeGreaterThan(0)
    }

    expect(new Set(Object.values(REFUSED)).size).toBe(reasons.length)
  })
})

describe('a stranger who presses', () => {
  test('gets the spinner cleared and nothing in their chat', async () => {
    const wiring = wired()

    await wiring.onCallback(press({ senderId: STRANGER }))

    expect(wiring.answered).toMatchObject([{ text: REFUSED.not_an_admin }])
    expect(wiring.sent).toBeEmpty()
  })

  test('is told the same thing whether the proposal exists or not', async () => {
    const held = wired()
    const missing = wired({ held: null })

    await held.onCallback(press({ senderId: STRANGER }))
    await missing.onCallback(press({ senderId: STRANGER }))

    expect(held.answered).toEqual(missing.answered)
    expect(held.sent).toEqual(missing.sent)
  })
})

describe('one edit, one message', () => {
  test('a second press of a settled proposal clears its spinner and sends no second applied', async () => {
    const wiring = wired()

    await wiring.onCallback(press())
    await wiring.onCallback(press({ updateId: 901, callbackId: 'cbq_2' }))

    expect(wiring.answered.map((entry) => entry.callbackId)).toEqual(['cbq_1', 'cbq_2'])
    expect(wiring.sent).toHaveLength(1)
    expect(wiring.versions).toHaveLength(1)
  })

  test('two presses that race settle once and tell the owner once', async () => {
    const wiring = wired()

    await Promise.all([wiring.onCallback(press()), wiring.onCallback(press({ updateId: 901, callbackId: 'cbq_2' }))])

    expect(wiring.sent.filter((entry) => entry.text.startsWith('Aplicado'))).toHaveLength(1)
    expect(wiring.versions).toHaveLength(1)
  })
})

describe('a reply that fails does not undo the edit', () => {
  test('the catalog stays moved and the version stays recorded when the send throws', async () => {
    const wiring = wired({ failing: 'send' })

    await wiring.onCallback(press())

    expect(priceOf(wiring.catalog.rows())).toBe(14520)
    expect(wiring.versions).toHaveLength(1)
    expect((wiring.store.get('edit_1') as PriceEditProposal).state).toBe('applied')
  })

  test('and when answering the query throws, so Telegram is never asked to retry the press', async () => {
    const wiring = wired({ failing: 'answer' })

    await wiring.onCallback(press())

    expect(priceOf(wiring.catalog.rows())).toBe(14520)
    expect(wiring.sent).toHaveLength(1)
  })
})

describe('appliedText', () => {
  test('writes every line that moved, old and new', () => {
    const two = proposal({
      lines: [
        { slug: SLUG, familySlug: 'business_cards', label: '100 tarjetas', oldPrice: ars(12100), newPrice: ars(14520) },
        { slug: 'bc_offset_1000_4_1', familySlug: 'business_cards', label: '1000 tarjetas', oldPrice: ars(45000), newPrice: ars(54000) },
      ],
    })

    expect(appliedText(two)).toBe(
      ['Aplicado, ya está en vigencia:', '100 tarjetas: $12.100 → $14.520', '1000 tarjetas: $45.000 → $54.000'].join('\n'),
    )
  })
})
