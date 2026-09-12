import { describe, expect, it } from 'bun:test'
import { confirmPriceEdit } from '../../src/catalog/confirm-price-edit'
import { ars } from '../../src/domain/money'
import type { PriceEditProposal } from '../../src/domain/types'

const ADMIN = '99900011'

const PROPOSED: PriceEditProposal = {
  id: 'edit_1',
  operation: { op: 'percent', direction: 'raise', rate: 0.2 },
  lines: [
    { slug: 'bc_special_100_front', label: '100 tarjetas', oldPrice: ars(12100), newPrice: ars(14520) },
  ],
  state: 'proposed',
  source: 'audio',
  mediaId: 'voice_abc',
  proposedBy: ADMIN,
  proposedAt: '2026-09-12T10:00:00.000Z',
  resolvedBy: null,
  resolvedAt: null,
}

const ROWS = [
  { slug: 'bc_special_100_front', kind: 'sale' as const, label: '100 tarjetas', price: ars(12100) },
]

function aStore(proposal: PriceEditProposal | null = PROPOSED) {
  const saved: PriceEditProposal[] = []

  return {
    saved,
    load: async (id: string) => (proposal !== null && proposal.id === id ? proposal : null),
    save: async (given: PriceEditProposal) => void saved.push(given),
  }
}

describe('confirmPriceEdit', () => {
  it('refuses a sender outside the allowlist, so a person who is not the owner moves no price', async () => {
    const store = aStore()

    const outcome = await confirmPriceEdit(
      {
        proposalId: 'edit_1',
        versionId: 'ver_1',
        senderId: '55512345',
        accepted: true,
        now: '2026-09-12T10:05:00.000Z',
      },
      { load: store.load, save: store.save, rows: ROWS, isAdmin: (id) => id === ADMIN },
    )

    expect(outcome).toEqual({ ok: false, reason: 'not_an_admin' })
    expect(store.saved).toEqual([])
  })

  it('refuses an id the store does not hold, rather than inventing a proposal', async () => {
    const store = aStore()

    const outcome = await confirmPriceEdit(
      {
        proposalId: 'edit_missing',
        versionId: 'ver_1',
        senderId: ADMIN,
        accepted: true,
        now: '2026-09-12T10:05:00.000Z',
      },
      { load: store.load, save: store.save, rows: ROWS, isAdmin: (id) => id === ADMIN },
    )

    expect(outcome).toEqual({ ok: false, reason: 'unknown_proposal' })
    expect(store.saved).toEqual([])
  })

  it('records the version with the audio that caused it when the owner accepts', async () => {
    const store = aStore()

    const outcome = await confirmPriceEdit(
      {
        proposalId: 'edit_1',
        versionId: 'ver_1',
        senderId: ADMIN,
        accepted: true,
        now: '2026-09-12T10:05:00.000Z',
      },
      { load: store.load, save: store.save, rows: ROWS, isAdmin: (id) => id === ADMIN },
    )

    if (!outcome.ok) throw new Error(`expected an applied edit, got ${outcome.reason}`)
    expect(outcome.applied.version).toEqual({
      id: 'ver_1',
      proposalId: 'edit_1',
      appliedBy: ADMIN,
      appliedAt: '2026-09-12T10:05:00.000Z',
      mediaId: 'voice_abc',
    })
    expect(outcome.applied.rows[0]?.price).toEqual(ars(14520))
    expect(store.saved).toEqual([outcome.applied.proposal])
  })
})
