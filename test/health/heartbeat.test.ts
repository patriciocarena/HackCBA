import { describe, expect, it } from 'bun:test'
import { createClient } from '@libsql/client'
import { beat } from '@/health/heartbeat'

describe('beat', () => {
  it('records the boot id and counts the first beat', async () => {
    const client = createClient({ url: ':memory:' })

    const heartbeat = await beat(client, 'boot-1', '2026-09-11T22:00:00.000Z')

    expect(heartbeat).toEqual({ bootId: 'boot-1', beatAt: '2026-09-11T22:00:00.000Z', beats: 1 })
  })

  it('counts a later beat and takes the newer boot id', async () => {
    const client = createClient({ url: ':memory:' })
    await beat(client, 'boot-1', '2026-09-11T22:00:00.000Z')

    const heartbeat = await beat(client, 'boot-2', '2026-09-11T22:05:00.000Z')

    expect(heartbeat).toEqual({ bootId: 'boot-2', beatAt: '2026-09-11T22:05:00.000Z', beats: 2 })
  })
})
