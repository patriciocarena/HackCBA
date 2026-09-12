import { describe, expect, it } from 'bun:test'
import { applyPriceEdit } from '../../src/catalog/apply-edit'
import { baseConfig, catalogRows } from '../../src/catalog/business-cards'
import { totalOf } from '../../src/domain/breakdown'
import { ars } from '../../src/domain/money'
import { acceptQuote, quoteFrom } from '../../src/domain/order'
import { priceFor } from '../../src/domain/price-for'
import { conversationId, type PriceEditProposal } from '../../src/domain/types'
import { SPECIAL_100, intent, priceOf, withVat } from '../support/fixtures'

const BY = { kind: 'person', id: '42' } as const
const QUOTED_AT = '2026-09-12T10:00:00.000Z'
const APPLIED_AT = '2026-09-12T11:00:00.000Z'

function raiseTwentyPercent(slug: string): PriceEditProposal {
  const oldPrice = priceOf(slug)

  return {
    id: 'edit_1',
    operation: { op: 'percent', direction: 'raise', rate: 0.2 },
    lines: [{ slug, label: 'tarjetas', oldPrice, newPrice: ars(Math.round(oldPrice * 1.2)) }],
    state: 'proposed',
    source: 'audio',
    mediaId: 'voice_abc',
    proposedBy: '42',
    proposedAt: QUOTED_AT,
    resolvedBy: null,
    resolvedAt: null,
  }
}

describe('applying an edit never moves a price already quoted', () => {
  it('the order holds the old amount while new quotes get the new one', () => {
    const resolution = priceFor(intent({ attributes: SPECIAL_100 }), catalogRows, baseConfig)
    if (resolution.kind !== 'price') throw new Error(resolution.kind)

    const quote = quoteFrom({
      id: 'q1',
      conversationId: conversationId('telegram', '7', 'customer'),
      resolution,
      now: QUOTED_AT,
    })
    if (!quote.ok) throw new Error(quote.reason)

    const accepted = acceptQuote(quote.quote, { id: 'o1', now: QUOTED_AT })
    if (!accepted.ok) throw new Error(accepted.reason)
    expect(totalOf(accepted.order.breakdown)).toBe(withVat(12_100))

    const applied = applyPriceEdit(raiseTwentyPercent('bc_special_100_front'), catalogRows, {
      id: 'ver_1',
      by: BY,
      now: APPLIED_AT,
    })
    if (!applied.ok) throw new Error(applied.reason)

    expect(totalOf(accepted.order.breakdown)).toBe(withVat(12_100))

    const after = priceFor(intent({ attributes: SPECIAL_100 }), applied.applied.rows, baseConfig)
    if (after.kind !== 'price') throw new Error(after.kind)
    expect(totalOf(after.breakdown)).toBe(withVat(14_520))
  })

  it('the catalog the edit was applied against is left untouched', () => {
    const before = priceOf('bc_special_100_front')

    const applied = applyPriceEdit(raiseTwentyPercent('bc_special_100_front'), catalogRows, {
      id: 'ver_1',
      by: BY,
      now: APPLIED_AT,
    })
    if (!applied.ok) throw new Error(applied.reason)

    expect(priceOf('bc_special_100_front')).toBe(before)
  })
})
