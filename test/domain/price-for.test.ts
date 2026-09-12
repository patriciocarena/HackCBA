import { describe, expect, test } from 'bun:test'
import { baseConfig, businessCards, catalogRows } from '../../src/catalog/business-cards'
import { totalOf } from '../../src/domain/breakdown'
import { ars } from '../../src/domain/money'
import {
  priceFor,
  type CatalogRow,
  type PriceForConfig,
} from '../../src/domain/price-for'
import type { QuoteIntent, Resolution } from '../../src/domain/types'
import { intent, OFFSET_1000, priceOf, rowFor, SPECIAL_100, withVat } from '../support/fixtures'

function quote(
  overrides: Partial<QuoteIntent>,
  rows: CatalogRow[] = catalogRows,
  config: PriceForConfig = baseConfig,
): Resolution {
  return priceFor(intent(overrides), rows, config)
}

function expectPrice(resolution: Resolution, amount: number, slug: string) {
  expect(resolution.kind).toBe('price')
  if (resolution.kind !== 'price') throw new Error('expected a price')
  expect(totalOf(resolution.breakdown)).toBe(ars(amount))
  expect(resolution.breakdown.base.slug).toBe(slug)
}

function expectEscalation(resolution: Resolution, reason: string, detail: string) {
  expect(resolution.kind).toBe('escalate')
  if (resolution.kind !== 'escalate') throw new Error('expected an escalation')
  expect(resolution.reason).toBe(reason as never)
  expect(resolution.detail).toBe(detail)
}

