import type { Client } from '@libsql/client'
import type { SeenUpdates } from '@/telegram/seen-updates'

const RETRY_WINDOW_MS = 48 * 60 * 60 * 1000

export function sqliteSeenUpdates(
  client: Client,
  windowMs = RETRY_WINDOW_MS,
  now = () => Date.now(),
): SeenUpdates {
  return {
    async seen(updateId) {
      const at = now()

      const [, claim] = await client.batch(
        [
          {
            sql: 'DELETE FROM telegram_updates WHERE claimed_at < ?',
            args: [new Date(at - windowMs).toISOString()],
          },
          {
            sql: `INSERT INTO telegram_updates (update_id, claimed_at) VALUES (?, ?)
                  ON CONFLICT (update_id) DO NOTHING`,
            args: [updateId, new Date(at).toISOString()],
          },
        ],
        'write',
      )

      return claim?.rowsAffected === 0
    },
  }
}
