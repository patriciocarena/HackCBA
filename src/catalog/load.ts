import { ars } from '../domain/money'
import type { CatalogItemKind, CatalogRow, ModuleDiscount, PriceForConfig } from '../domain/price-for'
import { unitSchema, type AttributeContract, type FamilyContract } from '../domain/types'

export type CatalogSeedItem = {
  id: string
  kind: string
  label: string
  group?: string
  provisional?: boolean
  attributes?: Record<string, string | number>
  applies_to?: string[]
  applies_to_family?: boolean
  price: number
}

export type CatalogSeed = {
  vat_rate: number
  vat_included: boolean
  quote_validity_days: number
  family: {
    slug: string
    label: string
    unit: string
    module: { width_cm: number; height_cm: number } | null
    attributes: string[]
    ask_order: string[]
  }
  items: CatalogSeedItem[]
  module_discounts: { from_modules: number; to_modules: number | null; rate: number }[]
}

export type Catalog = {
  rows: CatalogRow[]
  config: PriceForConfig
}

export function loadCatalog(seed: CatalogSeed): Catalog {
  const rows = seed.items.map(catalogRow)

  const family: FamilyContract = {
    slug: seed.family.slug,
    label: seed.family.label,
    unit: unitSchema.parse(seed.family.unit),
    vatRate: seed.vat_rate,
    vatIncluded: seed.vat_included,
    module:
      seed.family.module === null
        ? null
        : { widthCm: seed.family.module.width_cm, heightCm: seed.family.module.height_cm },
    attributes: seed.family.attributes.map((name) => attributeContract(name, saleRows(rows))),
    askOrder: seed.family.ask_order,
    addOns: [],
  }

  const moduleDiscounts: ModuleDiscount[] = seed.module_discounts.map((discount) => ({
    fromModules: discount.from_modules,
    toModules: discount.to_modules,
    rate: discount.rate,
  }))

  return {
    rows,
    config: { family, quoteValidityDays: seed.quote_validity_days, moduleDiscounts },
  }
}

function catalogRow(item: CatalogSeedItem): CatalogRow {
  return {
    slug: item.id,
    kind: item.kind as CatalogItemKind,
    label: item.label,
    group: item.group,
    provisional: item.provisional,
    attributes: item.attributes,
    appliesTo: item.applies_to,
    appliesToFamily: item.applies_to_family,
    price: ars(item.price),
  }
}

function attributeContract(name: string, rows: CatalogRow[]): AttributeContract {
  const values = [
    ...new Set(
      rows
        .map((row) => row.attributes?.[name])
        .filter((value): value is string | number => value !== undefined),
    ),
  ]

  if (values.every((value) => typeof value === 'number')) {
    return { name, kind: 'number', values: values as number[] }
  }

  return { name, kind: 'enum', values: values.map(String) }
}

function saleRows(rows: CatalogRow[]): CatalogRow[] {
  return rows.filter((row) => row.kind === 'sale')
}
