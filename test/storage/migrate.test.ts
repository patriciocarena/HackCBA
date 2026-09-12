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

describe('migrate', () => {
  it('creates the tables the vertical writes to', async () => {
    await migrate(client)

    expect(await tableNames()).toEqual([
      'facts',
      'families',
      'item_applications',
      'items',
      'orders',
      'price_edit_lines',
      'price_edits',
      'price_versions',
    ])
  })

  it('runs twice in a row without error', async () => {
    await migrate(client)
    await migrate(client)

    expect(await tableNames()).toHaveLength(8)
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
