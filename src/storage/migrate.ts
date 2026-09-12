import type { Client } from '@libsql/client'
import { schemaTables, SCHEMA } from './schema'
import { dbUrl, withDb } from './sqlite'

export async function migrate(client: Client): Promise<void> {
  await client.execute('PRAGMA journal_mode = WAL')
  await client.migrate([...SCHEMA])
}

/**
 * Which declared tables a database does not have. Empty is the only healthy answer: a partial
 * answer means the migration ran against a different schema than this build carries.
 */
export async function missingTables(client: Client): Promise<string[]> {
  const present = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
  const held = new Set(present.rows.map((row) => String(row.name)))

  return schemaTables().filter((table) => !held.has(table))
}

/**
 * The boot call. `mastra/index.ts` built a LibSQLStore and never ran this, so on Fly the volume
 * held the store's own tables, the heartbeat table and nothing the repo declares. Every port was
 * in memory, so nothing failed, which is why it went unnoticed: the first sqlite port to land
 * would have met `no such table` on the first webhook and a 500 Telegram retries for a day.
 */
export async function migrateAtBoot(url = dbUrl()): Promise<void> {
  await withDb(migrate, url)
}
