import { describe, expect, test } from 'bun:test'
import { totalOf } from '../../src/domain/breakdown'
import { ars } from '../../src/domain/money'
import { priceFor, type PriceForConfig } from '../../src/domain/price-for'
import type { QuoteIntent, Resolution } from '../../src/domain/types'
import { baseConfig, businessCards, catalogRows, intent, priceOf, rowFor, withVat } from '../support/catalog'

const quote = (overrides: Partial<QuoteIntent>, config: Partial<PriceForConfig> = {}): Resolution =>
  priceFor(intent(overrides), catalogRows, { ...baseConfig, ...config })

const saleRows = catalogRows.filter((row) => row.kind === 'sale')
const attributesOf = (slug: string) => rowFor(slug).attributes as Record<string, string | number>

function totalFor(overrides: Partial<QuoteIntent>, config: Partial<PriceForConfig> = {}): number {
  const resolution = quote(overrides, config)
  if (resolution.kind !== 'price') throw new Error(`expected a price, got ${resolution.kind}`)
  return totalOf(resolution.breakdown)
}

/**
 * B6, as ADR 0003 restated it: no amount leaves the engine that is not the final number.
 *
 * The list the shop publishes already includes tax. Grossing it up again quotes 21% over the
 * owner's own price, in every conversation, and fails at the counter where the customer
 * notices. The flag stays on the family so a net list can still be loaded.
 */
describe('no amount leaves the engine that is not the final number', () => {
  test('the catalog is not empty, so the sweep below means something', () => {
    expect(saleRows.length).toBeGreaterThan(10)
  })

  test('the loaded family says its list is already final', () => {
    expect(businessCards.vatIncluded).toBe(true)
    expect(businessCards.vatRate).toBe(0.21)
  })

  test('every sale row quotes the amount the owner typed, unchanged', () => {
    const wrong: string[] = []

    for (const row of saleRows) {
      const resolution = quote({ attributes: row.attributes })
      if (resolution.kind !== 'price') {
        wrong.push(`${row.slug}: ${resolution.kind}`)
        continue
      }

      const total = totalOf(resolution.breakdown)
      if (total !== row.price) {
        wrong.push(`${row.slug}: got ${total}, expected ${row.price}`)
      }
    }

    expect(wrong).toEqual([])
  })

  test('no quote is its own price plus 21%, which is what the old bug looked like', () => {
    for (const row of saleRows) {
      expect(totalFor({ attributes: row.attributes })).not.toBe(Math.round(row.price * 1.21))
    }
  })

  test('an add-on is added at the price the list carries, not grossed again', () => {
    expect(totalFor({ attributes: attributesOf('bc_special_100_front'), addOns: ['lamination'] })).toBe(
      priceOf('bc_special_100_front') + priceOf('bc_addon_lamination_special_100_front'),
    )
  })

  test('the module path multiplies and discounts a final amount', () => {
    expect(
      totalFor({
        attributes: attributesOf('bc_offset_1000_4_1'),
        size: { widthCm: 10, heightCm: 15 },
      }),
    ).toBe(Math.round(4 * priceOf('bc_offset_1000_4_1') * 0.9))
  })

  test('a list discount comes off the final amount', () => {
    expect(
      totalFor({ attributes: attributesOf('bc_illustration300_100_front') }, {
        listDiscountPolicy: { applyProvisionalIllustrationPlainDiscounts: true },
      }),
    ).toBe(priceOf('bc_illustration300_100_front') - priceOf('bc_discount_illustration_plain_100'))
  })

  test('a family whose list really is net is still grossed up, once, at the end', () => {
    // The flag is what makes the decision reversible. Twenty one families are still unloaded
    // and some of them may well be quoted net to businesses.
    const netFamily = { ...baseConfig, family: { ...businessCards, vatIncluded: false } }

    expect(totalFor({ attributes: attributesOf('bc_special_100_front') }, netFamily)).toBe(
      Math.round(priceOf('bc_special_100_front') * 1.21),
    )
  })

  test('the helper every suite prices against follows the family, not a constant', () => {
    expect(withVat(12_100)).toBe(ars(12_100))
  })
})
