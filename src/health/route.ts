import type { Client } from '@libsql/client'
import { registerApiRoute } from '@mastra/core/server'
import { missingTables } from '../storage/migrate'
import { withDb } from '../storage/sqlite'
import { beat, type Heartbeat } from './heartbeat'

const bootId = crypto.randomUUID()

export type DbHealth = Heartbeat & { ok: boolean; missingTables: string[] }

/**
 * A heartbeat alone was green on a database holding nothing but the heartbeat table, which `beat`
 * creates itself. Fly believed it, so the one signal that a deploy had no schema said the deploy
 * was fine. The check now answers the question it was named for: is this database the one this
 * build expects.
 */
export async function dbHealth(client: Client, id: string, beatAt: string): Promise<DbHealth> {
  const heartbeat = await beat(client, id, beatAt)
  const missing = await missingTables(client)

  return { ...heartbeat, ok: missing.length === 0, missingTables: missing }
}

export function healthDbRoute() {
  return registerApiRoute('/health/db', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const health = await withDb((client) => dbHealth(client, bootId, new Date().toISOString()))

      // 503, so a machine with no schema is taken out of rotation rather than handed customers.
      return c.json(health, health.ok ? 200 : 503)
    },
  })
}
