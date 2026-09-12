import { describe, expect, test } from 'bun:test'
import { confirmCallback } from '@/telegram/confirm-callback'
import { liveCatalog } from '@/catalog/live-catalog'
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

function proposal(): PriceEditProposal {
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
  }
}

function press(overrides: Partial<Callback> = {}): Callback {
  return {
    updateId: 9001,
    callbackId: 'cbq_1',
    chatId: '55512345',
    privateChat: true,
    senderId: ADMIN,
    proposalId: 'edit_1',
    accepted: true,
    ...overrides,
  }
}

function wired(rows: CatalogRow[] = ROWS) {
  const held = new Map<string, PriceEditProposal>([['edit_1', proposal()]])
  const versions: PriceVersion[] = []
  const catalog = liveCatalog(rows)
  let issued = 0

  const onCallback = confirmCallback({
    load: async (id) => held.get(id) ?? null,
    save: async (saved) => void held.set(saved.id, saved),
    catalog,
    record: async (version) => void versions.push(version),
    isAdmin: (id) => id === ADMIN,
    answer: async () => {},
    send: async () => {},
    versionId: () => `v${(issued += 1)}`,
    now: () => NOW,
  })

  return { onCallback, catalog, versions, held }
}

function priceOf(rows: CatalogRow[]): number {
  return rows.find((row) => row.slug === SLUG)?.price as number
}

describe("the owner's yes reaches the catalog", () => {
  test('the live catalog is quoting the new price once the press is handled', async () => {
    const wiring = wired()

    await wiring.onCallback(press())

    expect(priceOf(wiring.catalog.rows())).toBe(14520)
  })

  test('the version is recorded rather than returned and dropped', async () => {
    const wiring = wired()

    await wiring.onCallback(press())

    expect(wiring.versions).toHaveLength(1)
    expect(wiring.versions[0]).toMatchObject({ proposalId: 'edit_1', appliedBy: ADMIN, appliedAt: NOW, mediaId: 'voice_abc' })
    expect(wiring.held.get('edit_1')?.state).toBe('applied')
  })

  test('a no leaves the catalog alone and records no version', async () => {
    const wiring = wired()

    await wiring.onCallback(press({ accepted: false }))

    expect(priceOf(wiring.catalog.rows())).toBe(12100)
    expect(wiring.versions).toBeEmpty()
    expect(wiring.held.get('edit_1')?.state).toBe('rejected')
  })
})

describe('two taps on one keyboard', () => {
  test('settle the proposal once, though both carry their own update id', async () => {
    const wiring = wired()

    await Promise.all([wiring.onCallback(press()), wiring.onCallback(press({ updateId: 9002, callbackId: 'cbq_2' }))])

    expect(wiring.versions).toHaveLength(1)
    expect(priceOf(wiring.catalog.rows())).toBe(14520)
  })

  test('and a second press after the first has finished is refused too', async () => {
    const wiring = wired()

    await wiring.onCallback(press())
    await wiring.onCallback(press({ updateId: 9002 }))

    expect(wiring.versions).toHaveLength(1)
  })
})

describe('a press from outside the allowlist', () => {
  test('changes nothing and does not lock the owner out of his own proposal', async () => {
    const wiring = wired()

    await wiring.onCallback(press({ senderId: STRANGER }))

    expect(priceOf(wiring.catalog.rows())).toBe(12100)

    await wiring.onCallback(press({ updateId: 9002 }))

    expect(priceOf(wiring.catalog.rows())).toBe(14520)
    expect(wiring.versions).toHaveLength(1)
  })
})

describe('the rows come from the live catalog and never from the caller', () => {
  test('an edit whose oldPrice no longer matches the catalog is refused as stale', async () => {
    const wiring = wired([{ slug: SLUG, familySlug: 'business_cards', kind: 'sale', label: '100 tarjetas', price: ars(13000) }])

    await wiring.onCallback(press())

    expect(priceOf(wiring.catalog.rows())).toBe(13000)
    expect(wiring.versions).toBeEmpty()
    expect(wiring.held.get('edit_1')?.state).toBe('proposed')
  })

  test('a second edit prices against what the first one installed', async () => {
    const wiring = wired()

    await wiring.onCallback(press())
    wiring.held.set('edit_2', { ...proposal(), id: 'edit_2', lines: [{ slug: SLUG, familySlug: 'business_cards', label: '100 tarjetas', oldPrice: ars(14520), newPrice: ars(17424) }] })

    await wiring.onCallback(press({ proposalId: 'edit_2', updateId: 9003 }))

    expect(priceOf(wiring.catalog.rows())).toBe(17424)
    expect(wiring.versions).toHaveLength(2)
  })
})
