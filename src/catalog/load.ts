import type { PriceForConfig } from '../domain/price-for'
import { unitSchema, type FamilyContract } from '../domain/types'

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
}

export type Catalog = {
  config: PriceForConfig
}

export function loadCatalog(seed: CatalogSeed): Catalog {
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
    attributes: [],
    askOrder: seed.family.ask_order,
    addOns: [],
  }

  return { config: { family, quoteValidityDays: seed.quote_validity_days } }
}
