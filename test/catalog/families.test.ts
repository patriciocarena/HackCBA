import { describe, expect, test } from 'bun:test'
import { ALL_ROWS, configFor, FAMILIES, LOADED_FAMILIES } from '../../src/catalog/families'
import { saleRowsOf } from '../../src/domain/price-for'

/**
 * The registry. Every family the process quotes from, keyed by slug, each value what
 * `loadCatalog` already returned for one seed.
 *
 * One flat row array behind it, because item slugs are globally unique and `applyPriceEdit`
 * matches on them. What makes that safe is `familySlug` on the row: unique slugs alone let a
 * family-wide add-on from one family attach to another's sale row.
 */
describe('the loaded families', () => {
  test('holds the three families that are loaded', () => {
    expect(Object.keys(FAMILIES).sort()).toEqual(['business_cards', 'facturas', 'folletos_laser'])
  })

  test('every row in the flat array names the family it came from', () => {
    for (const row of ALL_ROWS) {
      expect(FAMILIES[row.familySlug]).toBeDefined()
    }
  })

  test('no two families share an item slug, which is what lets one array hold them all', () => {
    expect(new Set(ALL_ROWS.map((row) => row.slug)).size).toBe(ALL_ROWS.length)
  })

  test('no two families share an add-on group, so a group names one job', () => {
    const groups = LOADED_FAMILIES.flatMap((family) => family.addOns)

    expect(new Set(groups).size).toBe(groups.length)
  })

  test('configFor gives back the contract that family was loaded with', () => {
    expect(configFor('facturas')!.family.unit).toBe('set')
    expect(configFor('business_cards')!.family.module).not.toBeNull()
  })

  test('a family nobody loaded has no config, rather than a default one', () => {
    expect(configFor('gigantografias')).toBeUndefined()
  })

  test('the rows of one family are reachable without sweeping the others', () => {
    expect(saleRowsOf(ALL_ROWS, 'folletos_laser')).toHaveLength(8)
    expect(saleRowsOf(ALL_ROWS, 'facturas')).toHaveLength(28)
    expect(saleRowsOf(ALL_ROWS, 'business_cards')).toHaveLength(14)
  })
})
