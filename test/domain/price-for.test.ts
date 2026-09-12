import { describe, expect, test } from 'bun:test'
import businessCardsSeed from '../../seed/business-cards.json'
import type { Intent, Resolution, Unit } from '../../src/domain/types'
import {
  DEFAULT_LIST_DISCOUNT_POLICY,
  priceFor,
  type PriceForCatalogRow,
  type PriceForConfig,
  type PriceForFamily,
} from '../../src/domain/price-for'

type SeedItem = (typeof businessCardsSeed.items)[number]

const businessCardsFamily: PriceForFamily = {
  slug: businessCardsSeed.family.slug,
  label: businessCardsSeed.family.label,
  unit: businessCardsSeed.family.unit as Unit,
  attributes: businessCardsSeed.family.attributes,
  askOrder: businessCardsSeed.family.ask_order,
  module: {
    widthCm: businessCardsSeed.family.module.width_cm,
    heightCm: businessCardsSeed.family.module.height_cm,
  },
}

const businessCardsRows = businessCardsSeed.items.map(toCatalogRow)
const moduleDiscounts = businessCardsSeed.module_discounts.map((discount) => ({
  fromModules: discount.from_modules,
  toModules: discount.to_modules,
  rate: discount.rate,
}))

const baseConfig: PriceForConfig = {
  family: businessCardsFamily,
  vatRate: businessCardsSeed.vat_rate,
  quoteValidityDays: 15,
  moduleDiscounts,
  listDiscountPolicy: DEFAULT_LIST_DISCOUNT_POLICY,
}

