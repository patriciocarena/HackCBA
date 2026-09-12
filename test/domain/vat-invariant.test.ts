import { describe, expect, test } from 'bun:test'
import { baseConfig, businessCards, catalogRows } from '../../src/catalog/business-cards'
import { totalOf } from '../../src/domain/breakdown'
import { ars } from '../../src/domain/money'
import { priceFor, type PriceForConfig } from '../../src/domain/price-for'
import type { QuoteIntent, Resolution } from '../../src/domain/types'
import { intent, priceOf, rowFor, withVat } from '../support/fixtures'

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
 * B6, as ADR 0020 restated it: no amount leaves the engine that is not the final number.
 *
 * The rule never changed. Which number it is did. ADR 0003 read the country instead of the
 * document and set the cards list to VAT included; the list Javier closed says twice that it
 * does not include it. So a List price is what he typed and a Final price is what the customer
 * pays, and the whole distance between them is one multiply at the end of `totalOf`.
 *
 * This file was written to prove the opposite premise, and every assertion in it passed. That
 * is the thing worth remembering about it: a suite can be green and 21% under the shop's own
 * price in every conversation.
 */
describe('no amount leaves the engine that is not the final number', () => {
  test('the catalog is not empty, so the sweep below means something', () => {
    expect(saleRows.length).toBeGreaterThan(10)
  })

  test('the loaded family says its list is net', () => {
    expect(businessCards.vatIncluded).toBe(false)
    expect(businessCards.vatRate).toBe(0.21)
  })

  test('every sale row quotes its list amount grossed up once', () => {
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

  /**
   * The failure this file exists to catch, pointed the other way round. Quoting a net list as
   * if it were final is the bug that was live until ADR 0020 was applied, and it is silent:
   * the amount looks like the one in the list because it is the one in the list.
   */
  test('no quote is its own list price, which is what the old bug looked like', () => {
    for (const row of saleRows) {
      expect(totalFor({ attributes: row.attributes })).not.toBe(row.price)
    }
  })

  test('VAT is applied once to the whole net, so an add-on is not grossed on its own', () => {
    const net = priceOf('bc_special_100_front') + priceOf('bc_addon_lamination_special_100_front')

    expect(totalFor({ attributes: attributesOf('bc_special_100_front'), addOns: ['lamination'] })).toBe(
      withVat(net),
    )
  })

  test('the module path multiplies and discounts the net, then grosses up', () => {
    expect(
      totalFor({
        attributes: attributesOf('bc_offset_1000_4_1'),
        size: { widthCm: 10, heightCm: 15 },
      }),
    ).toBe(withVat(4 * priceOf('bc_offset_1000_4_1') * 0.9))
  })

  test('a list discount comes off the net before VAT, not off the final amount', () => {
    const net = priceOf('bc_illustration300_100_front') - priceOf('bc_discount_illustration_plain_100')

    expect(
      totalFor({ attributes: attributesOf('bc_illustration300_100_front') }, {
        listDiscountPolicy: { applyProvisionalDiscounts: true },
      }),
    ).toBe(withVat(net))
  })

  /**
   * The flag is still what makes this reversible, and it is still worth a test, because a
   * family whose list really is final is the case the parser would read off a different
   * header. `vatStatement` throws rather than default, so no family can arrive with it guessed.
   */
  test('a family whose list really is final states the amount unchanged', () => {
    const finalList = { ...baseConfig, family: { ...businessCards, vatIncluded: true } }

    expect(totalFor({ attributes: attributesOf('bc_special_100_front') }, finalList)).toBe(
      priceOf('bc_special_100_front'),
    )
  })

  test('the helper every suite prices against follows the family, not a constant', () => {
    expect(withVat(12_100)).toBe(ars(14_641))
  })
})
