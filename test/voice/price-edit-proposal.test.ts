import { describe, expect, it } from 'bun:test'
import { proposePriceEdit } from '@/voice/price-edit-proposal'
import type { PriceEditIntent } from '@/voice/price-edit-intent'
import { businessCards, catalogRows } from '@/catalog/business-cards'
import type { CatalogRow } from '@/domain/price-for'

const CONTEXT = {
  media: { kind: 'voice', id: 'voice-1' } as const,
  proposedBy: '7',
  proposedAt: '2026-09-12T13:40:00.000Z',
}

function raise(percent: number, target = 'las tarjetas'): PriceEditIntent {
  return { kind: 'edit', target, change: { kind: 'percent', direction: 'raise', value: percent } }
}

function propose(intent: PriceEditIntent) {
  return proposePriceEdit({ intent, rows: catalogRows, family: businessCards, ...CONTEXT })
}

describe('proposePriceEdit', () => {
  it('proposes a raise over every sale row the target names, applied but unwritten', () => {
    const result = propose(raise(20))

    expect(result.ok).toBeTrue()
    if (!result.ok) return

    expect(result.proposal).toMatchObject({
      operation: { op: 'percent', direction: 'raise', rate: 0.2 },
      state: 'proposed',
      source: 'audio',
      mediaId: 'voice-1',
      proposedBy: '7',
      proposedAt: '2026-09-12T13:40:00.000Z',
      resolvedBy: null,
      resolvedAt: null,
    })
    expect(result.proposal.id).not.toBeEmpty()

    const line = result.proposal.lines.find((candidate) => candidate.slug === 'bc_special_100_front')
    expect(line).toMatchObject({ oldPrice: 12100, newPrice: 14520 })
  })
})

describe('proposePriceEdit, when the target names nothing loaded', () => {
  it('refuses rather than proposing a raise over a list the owner did not mean', () => {
    const result = propose(raise(20, 'los folletos'))

    expect(result).toMatchObject({ ok: false, review: { reason: 'no_match' } })
    expect(result.ok || result.review.detail).toContain('is not a family in the list')
  })

  it('refuses when the family it named carries no sale row, because that edit changes nothing', () => {
    const result = proposePriceEdit({
      intent: raise(20),
      rows: catalogRows.filter((row: CatalogRow) => row.kind !== 'sale'),
      family: businessCards,
      ...CONTEXT,
    })

    expect(result).toMatchObject({ ok: false, review: { reason: 'no_match' } })
    expect(result.ok || result.review.detail).toContain('has no price to change')
  })

  it('reads past accents and articles, because speech to text spells the family loosely', () => {
    for (const target of ['las tarjetas', 'TARJETAS personales', 'tarjétas']) {
      expect(propose(raise(20, target)).ok).toBeTrue()
    }
  })
})

describe('proposePriceEdit, on an amount it was never given', () => {
  it('hands back the review the extractor raised instead of filling the amount in', () => {
    const result = proposePriceEdit({
      intent: { kind: 'review', reason: 'ambiguous', detail: 'no amount was dictated' },
      rows: catalogRows,
      family: businessCards,
      ...CONTEXT,
    })

    expect(result).toMatchObject({ ok: false, review: { reason: 'ambiguous', detail: 'no amount was dictated' } })
  })

  it('refuses an absolute amount that is not whole pesos, because rounding it would invent one', () => {
    for (const amount of [15000.5, -1, Number.MAX_SAFE_INTEGER + 2]) {
      const intent: PriceEditIntent = { kind: 'edit', target: 'las tarjetas', change: { kind: 'absolute', amount } }

      expect(propose(intent)).toMatchObject({ ok: false, review: { reason: 'ambiguous' } })
    }
  })
})

describe('proposePriceEdit, against the list it reads', () => {
  it('changes no price, because the proposal is the whole of what it writes', () => {
    const before = structuredClone(catalogRows)

    propose(raise(20))
    propose({ kind: 'edit', target: 'las tarjetas', change: { kind: 'absolute', amount: 1 } })

    expect(catalogRows).toEqual(before)
  })

  it('lowers and sets, not only raises', () => {
    const lower = propose({
      kind: 'edit',
      target: 'las tarjetas',
      change: { kind: 'percent', direction: 'lower', value: 10 },
    })
    const absolute = propose({ kind: 'edit', target: 'las tarjetas', change: { kind: 'absolute', amount: 15000 } })

    expect(lower.ok && lower.proposal.lines[0]).toMatchObject({ oldPrice: 12100, newPrice: 10890 })
    expect(absolute.ok && absolute.proposal.lines[0]).toMatchObject({ oldPrice: 12100, newPrice: 15000 })
  })
})

describe('proposePriceEdit, on where the edit came from', () => {
  it('reads the source off the media rather than assuming the only one built so far', () => {
    const audio = propose(raise(20))
    const photo = proposePriceEdit({
      intent: raise(20),
      rows: catalogRows,
      family: businessCards,
      ...CONTEXT,
      media: { kind: 'photo', id: 'photo-1' },
    })

    expect(audio.ok && audio.proposal).toMatchObject({ source: 'audio', mediaId: 'voice-1' })
    expect(photo.ok && photo.proposal).toMatchObject({ source: 'photo', mediaId: 'photo-1' })
  })

  it('refuses a proposedAt C7 would refuse at apply time', () => {
    for (const proposedAt of ['', 'ayer', '2026-13-45T99:00:00Z']) {
      const result = proposePriceEdit({
        intent: raise(20),
        rows: catalogRows,
        family: businessCards,
        ...CONTEXT,
        proposedAt,
      })

      expect(result).toMatchObject({ ok: false, review: { reason: 'ambiguous' } })
    }
  })
})

describe('proposePriceEdit, on an amount no producer should get past it', () => {
  it('refuses a percent beyond the ceiling, whichever producer built the intent', () => {
    for (const value of [101, 1e6]) {
      const intent: PriceEditIntent = {
        kind: 'edit',
        target: 'las tarjetas',
        change: { kind: 'percent', direction: 'raise', value },
      }

      expect(propose(intent)).toMatchObject({ ok: false, review: { reason: 'ambiguous' } })
    }
  })

  it('refuses a free price, because zero pesos is a whole number of them', () => {
    for (const change of [
      { kind: 'absolute', amount: 0 } as const,
      { kind: 'percent', direction: 'raise', value: 0 } as const,
    ]) {
      expect(propose({ kind: 'edit', target: 'las tarjetas', change })).toMatchObject({
        ok: false,
        review: { reason: 'ambiguous' },
      })
    }
  })
})
