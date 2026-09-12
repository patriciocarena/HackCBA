import { businessCards, catalogRows } from '../../src/catalog/business-cards'
import { totalOf } from '../../src/domain/breakdown'
import { ars, type Ars } from '../../src/domain/money'
import { amountOf, type CatalogRow } from '../../src/domain/price-for'
import type { QuoteIntent } from '../../src/domain/types'

export function rowFor(slug: string): CatalogRow {
  const row = catalogRows.find((candidate) => candidate.slug === slug)
  if (row === undefined) {
    throw new Error(`${slug} is not in the seed`)
  }

  return row
}

export function priceOf(slug: string): Ars {
  return amountOf(rowFor(slug))
}

/**
 * What a list amount becomes once the family's VAT rule is applied.
 *
 * It goes through `totalOf` rather than doing the multiply itself. It used to do the multiply,
 * which is why most of the suite followed the ADR 0020 flip for free, and also why the suite
 * could have stayed green with the helper and the engine disagreeing about where to round.
 * A second implementation of the one rule under test is not a fixture, it is a way to pass.
 */
export function withVat(net: number): Ars {
  return totalOf({
    base: { slug: 'withVat', label: 'withVat', amount: ars(Math.round(net)) },
    moduleFactor: 1,
    rates: [],
    addOns: [],
    listDiscounts: [],
    vatRate: businessCards.vatRate,
    vatIncluded: businessCards.vatIncluded,
  })
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

/**
 * Every pesos-shaped run in a text, which is what a test asserts a reply does and does not
 * carry. It was `turn.ts`'s own helper while the ADR 0010 guard read replies; ADR 0027 dropped
 * the guard, and the assertion is the half worth keeping.
 */
export function amountsIn(text: string): string[] {
  return text.match(/\$\s*[\d.,]*\d/g) ?? []
}
