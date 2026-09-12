import seed from '../../seed/business-cards.json'
import { ars, type Ars } from '../../src/domain/money'
import type { CatalogRow, ModuleDiscount, PriceForConfig } from '../../src/domain/price-for'
import type { AttributeContract, FamilyContract, QuoteIntent, Unit } from '../../src/domain/types'

type SeedItem = (typeof seed.items)[number]

/**
 * One mapper from the seed, shared by every lane B suite. Ids are the slugs the owner typed.
 *
 * Nothing here invents a value. The attribute contract is the set of values the loaded rows
 * actually carry, so a quantity or a paper the list does not have cannot be named by a test
 * any more than it can be named by extraction.
 */
export const catalogRows: CatalogRow[] = seed.items.map(toCatalogRow)

export const moduleDiscounts: ModuleDiscount[] = seed.module_discounts.map((discount) => ({
  fromModules: discount.from_modules,
  toModules: discount.to_modules,
  rate: discount.rate,
}))

export const businessCards: FamilyContract = {
  slug: seed.family.slug,
  label: seed.family.label,
  unit: seed.family.unit as Unit,
  vatRate: seed.vat_rate,
  vatIncluded: seed.vat_included,
  module: { widthCm: seed.family.module.width_cm, heightCm: seed.family.module.height_cm },
  attributes: seed.family.attributes.map(attributeContract),
  askOrder: seed.family.ask_order,
  addOns: [...new Set(catalogRows.filter((row) => row.kind === 'add_on').map((row) => row.group as string))],
}

export const quoteValidityDays: number = seed.quote_validity_days

export const baseConfig: PriceForConfig = {
  family: businessCards,
  quoteValidityDays,
  moduleDiscounts,
}

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

function toCatalogRow(item: SeedItem): CatalogRow {
  return {
    slug: item.id,
    kind: item.kind as CatalogRow['kind'],
    label: item.label,
    group: 'group' in item ? (item.group as string) : undefined,
    provisional: 'provisional' in item ? (item.provisional as boolean) : undefined,
    attributes: 'attributes' in item ? (item.attributes as Record<string, string | number>) : undefined,
    appliesTo: 'applies_to' in item ? item.applies_to : undefined,
    appliesToFamily: 'applies_to_family' in item ? item.applies_to_family : undefined,
    price: ars(item.price),
  }
}

function attributeContract(name: string): AttributeContract {
  const values = [
    ...new Set(
      seed.items
        .filter((item) => item.kind === 'sale')
        .map((item) => ('attributes' in item ? (item.attributes as Record<string, string | number>)[name] : undefined))
        .filter((value): value is string | number => value !== undefined),
    ),
  ]

  if (values.every((value) => typeof value === 'number')) {
    return { name, kind: 'number', values: values as number[] }
  }

  return { name, kind: 'enum', values: values.map(String) }
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
