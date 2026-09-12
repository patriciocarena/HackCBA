import type { Client } from '@libsql/client'
import { SCHEMA } from './schema'

export async function migrate(client: Client): Promise<void> {
  await client.execute('PRAGMA journal_mode = WAL')
  await client.migrate([...SCHEMA])
}
