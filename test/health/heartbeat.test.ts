import { describe, expect, it } from 'bun:test'
import { createClient } from '@libsql/client'
import { beat, throttledBeat, type Heartbeat } from '@/health/heartbeat'

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

describe('throttledBeat', () => {
  function counted(): { beats: number; beat: () => Promise<Heartbeat> } {
    const state = { beats: 0, beat: async () => ({ bootId: 'boot-1', beatAt: 'then', beats: (state.beats += 1) }) }

    return state
  }

  it('writes once inside its window, however often it is asked', async () => {
    const counter = counted()
    const heartbeat = throttledBeat(counter.beat, 1000, () => 0)

    await heartbeat()
    await heartbeat()
    await heartbeat()

    expect(counter.beats).toBe(1)
  })

  it('answers a throttled call with the last beat, so the check still reads true', async () => {
    const counter = counted()
    const heartbeat = throttledBeat(counter.beat, 1000, () => 0)

    const first = await heartbeat()

    expect(await heartbeat()).toEqual(first)
  })

  it('writes again once the window has passed, because a stale beat proves nothing', async () => {
    let at = 0
    const counter = counted()
    const heartbeat = throttledBeat(counter.beat, 1000, () => at)
    await heartbeat()

    at = 1001
    await heartbeat()

    expect(counter.beats).toBe(2)
  })

  it('lets concurrent checks share one write rather than racing into several', async () => {
    const counter = counted()
    const heartbeat = throttledBeat(counter.beat, 1000, () => 0)

    await Promise.all([heartbeat(), heartbeat(), heartbeat()])

    expect(counter.beats).toBe(1)
  })

  it('does not cache a failure, so the next check reaches the database again', async () => {
    let calls = 0
    const beatOrThrow = async () => {
      calls += 1
      if (calls === 1) throw new Error('volume is gone')

      return { bootId: 'boot-1', beatAt: 'then', beats: calls }
    }
    const heartbeat = throttledBeat(beatOrThrow, 1000, () => 0)

    await expect(heartbeat()).rejects.toThrow('volume is gone')

    expect(await heartbeat()).toMatchObject({ beats: 2 })
  })
})
