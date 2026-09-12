import { describe, expect, it } from 'bun:test'
import { confirmPriceEdit } from '../../src/catalog/confirm-price-edit'
import { ars } from '../../src/domain/money'
import type { PriceEditProposal } from '../../src/domain/types'

const ADMIN = '99900011'
const OTHER_ADMIN = '99900022'

const PROPOSED: PriceEditProposal = {
  id: 'edit_1',
  familySlug: 'business_cards',
  operation: { op: 'percent', direction: 'raise', rate: 0.2 },
  lines: [
    { slug: 'bc_special_100_front', familySlug: 'business_cards', label: '100 tarjetas', oldPrice: ars(12100), newPrice: ars(14520) },
  ],
  state: 'proposed',
  source: 'audio',
  mediaId: 'voice_abc',
  proposedBy: OTHER_ADMIN,
  proposedAt: '2026-09-12T10:00:00.000Z',
  resolvedBy: null,
  resolvedAt: null,
}

const ROWS = [
  { slug: 'bc_special_100_front', familySlug: 'business_cards', kind: 'sale' as const, label: '100 tarjetas', price: ars(12100) },
]

const NOW = '2026-09-12T10:05:00.000Z'

const onlyTheOwner = (id: string) => id === ADMIN || id === OTHER_ADMIN

describe('the allowlist answers before anything else does', () => {
  it('denies everyone when nobody wired an allowlist', async () => {
    const store = aStore()

    const outcome = await confirmPriceEdit(
      { proposalId: 'edit_1', versionId: 'v1', senderId: ADMIN, accepted: true, now: NOW },
      { load: store.load, save: store.save, rows: ROWS },
    )

    expect(outcome).toEqual({ ok: false, reason: 'not_an_admin' })
    expect(store.saved).toHaveLength(0)
  })

  it('does not tell a stranger whether a proposal exists', async () => {
    const store = aStore(null)
    let loaded = 0

    const outcome = await confirmPriceEdit(
      { proposalId: 'edit_1', versionId: 'v1', senderId: 'a-stranger', accepted: true, now: NOW },
      {
        load: async (id) => {
          loaded += 1
          return store.load(id)
        },
        save: store.save,
        rows: ROWS,
        isAdmin: onlyTheOwner,
      },
    )

    expect(outcome).toEqual({ ok: false, reason: 'not_an_admin' })
    expect(loaded).toBe(0)
  })
})

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
      { proposalId: 'edit_1', versionId: 'ver_1', senderId: '55512345', accepted: true, now: NOW },
      { load: store.load, save: store.save, rows: ROWS, isAdmin: onlyTheOwner },
    )

    expect(outcome).toEqual({ ok: false, reason: 'not_an_admin' })
    expect(store.saved).toEqual([])
  })

  it('refuses an id the store does not hold, rather than inventing a proposal', async () => {
    const store = aStore()

    const outcome = await confirmPriceEdit(
      { proposalId: 'edit_missing', versionId: 'ver_1', senderId: ADMIN, accepted: true, now: NOW },
      { load: store.load, save: store.save, rows: ROWS, isAdmin: onlyTheOwner },
    )

    expect(outcome).toEqual({ ok: false, reason: 'unknown_proposal' })
    expect(store.saved).toEqual([])
  })

  it('records the version with the audio that caused it when the owner accepts', async () => {
    const store = aStore()

    const outcome = await confirmPriceEdit(
      { proposalId: 'edit_1', versionId: 'ver_1', senderId: ADMIN, accepted: true, now: NOW },
      { load: store.load, save: store.save, rows: ROWS, isAdmin: onlyTheOwner },
    )

    if (!outcome.ok) throw new Error(`expected an applied edit, got ${outcome.reason}`)
    if (outcome.decision !== 'applied') throw new Error('expected an applied edit, got a rejection')
    expect(outcome.applied.version).toEqual({
      id: 'ver_1',
      proposalId: 'edit_1',
      appliedBy: ADMIN,
      appliedAt: NOW,
      mediaId: 'voice_abc',
    })
    expect(outcome.applied.rows[0]?.price).toEqual(ars(14520))
    expect(store.saved).toEqual([outcome.applied.proposal])
  })

  it('leaves a refused edit rejected and moves no price, because being asked is not being applied', async () => {
    const store = aStore()

    const outcome = await confirmPriceEdit(
      { proposalId: 'edit_1', versionId: 'ver_1', senderId: ADMIN, accepted: false, now: NOW },
      { load: store.load, save: store.save, rows: ROWS, isAdmin: onlyTheOwner },
    )

    if (!outcome.ok) throw new Error(`expected a rejection, got ${outcome.reason}`)
    if (outcome.decision !== 'rejected') throw new Error('expected a rejection, got an applied edit')
    expect(outcome.rejected.state).toBe('rejected')
    expect(outcome.rejected.resolvedBy).toBe(ADMIN)
    expect(outcome.rejected.resolvedAt).toBe(NOW)
    expect(store.saved).toEqual([outcome.rejected])
    expect(ROWS[0]?.price).toEqual(ars(12100))
  })

  it('refuses to resolve an edit that is already resolved, whichever way the owner answers', async () => {
    for (const state of ['applied', 'rejected'] as const) {
      for (const accepted of [true, false]) {
        const store = aStore({ ...PROPOSED, state })

        const outcome = await confirmPriceEdit(
          { proposalId: 'edit_1', versionId: 'ver_1', senderId: ADMIN, accepted, now: NOW },
          { load: store.load, save: store.save, rows: ROWS, isAdmin: onlyTheOwner },
        )

        expect(outcome).toEqual({ ok: false, reason: 'not_proposed' })
        expect(store.saved).toEqual([])
      }
    }
  })

  it('refuses a resolution stamped with something that is not a time, whichever way the owner answers', async () => {
    for (const accepted of [true, false]) {
      const store = aStore()

      const outcome = await confirmPriceEdit(
        { proposalId: 'edit_1', versionId: 'ver_1', senderId: ADMIN, accepted, now: 'ayer' },
        { load: store.load, save: store.save, rows: ROWS, isAdmin: onlyTheOwner },
      )

      expect(outcome).toEqual({ ok: false, reason: 'not_a_time' })
      expect(store.saved).toEqual([])
    }
  })

  it('refuses an edit whose row moved since it was proposed, so a stale diff is never applied', async () => {
    const store = aStore()
    const moved = [{ ...ROWS[0]!, price: ars(13000) }]

    const outcome = await confirmPriceEdit(
      { proposalId: 'edit_1', versionId: 'ver_1', senderId: ADMIN, accepted: true, now: NOW },
      { load: store.load, save: store.save, rows: moved, isAdmin: onlyTheOwner },
    )

    expect(outcome).toEqual({ ok: false, reason: 'stale' })
    expect(store.saved).toEqual([])
  })
})
