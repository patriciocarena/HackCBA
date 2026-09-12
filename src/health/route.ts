import { registerApiRoute } from '@mastra/core/server'
import { withDb } from '../storage/sqlite'
import { beat } from './heartbeat'

const bootId = crypto.randomUUID()

export function healthDbRoute() {
  return registerApiRoute('/health/db', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      const heartbeat = await withDb((client) => beat(client, bootId, new Date().toISOString()))
      return c.json(heartbeat, 200)
    },
  })
}
