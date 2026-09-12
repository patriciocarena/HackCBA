import type { Client } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { recordPrice } from '@/storage/price-versions'
import { migratedDb } from '@test/support/db'

const AT = '2026-09-12T08:00:00.000Z'

let client: Client

beforeEach(async () => {
  client = await migratedDb()
  await client.execute(`INSERT INTO families
    (slug, label, unit, vat_rate, vat_included, attributes)
    VALUES ('business_cards', 'Tarjetas personales', 'unit', 0.21, 1, '[]')`)
  await client.execute(`INSERT INTO items (id, slug, family_slug, tier, label)
    VALUES (1, 'bc_special_100_front', 'business_cards', 'sale', '100 tarjetas')`)
})

afterEach(() => {
  client.close()
})

async function prices(): Promise<number[]> {
  const versions = await client.execute('SELECT price FROM price_versions ORDER BY id')

  return versions.rows.map((row) => Number(row.price))
}

describe('recordPrice', () => {
  it('records the first price an item ever had', async () => {
    await recordPrice(client, { itemId: 1, price: 12100, recordedAt: AT })

    expect(await prices()).toEqual([12100])
  })

  it('appends nothing when the price did not move', async () => {
    await recordPrice(client, { itemId: 1, price: 12100, recordedAt: AT })
    await recordPrice(client, { itemId: 1, price: 12100, recordedAt: AT })

    expect(await prices()).toEqual([12100])
  })

  it('appends a version when the price moved, and the view reads the latest', async () => {
    await recordPrice(client, { itemId: 1, price: 12100, recordedAt: AT })
    await recordPrice(client, { itemId: 1, price: 14520, recordedAt: AT })

    const current = await client.execute('SELECT price FROM catalog_items WHERE id = 1')

    expect(await prices()).toEqual([12100, 14520])
    expect(current.rows[0]?.price).toBe(14520)
  })

  it('keeps the price edit that caused the version, which is what the owner signed', async () => {
    await client.execute(`INSERT INTO price_edits
      (id, operation, state, source, proposed_by, proposed_at)
      VALUES ('edit_1', '{"op":"percent"}', 'proposed', 'audio', '42', '${AT}')`)

    await recordPrice(client, { itemId: 1, price: 14520, recordedAt: AT, priceEditId: 'edit_1' })

    const version = await client.execute('SELECT price_edit_id FROM price_versions')

    expect(version.rows[0]?.price_edit_id).toBe('edit_1')
  })
})
