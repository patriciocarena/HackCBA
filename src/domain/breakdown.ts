import { ars, type Ars } from './money'
import type { PriceBreakdown } from './types'

/**
 * One pass over the percentages, one multiply for VAT, one round at the very end.
 *
 * Every rate compounds on the running amount rather than being summed, which is what the list
 * says and says once, for percentages in general. A rate is signed, so a discount and a
 * surcharge are the same arithmetic and there is no branch on the kind.
 *
 * Add-ons and list discounts are amounts and join afterwards, at full price: the percentages
 * are about the job the base row prices, not about a finish someone added to it.
 */
export function totalOf(breakdown: PriceBreakdown): Ars {
  const discounted = breakdown.rates.reduce(
    (amount, rate) => amount * (1 + rate.rate),
    breakdown.base.amount * breakdown.moduleFactor,
  )

  const addOns = breakdown.addOns.reduce((total, line) => total + line.amount, 0)
  const listDiscounts = breakdown.listDiscounts.reduce((total, line) => total + line.amount, 0)
  const net = discounted + addOns - listDiscounts
  const gross = breakdown.vatIncluded ? net : net * (1 + breakdown.vatRate)

  return ars(Math.round(gross))
}
