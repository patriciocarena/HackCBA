import businessCardsSeed from '../../seed/business-cards.json'
import facturasSeed from '../../seed/facturas.json'
import folletosLaserSeed from '../../seed/folletos-laser.json'
import type { CatalogRow, PriceForConfig } from '../domain/price-for'
import type { FamilyContract } from '../domain/types'
import { loadCatalog, type Catalog } from './load'

/**
 * Every family the process quotes from, keyed by slug.
 *
 * Three of thirty eight. The list has the rest, and the exact match rule is what makes loading
 * them one at a time safe: a family nobody loaded has no config here, so asking for it escalates
 * rather than being answered by the nearest family that does exist.
 *
 * The rows live in one flat array because item slugs are globally unique and `applyPriceEdit`
 * matches on them. What makes that safe is `familySlug` on the row rather than the uniqueness:
 * unique slugs did nothing to stop `appliesToFamily` attaching the business cards design add-on
 * to a talonario.
 */
const LOADED: Catalog[] = [
  loadCatalog(businessCardsSeed),
  loadCatalog(folletosLaserSeed),
  loadCatalog(facturasSeed),
]

export const FAMILIES: Record<string, Catalog> = Object.fromEntries(
  LOADED.map((catalog) => [catalog.config.family.slug, catalog]),
)

/** The contracts, in load order, which is the order extraction offers them in. */
export const LOADED_FAMILIES: FamilyContract[] = LOADED.map((catalog) => catalog.config.family)

export const ALL_ROWS: CatalogRow[] = LOADED.flatMap((catalog) => catalog.rows)

/**
 * The config a family was loaded with, or nothing.
 *
 * Undefined rather than a default, because a default is a set of pricing rules nobody typed.
 * The caller turns it into an escalation, which is the only correct answer for a family the
 * shop has not loaded.
 */
export function configFor(slug: string): PriceForConfig | undefined {
  return FAMILIES[slug]?.config
}
