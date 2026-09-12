import { describe, expect, it } from 'bun:test'
import { applyPriceEdit } from '../../src/catalog/apply-edit'
import { ars } from '../../src/domain/money'
import type { PriceEditProposal } from '../../src/domain/types'

const PROPOSED: PriceEditProposal = {
  id: 'edit_1',
  operation: { op: 'percent', direction: 'raise', rate: 0.2 },
  lines: [
    { slug: 'bc_special_100_front', label: '100 tarjetas', oldPrice: ars(12100), newPrice: ars(14520) },
  ],
  state: 'proposed',
  source: 'audio',
  mediaId: 'voice_abc',
  proposedBy: '42',
  proposedAt: '2026-09-12T10:00:00.000Z',
  resolvedBy: null,
  resolvedAt: null,
}

const ROWS = [
  { slug: 'bc_special_100_front', kind: 'sale' as const, label: '100 tarjetas', price: ars(12100) },
]

describe('applyPriceEdit', () => {
  it('a person applying a proposal resolves it, naming who and when', () => {
    const outcome = applyPriceEdit(PROPOSED, ROWS, {
      by: { kind: 'person', id: '42' },
      now: '2026-09-12T10:05:00.000Z',
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(outcome.applied.proposal.state).toBe('applied')
    expect(outcome.applied.proposal.resolvedBy).toBe('42')
    expect(outcome.applied.proposal.resolvedAt).toBe('2026-09-12T10:05:00.000Z')
  })

  it('the agent cannot apply an edit on its own', () => {
    const outcome = applyPriceEdit(PROPOSED, ROWS, {
      by: { kind: 'agent' },
      now: '2026-09-12T10:05:00.000Z',
    })

    expect(outcome).toEqual({ ok: false, reason: 'not_a_person' })
  })

  it('a proposal already resolved is not applied a second time', () => {
    for (const state of ['applied', 'rejected'] as const) {
      const outcome = applyPriceEdit({ ...PROPOSED, state }, ROWS, {
        by: { kind: 'person', id: '42' },
        now: '2026-09-12T10:05:00.000Z',
      })

      expect(outcome).toEqual({ ok: false, reason: 'not_proposed' })
    }
  })

  it('a time nobody can read is refused, not turned into an Invalid Date', () => {
    const outcome = applyPriceEdit(PROPOSED, ROWS, {
      by: { kind: 'person', id: '42' },
      now: 'yesterday',
    })

    expect(outcome).toEqual({ ok: false, reason: 'not_a_time' })
  })
})
