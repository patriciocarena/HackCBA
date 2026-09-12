import { describe, expect, test } from 'bun:test'
import { totalOf } from '../../src/domain/breakdown'
import { ars } from '../../src/domain/money'
import type { BreakdownLine, BreakdownRate, PriceBreakdown } from '../../src/domain/types'

function line(slug: string, amount: number): BreakdownLine {
  return { slug, label: slug, amount: ars(amount) }
}

function surcharge(rate: number): BreakdownRate {
  return { kind: 'surcharge', rate }
}

function breakdown(overrides: Partial<PriceBreakdown> = {}): PriceBreakdown {
  return {
    base: line('bc_special_100_front', 12100),
    moduleFactor: 1,
    rates: [],
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
          rates: [{ kind: 'module_discount', rate: -0.1 }],
        }),
      ),
    ).toBe(ars(162000))
  })

  test('module discounts compound, they are not summed', () => {
    const compounded = totalOf(
      breakdown({
        base: line('base', 100000),
        moduleFactor: 1,
        rates: [
          { kind: 'module_discount', rate: -0.1 },
          { kind: 'module_discount', rate: -0.15 },
        ],
      }),
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

/**
 * The list states the compounding law once, for percentages in general, and not for module
 * discounts in particular:
 *
 *   "Porcentajes. Cuando se aplica más de uno, se aplican uno sobre otro, no se suman." (L72)
 *
 * So `moduleDiscountRates` was the right arithmetic under a name that claimed too little. It is
 * one ordered list of rates now, and a module discount is one kind of entry in it. Facturas has
 * no module at all and three surcharge rates.
 *
 * Multiplication commutes, so the order never changes the total. The kind is there so the
 * customer sentence about modules can still be built and the work order can print `+40%`.
 */
describe('every percentage compounds in one pass', () => {
  test('a surcharge rate multiplies the base', () => {
    expect(totalOf(breakdown({ base: line('fa_1', 26000), rates: [surcharge(0.4)], vatIncluded: true }))).toBe(
      ars(36400),
    )
  })

  test('two surcharges apply one on the other and are never summed', () => {
    const both = breakdown({ base: line('fa_1', 26000), rates: [surcharge(0.4), surcharge(0.6)], vatIncluded: true })

    expect(totalOf(both)).toBe(ars(58240))
    // Summed would be 26000 x 2.0 = 52000, which is what the list says not to do.
    expect(totalOf(both)).not.toBe(ars(52000))
  })

  test('a discount and a surcharge compound in either order, to the same total', () => {
    const rates = [{ kind: 'quantity_discount' as const, rate: -0.1 }, surcharge(0.25)]
    const one = breakdown({ base: line('ct_1', 20000), rates, vatIncluded: true })
    const other = breakdown({ base: line('ct_1', 20000), rates: [...rates].reverse(), vatIncluded: true })

    expect(totalOf(one)).toBe(ars(22500))
    expect(totalOf(other)).toBe(totalOf(one))
  })

  test('the module discount is one kind of rate and still discounts', () => {
    expect(
      totalOf(breakdown({ moduleFactor: 4, rates: [{ kind: 'module_discount', rate: -0.1 }], vatIncluded: true })),
    ).toBe(ars(43560))
  })
})
