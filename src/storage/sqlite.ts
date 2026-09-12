import { createClient, type Client } from '@libsql/client'

export function dbUrl(): string {
  const dataDir = process.env.DATA_DIR ?? '.'
  return `file:${dataDir}/dante.db`
}

export async function withDb<T>(fn: (client: Client) => Promise<T>, url = dbUrl()): Promise<T> {
  const client = createClient({ url })
  try {
    return await fn(client)
  } finally {
    client.close()
  }
}
