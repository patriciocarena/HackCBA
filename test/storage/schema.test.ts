import type { Client } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { canonicalAttributes, type AttributeBag } from '@/catalog/attributes'
import { migratedDb } from '@test/support/db'

let client: Client

beforeEach(async () => {
  client = await migratedDb()
  await client.execute(`INSERT INTO families
    (slug, label, unit, vat_rate, vat_included, quote_validity_days, attributes, ask_order)
    VALUES ('business_cards', 'Tarjetas personales', 'unit', 0.21, 1, 15, '[]', '[]')`)
})

afterEach(() => {
  client.close()
})

function insertItem(slug: string, tier: string, bag: AttributeBag, unit: string | null = null) {
  return client.execute({
    sql: `INSERT INTO items (slug, family_slug, tier, label, unit, attributes)
          VALUES (?, 'business_cards', ?, ?, ?, ?)`,
    args: [slug, tier, slug, unit, canonicalAttributes(bag)],
  })
}

describe('the identity of an item', () => {
  it('refuses a second sale row with the same family, tier and bag', async () => {
    await insertItem('one', 'sale', { quantity: 100, paper: 'special' })

    await expect(insertItem('other', 'sale', { quantity: 100, paper: 'special' })).rejects.toThrow(
      'UNIQUE constraint failed',
    )
  })

  it('sees through the order the keys were written in', async () => {
    await insertItem('one', 'sale', { quantity: 100, paper: 'special' })

    await expect(insertItem('other', 'sale', { paper: 'special', quantity: 100 })).rejects.toThrow(
      'UNIQUE constraint failed',
    )
  })

  it('takes two add-ons with the same empty bag, because a bag is not their identity', async () => {
    await insertItem('lamination_front', 'add_on', {})
    await insertItem('lamination_both', 'add_on', {})

    const count = await client.execute("SELECT count(*) AS n FROM items WHERE tier = 'add_on'")

    expect(Number(count.rows[0]?.n)).toBe(2)
  })

  it('refuses a tier the domain does not declare', async () => {
    await expect(insertItem('one', 'freebie', {})).rejects.toThrow('CHECK constraint failed')
  })
})

describe('unit', () => {
  it('is required on a family', async () => {
    await expect(
      client.execute(`INSERT INTO families
        (slug, label, unit, vat_rate, vat_included, quote_validity_days, attributes, ask_order)
        VALUES ('stickers', 'Stickers', NULL, 0.21, 1, 15, '[]', '[]')`),
    ).rejects.toThrow('NOT NULL constraint failed')
  })

  it('is optional on an item, which then takes the family default', async () => {
    await insertItem('one', 'sale', { quantity: 100 })

    const row = await client.execute(`SELECT coalesce(item.unit, family.unit) AS unit
      FROM items AS item JOIN families AS family ON family.slug = item.family_slug`)

    expect(row.rows[0]?.unit).toBe('unit')
  })

  it('overrides the family when an item declares one', async () => {
    await insertItem('one', 'sale', { quantity: 100 }, 'square_meter')

    const row = await client.execute('SELECT unit FROM items')

    expect(row.rows[0]?.unit).toBe('square_meter')
  })

  it('refuses an override the domain does not declare', async () => {
    await expect(insertItem('one', 'sale', {}, 'dozen')).rejects.toThrow('CHECK constraint failed')
  })
})
