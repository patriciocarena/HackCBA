import seed from '../../seed/business-cards.json'
import type { CatalogRow, PriceForConfig } from '../domain/price-for'
import type { FamilyContract } from '../domain/types'
import { loadCatalog } from './load'

const catalog = loadCatalog(seed)

export const catalogRows: CatalogRow[] = catalog.rows
export const baseConfig: PriceForConfig = catalog.config
export const businessCards: FamilyContract = catalog.config.family
