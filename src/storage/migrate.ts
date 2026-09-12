import type { Client } from '@libsql/client'
import { SCHEMA } from './schema'

export async function migrate(client: Client): Promise<void> {
  await client.execute('PRAGMA journal_mode = WAL')
  await renameColumn(client, 'items', 'provisional', 'unconfirmed')
  await client.migrate([...SCHEMA])
}

/**
 * A column rename, which `CREATE TABLE IF NOT EXISTS` cannot express: it keeps whatever shape
 * a deployed volume already has, so a renamed column in SCHEMA reaches a fresh database and
 * silently misses every existing one, and the writer then fails on a column name.
 *
 * Guarded rather than blind, because `migrate` runs on every boot and the whole of SCHEMA is
 * safe to run twice. It runs before SCHEMA so the statements below it see the new name.
 *
 * ponytail: one rename, read from here. A second one wants a table of what has been applied,
 * which is the point at which this stops being a guard and becomes a migration runner.
 */
async function renameColumn(client: Client, table: string, from: string, to: string): Promise<void> {
  const found = await client.execute({
    sql: `SELECT count(*) AS n FROM pragma_table_info(?) WHERE name = ?`,
    args: [table, from],
  })
  if (Number(found.rows[0]?.n ?? 0) === 0) return

  await client.execute(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`)
}
