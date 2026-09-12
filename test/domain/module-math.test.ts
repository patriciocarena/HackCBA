import { describe, expect, test } from 'bun:test'
import { baseConfig, catalogRows } from '../../src/catalog/business-cards'
import { totalOf } from '../../src/domain/breakdown'
import { priceFor, type PriceForConfig } from '../../src/domain/price-for'
import { quoteText } from '../../src/domain/quote-text'
import type { PriceBreakdown, QuoteIntent, Resolution, Size } from '../../src/domain/types'
import { intent, OFFSET_1000, priceOf, withVat } from '../support/fixtures'

const quote = (overrides: Partial<QuoteIntent>, config: PriceForConfig = baseConfig): Resolution =>
  priceFor(intent({ attributes: OFFSET_1000, ...overrides }), catalogRows, config)

function pricedAt(size: Size, overrides: Partial<QuoteIntent> = {}): PriceBreakdown {
  const resolution = quote({ size, ...overrides })
  if (resolution.kind !== 'price') throw new Error('expected a price')
  return resolution.breakdown
}

const standardPrice = priceOf('bc_offset_1000_4_1')

describe('module math, the three examples the owner gave', () => {
  test('a 15 x 5 cm card is 2 modules and takes no discount', () => {
    // 75 cm2 / 42.5 = 1.76 -> 2 modules. The discount bracket starts at 3.
    const breakdown = pricedAt({ widthCm: 15, heightCm: 5 })

    expect(breakdown.moduleFactor).toBe(2)
    expect(breakdown.moduleDiscountRates).toEqual([])
    expect(totalOf(breakdown)).toBe(withVat(2 * standardPrice))
  })

  test('a 10 x 15 cm large card is 4 modules and takes the 10 percent bracket', () => {
    // 150 / 42.5 = 3.53 -> 4 modules, which sits in the 3 to 5 bracket at 10 percent.
    const breakdown = pricedAt({ widthCm: 10, heightCm: 15 })

    expect(breakdown.moduleFactor).toBe(4)
    expect(breakdown.moduleDiscountRates).toEqual([0.1])
    expect(totalOf(breakdown)).toBe(withVat(4 * standardPrice * 0.9))
  })

  test('the formula generalises: an A4 piece against a 150 cm2 module is 5 modules', () => {
    // 623.7 / 150 = 4.16 -> 5 modules. Prices are not loaded for this family, but the count holds.
    const flyers: PriceForConfig = {
      ...baseConfig,
      family: { ...baseConfig.family, module: { widthCm: 15, heightCm: 10 } },
    }
    const resolution = quote({ size: { widthCm: 21, heightCm: 29.7 } }, flyers)

    if (resolution.kind !== 'price') throw new Error('expected a price')
    expect(resolution.breakdown.moduleFactor).toBe(5)
  })

  test('a piece that fits inside one module is priced as the plain row', () => {
    const breakdown = pricedAt({ widthCm: 8.5, heightCm: 5 })

    expect(breakdown.moduleFactor).toBe(1)
    expect(totalOf(breakdown)).toBe(withVat(standardPrice))
  })

  test('a size of exactly one module answers the same as naming no size at all', () => {
    const sized = pricedAt({ widthCm: 8.5, heightCm: 5 })
    const plain = quote({})

    if (plain.kind !== 'price') throw new Error('expected a price')
    expect(totalOf(sized)).toBe(totalOf(plain.breakdown))
  })
})

describe('the module discount reaches the modules only', () => {
  test('a family wide add-on is added at full price, after the discount', () => {
    // 4 modules x 45.000 = 180.000, less 10% = 162.000, plus the 1.600 cut at full price.
    // Discounting the add-on too would give 197.762, which is the wrong answer.
    const breakdown = pricedAt({ widthCm: 10, heightCm: 15 }, { addOns: ['extra_cut'] })

    expect(totalOf(breakdown)).toBe(withVat(4 * standardPrice * 0.9 + priceOf('bc_addon_extra_cut')))
  })
})

describe('what the customer reads about modules', () => {
  const text = () => quoteText(pricedAt({ widthCm: 10, heightCm: 15 }), 15)

  test('says the module count, discount, amount and validity', () => {
    expect(text()).toContain('4 módulos')
    expect(text()).toContain('10%')
    expect(text()).toContain('$162.000')
    expect(text()).toContain('15 días')
  })

  test('does not read like a spreadsheet', () => {
    for (const noise of ['cm²', '42.5', '42,5', ' / ', 'neto', '3.53']) {
      expect(text()).not.toContain(noise)
    }
    expect(text().length).toBeLessThan(220)
  })

  test('never leaks an internal catalog label into the chat', () => {
    expect(text()).not.toContain('Tarjetas full color')
    expect(text()).not.toContain('escala de grises')
  })

  test('the arithmetic stays in the breakdown, where a human can check it', () => {
    const breakdown = pricedAt({ widthCm: 10, heightCm: 15 })

    expect(breakdown.base.slug).toBe('bc_offset_1000_4_1')
    expect(breakdown.base.amount).toBe(standardPrice)
    expect(breakdown.moduleFactor).toBe(4)
    expect(breakdown.moduleDiscountRates).toEqual([0.1])
  })
})

describe('a piece that is no longer a business card', () => {
  test('a 500 x 300 cm piece is refused, not quoted', () => {
    // 3530 modules is a billboard. Quoting it confidently is the failure this project prevents.
    expect(quote({ size: { widthCm: 500, heightCm: 300 } }).kind).toBe('escalate')
  })

  test('a piece past the module ceiling is refused', () => {
    // 50 x 50 cm is 2500 cm2, which is 59 modules.
    expect(quote({ size: { widthCm: 50, heightCm: 50 } }).kind).toBe('escalate')
  })

  test('a large but plausible piece still quotes', () => {
    // 40 x 40 cm is 1600 cm2, which is 38 modules, under the ceiling.
    expect(quote({ size: { widthCm: 40, heightCm: 40 } }).kind).toBe('price')
  })

  test('a size with no length in it is refused rather than divided by zero', () => {
    expect(quote({ size: { widthCm: 0, heightCm: 5 } }).kind).toBe('escalate')
  })
})
