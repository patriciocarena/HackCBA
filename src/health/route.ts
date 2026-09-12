import { registerApiRoute } from '@mastra/core/server'
import { withDb } from '../storage/sqlite'
import { beat, throttledBeat } from './heartbeat'

const bootId = crypto.randomUUID()

export function healthDbRoute() {
  // Built once, not per request: a throttle minted inside the handler throttles nothing.
  const heartbeat = throttledBeat(() => withDb((client) => beat(client, bootId, new Date().toISOString())))

  return registerApiRoute('/health/db', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => c.json(await heartbeat(), 200),
  })
}
