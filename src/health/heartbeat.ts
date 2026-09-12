import type { Client } from '@libsql/client'

export type Heartbeat = {
  bootId: string
  beatAt: string
  beats: number
}

export async function beat(client: Client, bootId: string, beatAt: string): Promise<Heartbeat> {
  await client.execute(`CREATE TABLE IF NOT EXISTS heartbeat (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    boot_id TEXT NOT NULL,
    beat_at TEXT NOT NULL,
    beats INTEGER NOT NULL
  )`)

  await client.execute({
    sql: `INSERT INTO heartbeat (id, boot_id, beat_at, beats) VALUES (1, ?, ?, 1)
          ON CONFLICT(id) DO UPDATE SET
            boot_id = excluded.boot_id,
            beat_at = excluded.beat_at,
            beats = heartbeat.beats + 1`,
    args: [bootId, beatAt],
  })

  const row = (await client.execute('SELECT boot_id, beat_at, beats FROM heartbeat WHERE id = 1')).rows[0]

  return { bootId: String(row.boot_id), beatAt: String(row.beat_at), beats: Number(row.beats) }
}

export type Beat = () => Promise<Heartbeat>

const WINDOW_MS = 10 * 1000

/**
 * `/health/db` is unauthenticated, because a platform health check has no credential to
 * offer, and it writes a row every time it is asked. Anyone who knows the path can turn a
 * GET loop into a write loop against the volume.
 *
 * The answer is not a password on the endpoint, which would make the check useless to the
 * platform. It is a ceiling on what a check costs: one write per window, and every request
 * in between reads the last one. Fly polls every thirty seconds, so the check it needs is
 * the check it still gets.
 *
 * A failure is never cached. A database that has gone away has to be found on the next
 * request, not ten seconds after it comes back.
 */
export function throttledBeat(beat: Beat, windowMs = WINDOW_MS, now = () => Date.now()): Beat {
  let last: { at: number; heartbeat: Heartbeat } | null = null
  let running: Promise<Heartbeat> | null = null

  return async () => {
    const at = now()
    if (last !== null && at - last.at < windowMs) return last.heartbeat

    // Concurrent checks share the one in flight. Without this the window is open for as long
    // as a write takes, and a flood arriving inside it is a flood of writes.
    running ??= beat()
      .then((heartbeat) => {
        last = { at, heartbeat }

        return heartbeat
      })
      .finally(() => {
        running = null
      })

    return running
  }
}
