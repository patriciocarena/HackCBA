import { createClient, type Client } from '@libsql/client'

/**
 * `||` and not `??`. `.env.example` ships `DATA_DIR=` and the README's first step is to copy
 * it, so the empty string is the value a fresh checkout runs with, and `??` falls back only on
 * undefined: the database opened at `/dante.db`, which on the Fly machine is outside the
 * volume and loses every write on the next deploy.
 */
export function dbUrl(): string {
  const dataDir = process.env.DATA_DIR || '.'
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
