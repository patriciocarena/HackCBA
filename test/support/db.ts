import { createClient, type Client } from '@libsql/client'
import { migrate } from '../../src/storage/migrate'

export async function migratedDb(): Promise<Client> {
  const client = createClient({ url: 'file::memory:' })

  await migrate(client)

  return client
}
