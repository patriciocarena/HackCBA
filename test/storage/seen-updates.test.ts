import type { Client } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { sqliteSeenUpdates } from '@/storage/seen-updates'
import { migratedDb } from '@test/support/db'

let client: Client

beforeEach(async () => {
  client = await migratedDb()
})

afterEach(() => {
  client.close()
})

describe('sqliteSeenUpdates', () => {
  it('reports an update as unseen once and seen from then on', async () => {
    const seenUpdates = sqliteSeenUpdates(client)

    expect(await seenUpdates.seen(70)).toBeFalse()
    expect(await seenUpdates.seen(70)).toBeTrue()
  })

  it('claims each update on its own', async () => {
    const seenUpdates = sqliteSeenUpdates(client)
    await seenUpdates.seen(70)

    expect(await seenUpdates.seen(71)).toBeFalse()
  })

  it('lets exactly one of three concurrent deliveries through, which any implementation of this seam owes', async () => {
    const seenUpdates = sqliteSeenUpdates(client)

    const answers = await Promise.all([seenUpdates.seen(70), seenUpdates.seen(70), seenUpdates.seen(70)])

    expect(answers.filter((already) => !already)).toHaveLength(1)
  })

  it('holds a claim for as long as Telegram retries it, whatever arrives in between', async () => {
    let at = Date.parse('2026-09-12T09:30:00.000Z')
    const seenUpdates = sqliteSeenUpdates(client, 1000, () => at)
    await seenUpdates.seen(70)

    for (let other = 71; other < 81; other += 1) await seenUpdates.seen(other)
    at += 999

    expect(await seenUpdates.seen(70)).toBeTrue()
  })

  it('forgets a claim once Telegram has stopped retrying it, so the table is bounded', async () => {
    let at = Date.parse('2026-09-12T09:30:00.000Z')
    const seenUpdates = sqliteSeenUpdates(client, 1000, () => at)
    await seenUpdates.seen(70)

    at += 1001

    expect(await seenUpdates.seen(70)).toBeFalse()
  })

  it('outlives the process, which is the whole reason the table exists', async () => {
    await sqliteSeenUpdates(client).seen(70)

    expect(await sqliteSeenUpdates(client).seen(70)).toBeTrue()
  })
})
