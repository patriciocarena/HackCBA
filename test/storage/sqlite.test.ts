import { afterEach, describe, expect, it } from 'bun:test'
import { dbUrl, withDb } from '@/storage/sqlite'
import { migrate } from '@/storage/migrate'

const original = process.env.DATA_DIR

afterEach(() => {
  if (original === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = original
})

describe('dbUrl', () => {
  it('puts the database in DATA_DIR', () => {
    process.env.DATA_DIR = '/data'

    expect(dbUrl()).toBe('file:/data/dante.db')
  })

  it('falls back to the working directory', () => {
    delete process.env.DATA_DIR

    expect(dbUrl()).toBe('file:./dante.db')
  })
})

describe('the client we pin', () => {
  it('enables foreign keys on every connection, which plain SQLite does not', async () => {
    const orphaned = await withDb(async (client) => {
      await migrate(client)

      return client
        .execute('INSERT INTO item_applications (item_id, applies_to_id) VALUES (1, 2)')
        .then(() => null)
        .catch((error: Error) => error.message)
    }, 'file::memory:')

    expect(orphaned).toContain('FOREIGN KEY constraint failed')
  })

  it('reports the pragma as on, so an upgrade that changes the default fails here', async () => {
    const pragma = await withDb(
      async (client) => (await client.execute('PRAGMA foreign_keys')).rows[0],
      'file::memory:',
    )

    expect(Number(pragma?.foreign_keys)).toBe(1)
  })
})
