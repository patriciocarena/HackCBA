import { describe, expect, test } from 'bun:test'
import { totalOf } from '../../src/domain/breakdown'
import { ars } from '../../src/domain/money'
import type { BreakdownLine, PriceBreakdown } from '../../src/domain/types'

function line(slug: string, amount: number): BreakdownLine {
  return { slug, label: slug, amount: ars(amount) }
}

function breakdown(overrides: Partial<PriceBreakdown> = {}): PriceBreakdown {
  return {
    base: line('bc_special_100_front', 12100),
    moduleFactor: 1,
    moduleDiscountRates: [],
    addOns: [],
    listDiscounts: [],
    vatRate: 0.21,
    vatIncluded: true,
    ...overrides,
  }
}

describe('totalOf', () => {
  test('a plain row is its own price, because the list is already final', () => {
    expect(totalOf(breakdown())).toBe(ars(12100))
  })

  test('an add-on adds to the base', () => {
    expect(totalOf(breakdown({ addOns: [line('bc_addon_lamination_special_100_front', 5100)] }))).toBe(
      ars(17200),
    )
  })

  test('a list discount subtracts from the base', () => {
    expect(
      totalOf(
        breakdown({
          base: line('bc_illustration300_100_front', 10300),
          listDiscounts: [line('bc_discount_illustration_plain_100', 1800)],
        }),
      ),
    ).toBe(ars(8500))
  })

  test('modules multiply the base and the discount applies after the multiplication', () => {
    expect(
      totalOf(
        breakdown({
          base: line('bc_offset_1000_4_1', 45000),
          moduleFactor: 4,
          moduleDiscountRates: [0.1],
        }),
      ),
    ).toBe(ars(162000))
  })

  test('module discounts compound, they are not summed', () => {
    const compounded = totalOf(
      breakdown({ base: line('base', 100000), moduleFactor: 1, moduleDiscountRates: [0.1, 0.15] }),
    )

    expect(compounded).toBe(ars(76500))
    expect(compounded).not.toBe(ars(75000))
  })

  test('an add-on does not multiply by the module count', () => {
    expect(
      totalOf(
        breakdown({
          base: line('base', 45000),
          moduleFactor: 4,
          addOns: [line('bc_addon_extra_cut', 1600)],
        }),
      ),
    ).toBe(ars(181600))
  })

  test('a net list is grossed up, and rounded once at the end', () => {
    expect(totalOf(breakdown({ vatIncluded: false }))).toBe(ars(14641))
  })

  test('a net list rounds the whole expression, not each line', () => {
    expect(
      totalOf(
        breakdown({
          base: line('base', 10300),
          listDiscounts: [line('discount', 1800)],
          vatIncluded: false,
        }),
      ),
    ).toBe(ars(10285))
  })

  test('the total never goes below zero', () => {
    expect(() => totalOf(breakdown({ listDiscounts: [line('discount', 99999)] }))).toThrow(
      'is not a whole number of pesos',
    )
  })
})