describe('priceFor', () => {
  test('case 1: exact match for 1000 illustration 350g colour front and grayscale back', () => {
    const resolution = quote({
      attributes: {
        quantity: 1000,
        paper: 'illustration_350',
        sides: 'front_color_back_grayscale',
        finish: 'none',
      },
    })

    expectPrice(resolution, 54_450, numericIdForSlug('bc_offset_1000_4_1'))
    expect(resolution.explanation).toBe(
      'Te cotizo $54.450 final con IVA incluido. La cotización es válida por 15 días.',
    )
  })

  test('case 2: exact match for 100 special paper front only', () => {
    const resolution = quote({
      attributes: {
        quantity: 100,
        paper: 'special',
        sides: 'front',
        finish: 'none',
      },
    })

    expectPrice(resolution, 14_641, numericIdForSlug('bc_special_100_front'))
    expect(resolution.explanation).toContain('La cotización es válida por 15 días.')
  })

  test('case 3: 700 cards are not interpolated or bracket matched', () => {
    const resolution = quote({
      attributes: {
        quantity: 700,
        paper: 'illustration_350',
        sides: 'front_color_back_grayscale',
        finish: 'none',
      },
    })

    expectEscalation(resolution, 'no_match', 'te delego con un humano')
  })

  test('case 4: 1500 cards escalate because the quantity is absent from the list', () => {
    const resolution = quote({
      attributes: {
        quantity: 1500,
        paper: 'illustration_350',
        sides: 'front_color_back_grayscale',
        finish: 'none',
      },
    })

    expectEscalation(resolution, 'no_match', 'te delego con un humano')
  })

  test('case 5: missing paper, sides and finish are asked in ask_order', () => {
    const resolution = quote({ attributes: { quantity: 1000 } })

    expectEscalation(
      resolution,
      'missing_attribute',
      'Para cotizarlo, pasame: papel, caras y terminación.',
    )
  })

  test('case 6: a known paper is not asked again', () => {
    const resolution = quote({
      attributes: {
        quantity: 1000,
        paper: 'illustration_350',
      },
    })

    expectEscalation(
      resolution,
      'missing_attribute',
      'Para cotizarlo, pasame: caras y terminación.',
    )
  })

  test('case 7: an unresolved required attribute escalates as missing_attribute with the attribute name', () => {
    const resolution = quote({
      attributes: {
        quantity: 1000,
        paper: 'illustration_350',
        sides: 'front_color_back_grayscale',
      },
      missing: ['finish'],
    })

    expectEscalation(resolution, 'missing_attribute', 'Para cotizarlo, pasame: terminación.')
  })

  test('case 8: card 15 x 5 cm prices as 2 modules with no discount', () => {
    const resolution = quote({
      attributes: {
        quantity: 1000,
        paper: 'illustration_350',
        sides: 'front_color_back_grayscale',
        finish: 'none',
        width_cm: 15,
        height_cm: 5,
      },
    })

    expectPrice(resolution, 108_900, numericIdForSlug('bc_offset_1000_4_1'))
  })

  test('case 9: large card 10 x 15 cm prices as 4 modules with the 10 percent bracket', () => {
    const resolution = quote({
      attributes: {
        quantity: 1000,
        paper: 'illustration_350',
        sides: 'front_color_back_grayscale',
        finish: 'none',
        width_cm: 10,
        height_cm: 15,
      },
    })

    expectPrice(resolution, 196_020, numericIdForSlug('bc_offset_1000_4_1'))
  })

  test('case 10: a 13 module piece prices with the 25 percent bracket', () => {
    const resolution = quote({
      attributes: {
        quantity: 1000,
        paper: 'illustration_350',
        sides: 'front_color_back_grayscale',
        finish: 'none',
        modules: 13,
      },
    })

    expectPrice(resolution, 530_888, numericIdForSlug('bc_offset_1000_4_1'))
  })

  test('case 11: requested lamination add-on is added to the matched sale row', () => {
    const resolution = quote({
      attributes: {
        quantity: 100,
        paper: 'special',
        sides: 'front',
        finish: 'lamination',
      },
    })

    expectPrice(resolution, 20_812, numericIdForSlug('bc_special_100_front'))
    expect(resolution.explanation).toContain('Incluye Laminado')
    expect(resolution.derivation).toContain('más $5.100 por Laminado')
    expect(resolution.explanation).toContain('La cotización es válida por 15 días.')
  })

  test('case 12: a finish shown as a dash has no row and escalates no_match', () => {
    const resolution = quote({
      attributes: {
        quantity: 100,
        paper: 'special',
        sides: 'front',
        finish: 'uv_front',
      },
    })

    expectEscalation(resolution, 'no_match', 'te delego con un humano')
  })

  test('case 13a: provisional illustration plain discounts are not applied by default', () => {
    const resolution = quote({
      attributes: {
        quantity: 100,
        paper: 'illustration_300',
        sides: 'front',
        finish: 'none',
      },
    })

    expectPrice(resolution, 12_463, numericIdForSlug('bc_illustration300_100_front'))
    expect(resolution.explanation).not.toContain('menos $1.800')
  })

  test('case 13b: the named flag applies the list discount path when enabled', () => {
    const resolution = quote(
      {
        attributes: {
          quantity: 100,
          paper: 'illustration_300',
          sides: 'front',
          finish: 'none',
        },
      },
      businessCardsRows,
      {
        ...baseConfig,
        listDiscountPolicy: { applyProvisionalIllustrationPlainDiscounts: true },
      },
    )

    expectPrice(resolution, 10_285, numericIdForSlug('bc_illustration300_100_front'))
    expect(resolution.derivation).toContain('menos $1.800')
  })

  test('case 14: a requested commercial discount is escalated', () => {
    const resolution = quote({
      attributes: {
        question: 'me haces precio si llevo varias',
      },
    })

    expectEscalation(resolution, 'not_a_fact', 'te delego con un humano')
  })

  test('case 15: a family with no rows loaded is out_of_catalog', () => {
    const resolution = quote(
      {
        family: 'banners',
        attributes: {
          quantity: 1,
          paper: 'vinyl',
          sides: 'front',
          finish: 'none',
        },
      },
      [],
    )

    expectEscalation(
      resolution,
      'out_of_catalog',
      'eso no lo tengo cargado, te delego con un humano',
    )
  })

  test('case 16: matching two sale rows escalates ambiguous', () => {
    const duplicateRow = {
      ...rowForSlug('bc_special_100_front'),
      id: 10_000,
      slug: 'bc_special_100_front_duplicate',
    }
    const resolution = quote(
      {
        attributes: {
          quantity: 100,
          paper: 'special',
          sides: 'front',
          finish: 'none',
        },
      },
      [...businessCardsRows, duplicateRow],
    )

    expectEscalation(resolution, 'ambiguous', 'te delego con un humano')
  })

  test('case 17: VAT questions escalate to a person', () => {
    const resolution = quote({
      attributes: {
        question: 'el IVA es obligatorio?',
      },
    })

    expectEscalation(resolution, 'vat_question', 'te delego con un humano')
  })

  test('case 18: two products are quoted by calling the engine once per product', () => {
    const firstResolution = quote({
      attributes: {
        quantity: 100,
        paper: 'special',
        sides: 'front',
        finish: 'none',
      },
    })
    const secondResolution = quote({
      attributes: {
        quantity: 1000,
        paper: 'illustration_350',
        sides: 'front_color_back_grayscale',
        finish: 'none',
      },
    })

    expectPrice(firstResolution, 14_641, numericIdForSlug('bc_special_100_front'))
    expectPrice(secondResolution, 54_450, numericIdForSlug('bc_offset_1000_4_1'))
  })

  test('case 19: metre-priced families are refused instead of guessed', () => {
    const metreConfig: PriceForConfig = {
      ...baseConfig,
      family: {
        ...businessCardsFamily,
        slug: 'banners',
        unit: 'linear_meter',
      },
    }
    const resolution = quote(
      {
        family: 'banners',
        attributes: {
          quantity: 1,
          paper: 'vinyl',
          sides: 'front',
          finish: 'none',
        },
      },
      [rowForSlug('bc_special_100_front')],
      metreConfig,
    )

    expectEscalation(resolution, 'no_match', 'te delego con un humano')
  })
})

