import { ars, type Ars } from './money'
import type { PriceBreakdown } from './types'

export function totalOf(breakdown: PriceBreakdown): Ars {
  const discounted = breakdown.moduleDiscountRates.reduce(
    (amount, rate) => amount * (1 - rate),
    breakdown.base.amount * breakdown.moduleFactor,
  )

  const addOns = breakdown.addOns.reduce((total, line) => total + line.amount, 0)
  const listDiscounts = breakdown.listDiscounts.reduce((total, line) => total + line.amount, 0)
  const net = discounted + addOns - listDiscounts
  const gross = breakdown.vatIncluded ? net : net * (1 + breakdown.vatRate)

  return ars(Math.round(gross))
}
