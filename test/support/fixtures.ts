import { businessCards, catalogRows } from '../../src/catalog/business-cards'
import { ars, type Ars } from '../../src/domain/money'
import type { CatalogRow } from '../../src/domain/price-for'
import type { QuoteIntent } from '../../src/domain/types'

export function rowFor(slug: string): CatalogRow {
  const row = catalogRows.find((candidate) => candidate.slug === slug)
  if (row === undefined) {
    throw new Error(`${slug} is not in the seed`)
  }

  return row
}

export function priceOf(slug: string): Ars {
  return rowFor(slug).price
}

/** What the list amount becomes once the family's VAT rule is applied. */
export function withVat(net: number): Ars {
  return ars(businessCards.vatIncluded ? Math.round(net) : Math.round(net * (1 + businessCards.vatRate)))
}

export function intent(overrides: Partial<QuoteIntent> = {}): QuoteIntent {
  return {
    kind: 'quote',
    family: businessCards.slug,
    attributes: {},
    size: null,
    addOns: [],
    ...overrides,
  }
}

/** The 1000 card offset row, one module, which most module examples are built on. */
export const OFFSET_1000 = {
  quantity: 1000,
  paper: 'illustration_350',
  sides: 'front_color_back_grayscale',
  finish: 'none',
} as const

/** The 100 card special paper row, the only family with lamination priced against it. */
export const SPECIAL_100 = {
  quantity: 100,
  paper: 'special',
  sides: 'front',
  finish: 'none',
} as const
