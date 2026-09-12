import { describe, expect, test } from 'bun:test'
import { baseConfig, businessCards, catalogRows } from '../../src/catalog/business-cards'
import { ars } from '../../src/domain/money'
import { priceFor, type CatalogRow, type PriceForConfig } from '../../src/domain/price-for'
import type { FamilyContract, QuoteIntent } from '../../src/domain/types'

/**
 * The bug a second family makes live, and it fires on a customer rather than on the owner.
 *
 * `bc_addon_design` carries `applies_to_family: true`, and `appliesToSaleRow` returned true for
 * any sale row when that flag was set, because a row had no family to check against. Unique
 * slugs make the price edit path safe and do nothing here. So one flat array plus a second
 * family meant quoting a talonario with the `design` add-on found the business cards design row
 * and added $20.000 to it.
 *
 * `CONTEXT.md` calls an Item "one row of a family". The type did not carry the family, which is
 * the gap in the model that let the gap in the code exist.
 */
const OTHER: FamilyContract = {
  slug: 'facturas',
  label: 'Facturas',
  unit: 'set',
  vatRate: 0.21,
  vatIncluded: false,
  module: null,
  attributes: [{ name: 'quantity', kind: 'number', values: [1] }],
  askOrder: ['quantity'],
  addOns: ['design'],
}

const OTHERS_ROW: CatalogRow = {
  slug: 'fa_half_legal_1_bw',
  familySlug: 'facturas',
  kind: 'sale',
  label: '1 talonario',
  attributes: { quantity: 1 },
  price: ars(16_000),
}

const BOTH: CatalogRow[] = [...catalogRows, OTHERS_ROW]

const quote = (overrides: Partial<QuoteIntent>, config: PriceForConfig) =>
  priceFor(
    { kind: 'quote', family: config.family.slug, attributes: {}, size: null, addOns: [], ...overrides },
    BOTH,
    config,
  )

describe('a row belongs to a family, and an add-on cannot cross into another one', () => {
  test('the seed gives every row the family it was loaded from', () => {
    for (const row of catalogRows) {
      expect(row.familySlug).toBe(businessCards.slug)
    }
  })

  test('a family-wide add-on from another family is not found for this job', () => {
    const resolution = quote({ attributes: { quantity: 1 }, addOns: ['design'] }, {
      ...baseConfig,
      family: OTHER,
      quoteValidityDays: 15,
    })

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('no_match')
  })

  test('the same add-on still applies inside its own family', () => {
    const resolution = quote(
      {
        attributes: { quantity: 1000, paper: 'illustration_350', sides: 'front_color_back_grayscale', finish: 'none' },
        addOns: ['design'],
      },
      baseConfig,
    )

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.breakdown.addOns.map((line) => line.slug)).toEqual(['bc_addon_design'])
  })

  test('a sale row from another family never matches this family attributes', () => {
    const resolution = quote({ attributes: { quantity: 1 } }, {
      ...baseConfig,
      family: OTHER,
      quoteValidityDays: 15,
    })

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.breakdown.base.slug).toBe('fa_half_legal_1_bw')
  })
})
