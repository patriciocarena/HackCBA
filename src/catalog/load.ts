import { ars, type Ars } from '../domain/money'
import type { CatalogItemKind, CatalogRow, ModuleDiscount, PriceForConfig } from '../domain/price-for'
import { unitSchema, type AttributeContract, type FamilyContract } from '../domain/types'

type CatalogSeedItem = {
  id: string
  kind: string
  label: string
  group?: string
  provisional?: boolean
  attributes?: Record<string, string | number | undefined>
  applies_to?: readonly string[]
  applies_to_family?: boolean
  /**
   * What the row charges: an amount, or a rate for an add-on the list states as a percentage.
   * Exactly one, and a sale row must carry the amount. See ADR 0023.
   */
  price?: number
  rate?: number
}

type CatalogSeed = {
  vat_rate: number
  vat_included: boolean
  quote_validity_days: number
  family: {
    slug: string
    label: string
    unit: string
    module: { width_cm: number; height_cm: number } | null
    attributes: readonly string[]
    ask_order: readonly string[]
  }
  items: readonly CatalogSeedItem[]
  module_discounts: readonly { from_modules: number; to_modules: number | null; rate: number }[]
}

const CATALOG_ITEM_KINDS: readonly CatalogItemKind[] = ['sale', 'add_on', 'discount']

export type Catalog = {
  rows: CatalogRow[]
  config: PriceForConfig
}

export function loadCatalog(seed: CatalogSeed): Catalog {
  const rows = seed.items.map((item) => catalogRow(item, seed.family.slug))
  const sales = rows.filter((row) => row.kind === 'sale')

  const family: FamilyContract = {
    slug: seed.family.slug,
    label: seed.family.label,
    unit: unitSchema.parse(seed.family.unit),
    vatRate: seed.vat_rate,
    vatIncluded: seed.vat_included,
    // Nullable, because most families have none. `FamilyContract.module` was already
    // `ModuleContract | null` and `seed-catalog.ts` already allowed nullish, so this loader was
    // the only thing in the repo stricter than the contract it loads.
    module:
      seed.family.module === null
        ? null
        : { widthCm: seed.family.module.width_cm, heightCm: seed.family.module.height_cm },
    attributes: seed.family.attributes.map((name) => attributeContract(name, sales)),
    askOrder: [...seed.family.ask_order],
    addOns: [
      ...new Set(
        rows.filter((row) => row.kind === 'add_on').map((row) => row.group ?? row.slug),
      ),
    ],
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

function catalogRow(item: CatalogSeedItem, familySlug: string): CatalogRow {
  const kind = catalogItemKind(item)

  return {
    slug: item.id,
    familySlug,
    kind,
    label: item.label,
    group: item.group,
    provisional: item.provisional,
    attributes: item.attributes as Record<string, string | number> | undefined,
    appliesTo: item.applies_to === undefined ? undefined : [...item.applies_to],
    appliesToFamily: item.applies_to_family,
    ...chargeOf(item, kind),
  }
}

/**
 * The amount or the rate, never both and never neither.
 *
 * A sale row must carry an amount: the list cannot state a base price as a percentage of
 * nothing, and a family whose base rows were rates would have no number to multiply. Only an
 * add-on may carry a rate, and this is the seam that refuses a seed saying otherwise.
 */
function chargeOf(item: CatalogSeedItem, kind: CatalogItemKind): { price: Ars } | { rate: number } {
  const declared = [item.price, item.rate].filter((one) => one !== undefined)

  if (declared.length !== 1) {
    throw new Error(`${item.id} must declare exactly one of price and rate, and declares ${declared.length}`)
  }

  if (item.rate !== undefined) {
    if (kind === 'sale') throw new Error(`${item.id} is a sale row and carries a rate instead of an amount`)

    return { rate: item.rate }
  }

  return { price: ars(item.price as number) }
}

function catalogItemKind(item: CatalogSeedItem): CatalogItemKind {
  const kind = CATALOG_ITEM_KINDS.find((candidate) => candidate === item.kind)

  if (kind === undefined) {
    throw new Error(`${item.id} has kind ${item.kind}, which the engine does not price`)
  }

  return kind
}

function attributeContract(name: string, rows: CatalogRow[]): AttributeContract {
  const values = [
    ...new Set(
      rows
        .map((row) => row.attributes?.[name])
        .filter((value): value is string | number => value !== undefined),
    ),
  ]

  if (values.length === 0) {
    throw new Error(`${name} is declared but no sale row carries it`)
  }

  if (values.every((value) => typeof value === 'number')) {
    return { name, kind: 'number', values: values as number[] }
  }

  return { name, kind: 'enum', values: values.map(String) }
}

