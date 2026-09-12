import type { Client } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { seedCatalog } from '@/storage/seed-catalog'
import { migratedDb } from '@test/support/db'

const RECORDED_AT = '2026-09-12T08:00:00.000Z'

let client: Client

beforeEach(async () => {
  client = await migratedDb()
  await seedCatalog(client, await Bun.file('seed/business-cards.json').json(), RECORDED_AT)
})

afterEach(() => {
  client.close()
})

async function one(sql: string): Promise<Record<string, unknown>> {
  const result = await client.execute(sql)

  return result.rows[0] as unknown as Record<string, unknown>
}

describe('seedCatalog', () => {
  it('writes the family with its unit and its module', async () => {
    const family = await one('SELECT * FROM families')

    expect(family.slug).toBe('business_cards')
    expect(family.unit).toBe('unit')
    expect(family.module_width_cm).toBe(8.5)
    expect(family.module_height_cm).toBe(5)
  })

  it('derives the attribute contracts from the sale rows, so no value is invented', async () => {
    const family = await one('SELECT attributes FROM families')

    expect(JSON.parse(String(family.attributes))).toEqual([
      { name: 'quantity', kind: 'number', values: [100, 200, 500, 1000] },
      {
        name: 'paper',
        kind: 'enum',
        values: ['illustration_300', 'illustration_350', 'special'],
      },
      {
        name: 'sides',
        kind: 'enum',
        values: ['front', 'front_and_back', 'front_color_back_grayscale'],
      },
      {
        name: 'finish',
        kind: 'enum',
        values: [
          'none',
          'opp_both_sides',
          'opp_both_sides_uv_both_sides',
          'opp_both_sides_uv_one_side',
          'uv_front',
        ],
      },
    ])
  })

  it('writes every row of the list under its tier', async () => {
    const counts = await client.execute(
      'SELECT tier, count(*) AS n FROM items GROUP BY tier ORDER BY tier',
    )

    expect(counts.rows.map((row) => [String(row.tier), Number(row.n)])).toEqual([
      ['add_on', 11],
      ['discount', 2],
      ['sale', 14],
    ])
  })

  it('puts the price in a version, and the view reads the latest one', async () => {
    const item = await one("SELECT price FROM catalog_items WHERE slug = 'bc_special_100_front'")

    expect(item.price).toBe(12100)
  })

  it('resolves applies_to into rows, not into a list of strings', async () => {
    const applied = await client.execute(`SELECT sale.slug AS slug
      FROM item_applications AS link
      JOIN items AS addon ON addon.id = link.item_id
      JOIN items AS sale ON sale.id = link.applies_to_id
      WHERE addon.slug = 'bc_addon_lamination_special_100_front'`)

    expect(applied.rows.map((row) => String(row.slug))).toEqual(['bc_special_100_front'])
  })

  it('marks the add-ons the whole family can take', async () => {
    const item = await one("SELECT applies_to_family FROM items WHERE slug = 'bc_addon_design'")

    expect(item.applies_to_family).toBe(1)
  })

  it('loads twice without duplicating a row or a price', async () => {
    await seedCatalog(client, await Bun.file('seed/business-cards.json').json(), RECORDED_AT)

    const counts = await one(`SELECT
      (SELECT count(*) FROM items) AS items,
      (SELECT count(*) FROM price_versions) AS versions,
      (SELECT count(*) FROM item_applications) AS links`)

    expect(counts).toMatchObject({ items: 27, versions: 27, links: 8 })
  })
})

describe('a catalog that cannot be trusted', () => {
  it('leaves nothing behind when a row fails halfway', async () => {
    const seed = await Bun.file('seed/business-cards.json').json()
    seed.items[0].applies_to = ['a_row_that_is_not_in_the_list']

    await client.execute('DELETE FROM items')
    await client.execute('DELETE FROM families')

    await expect(seedCatalog(client, seed, RECORDED_AT)).rejects.toThrow()

    const counts = await one('SELECT count(*) AS n FROM items')

    expect(counts.n).toBe(0)
  })

  it('refuses an attribute the family declares and no sale row carries', async () => {
    const seed = await Bun.file('seed/business-cards.json').json()
    seed.family.attributes.push('varnish')

    await expect(seedCatalog(client, seed, RECORDED_AT)).rejects.toThrow(
      'varnish is declared and no sale row carries it',
    )
  })

  it('refuses an attribute whose values are half numbers and half words', async () => {
    const seed = await Bun.file('seed/business-cards.json').json()
    seed.items.find((item: { id: string }) => item.id === 'bc_special_100_front').attributes.quantity = 'cien'

    await expect(seedCatalog(client, seed, RECORDED_AT)).rejects.toThrow(
      'quantity carries both numbers and words',
    )
  })

  it('keeps the group, because an add-on is resolved by its group and not its row', async () => {
    const lamination = await client.execute(
      "SELECT slug, item_group FROM items WHERE item_group = 'lamination' ORDER BY slug",
    )
    const rounded = await client.execute("SELECT slug FROM items WHERE item_group = 'rounded_corners'")

    expect(lamination.rows).toHaveLength(4)
    expect(rounded.rows).toHaveLength(3)
    expect(String(lamination.rows[0].slug)).toBe('bc_addon_lamination_special_100_front')
  })

  it('keeps every group the list prices, so none of them is unbuyable', async () => {
    const groups = await client.execute(
      "SELECT DISTINCT item_group FROM items WHERE tier = 'add_on' ORDER BY item_group",
    )

    expect(groups.rows.map((row) => String(row.item_group))).toEqual([
      'circular_cut',
      'design',
      'extra_cut',
      'label_perforation',
      'lamination',
      'rounded_corners',
    ])
  })

  it('keeps unconfirmed, because a unconfirmed discount is not applied by default', async () => {
    const unconfirmed = await client.execute(
      "SELECT slug FROM items WHERE unconfirmed = 1 ORDER BY slug",
    )
    const sales = await client.execute("SELECT count(*) AS n FROM items WHERE tier = 'sale' AND unconfirmed = 1")

    expect(unconfirmed.rows.map((row) => String(row.slug))).toEqual([
      'bc_discount_illustration_plain_100',
      'bc_discount_illustration_plain_200',
    ])
    expect(Number(sales.rows[0].n)).toBe(0)
  })

  it('keeps ask_order, which is the order the family asks in and not the contract order', async () => {
    const family = await one('SELECT ask_order FROM families')

    expect(JSON.parse(String(family.ask_order))).toEqual(['quantity', 'paper', 'sides', 'finish'])
  })
})