describe('priceFor', () => {
  test('case 1: exact match for 1000 illustration 350g colour front and grayscale back', () => {
    const resolution = quote({ attributes: OFFSET_1000 })

    expectPrice(resolution, withVat(priceOf('bc_offset_1000_4_1')), 'bc_offset_1000_4_1')
    if (resolution.kind !== 'price') return
    expect(resolution.validityDays).toBe(15)
  })

  test('case 2: exact match for 100 special paper front only', () => {
    const resolution = quote({ attributes: SPECIAL_100 })

    expectPrice(resolution, withVat(priceOf('bc_special_100_front')), 'bc_special_100_front')
  })

  test('case 3: 700 cards are not interpolated or bracket matched', () => {
    const resolution = quote({ attributes: { ...OFFSET_1000, quantity: 700 } })

    expectEscalation(resolution, 'unsupported_quantity', 'te delego con un humano')
  })

  test('case 4: 1500 cards escalate because the quantity is absent from the list', () => {
    const resolution = quote({ attributes: { ...OFFSET_1000, quantity: 1500 } })

    expectEscalation(resolution, 'unsupported_quantity', 'te delego con un humano')
  })

  test('case 5: missing paper, sides and finish are asked in ask_order', () => {
    const resolution = quote({ attributes: { quantity: 1000 } })

    expect(resolution.kind).toBe('ask')
    if (resolution.kind !== 'ask') return
    expect(resolution.missing).toEqual(['paper', 'sides', 'finish'])
  })

  test('case 6: a known paper is not asked again', () => {
    const resolution = quote({ attributes: { quantity: 1000, paper: 'illustration_350' } })

    expect(resolution.kind).toBe('ask')
    if (resolution.kind !== 'ask') return
    expect(resolution.missing).toEqual(['sides', 'finish'])
  })

  test('case 7: one attribute still missing is still an ask, and the turn decides when to stop', () => {
    const resolution = quote({
      attributes: {
        quantity: 1000,
        paper: 'illustration_350',
        sides: 'front_color_back_grayscale',
      },
    })

    expect(resolution.kind).toBe('ask')
    if (resolution.kind !== 'ask') return
    expect(resolution.missing).toEqual(['finish'])
  })

  test('case 8: card 15 x 5 cm prices as 2 modules with no discount', () => {
    const resolution = quote({ attributes: OFFSET_1000, size: { widthCm: 15, heightCm: 5 } })

    expectPrice(resolution, withVat(2 * priceOf('bc_offset_1000_4_1')), 'bc_offset_1000_4_1')
    if (resolution.kind !== 'price') return
    expect(resolution.breakdown.moduleFactor).toBe(2)
    expect(resolution.breakdown.moduleDiscountRates).toEqual([])
  })

  test('case 9: large card 10 x 15 cm prices as 4 modules with the 10 percent bracket', () => {
    const resolution = quote({ attributes: OFFSET_1000, size: { widthCm: 10, heightCm: 15 } })

    expectPrice(resolution, withVat(4 * priceOf('bc_offset_1000_4_1') * 0.9), 'bc_offset_1000_4_1')
    if (resolution.kind !== 'price') return
    expect(resolution.breakdown.moduleDiscountRates).toEqual([0.1])
  })

  test('case 10: a 13 module piece prices with the 25 percent bracket', () => {
    // 52 x 10.5 = 546 cm2 / 42.5 = 12.84 -> 13 modules, the last bracket.
    const resolution = quote({ attributes: OFFSET_1000, size: { widthCm: 52, heightCm: 10.5 } })

    expectPrice(resolution, withVat(13 * priceOf('bc_offset_1000_4_1') * 0.75), 'bc_offset_1000_4_1')
    if (resolution.kind !== 'price') return
    expect(resolution.breakdown.moduleFactor).toBe(13)
  })

  test('case 11: requested lamination add-on is added to the matched sale row', () => {
    const resolution = quote({ attributes: SPECIAL_100, addOns: ['lamination'] })

    expectPrice(
      resolution,
      withVat(priceOf('bc_special_100_front') + priceOf('bc_addon_lamination_special_100_front')),
      'bc_special_100_front',
    )
    if (resolution.kind !== 'price') return
    expect(resolution.breakdown.addOns.map((line) => line.slug)).toEqual([
      'bc_addon_lamination_special_100_front',
    ])
  })

  test('case 12: a finish shown as a dash has no row and escalates no_match', () => {
    const resolution = quote({ attributes: { ...SPECIAL_100, finish: 'uv_front' } })

    expectEscalation(resolution, 'no_match', 'te delego con un humano')
  })

  test('case 13a: provisional illustration plain discounts are not applied by default', () => {
    const resolution = quote({
      attributes: { quantity: 100, paper: 'illustration_300', sides: 'front', finish: 'none' },
    })

    expectPrice(
      resolution,
      withVat(priceOf('bc_illustration300_100_front')),
      'bc_illustration300_100_front',
    )
    if (resolution.kind !== 'price') return
    expect(resolution.breakdown.listDiscounts).toEqual([])
  })

  test('case 13b: the named flag applies the list discount path when enabled', () => {
    const resolution = quote(
      { attributes: { quantity: 100, paper: 'illustration_300', sides: 'front', finish: 'none' } },
      catalogRows,
      {
        ...baseConfig,
        listDiscountPolicy: { applyProvisionalDiscounts: true },
      },
    )

    expectPrice(
      resolution,
      withVat(priceOf('bc_illustration300_100_front') - priceOf('bc_discount_illustration_plain_100')),
      'bc_illustration300_100_front',
    )
    if (resolution.kind !== 'price') return
    expect(resolution.breakdown.listDiscounts.map((line) => line.slug)).toEqual([
      'bc_discount_illustration_plain_100',
    ])
  })

  test('case 14: a family with no rows loaded is out_of_catalog', () => {
    const resolution = quote({ family: 'banners', attributes: SPECIAL_100 }, [])

    expectEscalation(
      resolution,
      'out_of_catalog',
      'eso no lo tengo cargado, te delego con un humano',
    )
  })

  test('case 15: matching two sale rows escalates ambiguous', () => {
    const duplicate: CatalogRow = {
      ...rowFor('bc_special_100_front'),
      slug: 'bc_special_100_front_duplicate',
    }
    const resolution = quote({ attributes: SPECIAL_100 }, [...catalogRows, duplicate])

    expectEscalation(resolution, 'ambiguous', 'te delego con un humano')
  })

  test('case 16: two products are quoted by calling the engine once per product', () => {
    expectPrice(
      quote({ attributes: SPECIAL_100 }),
      withVat(priceOf('bc_special_100_front')),
      'bc_special_100_front',
    )
    expectPrice(
      quote({ attributes: OFFSET_1000 }),
      withVat(priceOf('bc_offset_1000_4_1')),
      'bc_offset_1000_4_1',
    )
  })

  test('case 17: metre-priced families are refused instead of guessed', () => {
    const byTheMetre: PriceForConfig = {
      ...baseConfig,
      family: { ...businessCards, slug: 'banners', unit: 'linear_meter' },
    }
    const resolution = quote({ family: 'banners', attributes: SPECIAL_100 }, catalogRows, byTheMetre)

    expectEscalation(resolution, 'no_match', 'te delego con un humano')
  })

  test('case 18: a family the engine was not configured for never reaches a row', () => {
    const resolution = quote({ family: 'banners', attributes: SPECIAL_100 })

    expectEscalation(
      resolution,
      'out_of_catalog',
      'eso no lo tengo cargado, te delego con un humano',
    )
  })

  test('case 19: an add-on group with no row for this job escalates instead of picking one', () => {
    // Puntas redondeadas is priced for 100, 200 and 1000. The 500 card row has no such row.
    const resolution = quote({
      attributes: { ...OFFSET_1000, quantity: 500 },
      addOns: ['rounded_corners'],
    })

    expectEscalation(resolution, 'no_match', 'te delego con un humano')
  })
})
