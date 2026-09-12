import { createClient, type Client } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from '@/storage/migrate'

let client: Client

beforeEach(() => {
  client = createClient({ url: 'file::memory:' })
})

afterEach(() => {
  client.close()
})

async function tableNames(): Promise<string[]> {
  const result = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  )

  return result.rows.map((row) => String(row.name))
}

async function columnNames(table: string): Promise<string[]> {
  const result = await client.execute(`SELECT name FROM pragma_table_info('${table}')`)

  return result.rows.map((row) => String(row.name))
}

describe('migrate', () => {
  it('creates the tables the vertical writes to', async () => {
    await migrate(client)

    expect(await tableNames()).toEqual([
      'facts',
      'families',
      'inbound_messages',
      'item_applications',
      'items',
      'orders',
      'price_edit_lines',
      'price_edits',
      'price_versions',
      'telegram_updates',
    ])
  })

  it('replaces a view left by an older schema, which IF NOT EXISTS would keep', async () => {
    await client.execute('CREATE VIEW catalog_items AS SELECT 1 AS stale')
    await migrate(client)

    const view = await client.execute(
      "SELECT sql FROM sqlite_master WHERE name = 'catalog_items'",
    )

    expect(String(view.rows[0]?.sql)).toContain('price_version_id')
  })

  /**
   * The word moved: a discount row the owner has not confirmed is `unconfirmed`, and
   * `provisional` is now free for a price that is real but stale. `CREATE TABLE IF NOT EXISTS`
   * keeps whatever column a deployed volume already has, so without this the schema and the
   * writer disagree and the first seeded catalog fails on a column name.
   */
  it('renames the flag a volume from the old schema still carries', async () => {
    await migrate(client)
    // The volume as the old schema left it, rather than a hand written table: the real one
    // carries indexes and a view that a minimal stand-in would not.
    await client.execute('ALTER TABLE items RENAME COLUMN unconfirmed TO provisional')

    await migrate(client)

    expect(await columnNames('items')).toContain('unconfirmed')
    expect(await columnNames('items')).not.toContain('provisional')
  })

  it('runs twice in a row without error', async () => {
    await migrate(client)
    await migrate(client)

    expect(await tableNames()).toHaveLength(10)
  })
})

describe('the journal', () => {
  it('is WAL on a file database, which is what a replica reads', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dante-migrate-'))
    const file = createClient({ url: `file:${directory}/dante.db` })

    await migrate(file)
    const mode = await file.execute('PRAGMA journal_mode')
    file.close()
    await rm(directory, { recursive: true, force: true })

    expect(mode.rows[0]?.journal_mode).toBe('wal')
  })
})
