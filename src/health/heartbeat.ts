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
