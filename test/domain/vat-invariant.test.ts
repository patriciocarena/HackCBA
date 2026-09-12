import { describe, expect, test } from 'bun:test'
import { totalOf } from '../../src/domain/breakdown'
import { priceFor, type PriceForConfig } from '../../src/domain/price-for'
import type { QuoteIntent, Resolution } from '../../src/domain/types'
import { baseConfig, businessCards, catalogRows, intent, priceOf, rowFor, withVat } from '../support/catalog'

const quote = (overrides: Partial<QuoteIntent>, config: Partial<PriceForConfig> = {}): Resolution =>
  priceFor(intent(overrides), catalogRows, { ...baseConfig, ...config })

const saleRows = catalogRows.filter((row) => row.kind === 'sale')

const attributesOf = (slug: string) => rowFor(slug).attributes as Record<string, string | number>

describe('no amount leaves the engine without VAT', () => {
  test('the catalog is not empty, so the sweep below means something', () => {
    expect(saleRows.length).toBeGreaterThan(10)
  })

  test('every sale row in the catalog quotes at its net price plus VAT', () => {
    const wrong: string[] = []

    for (const row of saleRows) {
      const resolution = quote({ attributes: row.attributes })
      if (resolution.kind !== 'price') {
        wrong.push(`${row.slug}: ${resolution.kind}`)
        continue
      }

      const total = totalOf(resolution.breakdown)
      if (total !== withVat(row.price)) {
        wrong.push(`${row.slug}: got ${total}, expected ${withVat(row.price)}`)
      }
    }

    expect(wrong).toEqual([])
  })

  test('an add-on is grossed with the base, never left net', () => {
    const resolution = quote({
      attributes: attributesOf('bc_special_100_front'),
      addOns: ['lamination'],
    })

    if (resolution.kind !== 'price') throw new Error('expected a price')
    expect(totalOf(resolution.breakdown)).toBe(
      withVat(priceOf('bc_special_100_front') + priceOf('bc_addon_lamination_special_100_front')),
    )
  })

  test('the module path grosses the discounted subtotal', () => {
    const resolution = quote({
      attributes: attributesOf('bc_offset_1000_4_1'),
      size: { widthCm: 10, heightCm: 15 },
    })

    if (resolution.kind !== 'price') throw new Error('expected a price')
    expect(totalOf(resolution.breakdown)).toBe(withVat(4 * priceOf('bc_offset_1000_4_1') * 0.9))
  })

  test('the list discount path grosses what is left after the discount', () => {
    const resolution = quote(
      { attributes: attributesOf('bc_illustration300_100_front') },
      { listDiscountPolicy: { applyProvisionalIllustrationPlainDiscounts: true } },
    )

    if (resolution.kind !== 'price') throw new Error('expected a price')
    expect(totalOf(resolution.breakdown)).toBe(
      withVat(priceOf('bc_illustration300_100_front') - priceOf('bc_discount_illustration_plain_100')),
    )
  })

  test('no quote ever equals its own net price, which is what plus VAT would look like', () => {
    for (const row of saleRows) {
      const resolution = quote({ attributes: row.attributes })
      if (resolution.kind !== 'price') continue
      expect(totalOf(resolution.breakdown)).not.toBe(row.price)
    }
  })

  test('the family carries the rate and the flag, so a net list and a final list both load', () => {
    const resolution = quote({ attributes: attributesOf('bc_special_100_front') })

    if (resolution.kind !== 'price') throw new Error('expected a price')
    expect(resolution.breakdown.vatRate).toBe(businessCards.vatRate)
    expect(resolution.breakdown.vatIncluded).toBe(businessCards.vatIncluded)
  })
})