function quote(
  intent: Partial<Intent>,
  rows: PriceForCatalogRow[] = businessCardsRows,
  config: PriceForConfig = baseConfig,
): Resolution {
  return priceFor(
    {
      family: businessCardsFamily.slug,
      attributes: {},
      missing: [],
      ...intent,
    },
    rows,
    config,
  )
}

function toCatalogRow(item: SeedItem): PriceForCatalogRow {
  return {
    id: idFor(item.id),
    slug: item.id,
    kind: item.kind as PriceForCatalogRow['kind'],
    label: item.label,
    attributes: 'attributes' in item ? (item.attributes as Record<string, string | number>) : undefined,
    appliesTo: 'applies_to' in item ? item.applies_to : undefined,
    appliesToFamily: 'applies_to_family' in item ? item.applies_to_family : undefined,
    price: item.price,
  }
}

function idFor(slug: string): number {
  let hash = 0
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) % 2_147_483_647
  return hash
}

function numericIdForSlug(slug: string): number {
  return rowForSlug(slug).id
}

function rowForSlug(slug: string): PriceForCatalogRow {
  const row = businessCardsRows.find((item) => item.slug === slug)
  if (row === undefined) {
    throw new Error(`Missing seed row ${slug}`)
  }

  return row
}

function expectPrice(resolution: Resolution, amount: number, itemId: number): asserts resolution is Extract<Resolution, { kind: 'price' }> {
  expect(resolution.kind).toBe('price')
  if (resolution.kind !== 'price') {
    throw new Error(`Expected price, got ${resolution.kind}`)
  }

  expect(resolution.amount).toBe(amount)
  expect(resolution.itemId).toBe(itemId)
}

function expectEscalation(
  resolution: Resolution,
  reason: Exclude<Resolution, { kind: 'price' }>['reason'],
  detail: string,
): asserts resolution is Extract<Resolution, { kind: 'escalate' }> {
  expect(resolution.kind).toBe('escalate')
  if (resolution.kind !== 'escalate') {
    throw new Error(`Expected escalation, got ${resolution.kind}`)
  }

  expect(resolution.reason).toBe(reason)
  expect(resolution.detail).toBe(detail)
}
