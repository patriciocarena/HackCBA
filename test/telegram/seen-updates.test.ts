import { describe, expect, it } from 'bun:test'
import { inMemorySeenUpdates } from '@/telegram/seen-updates'

describe('inMemorySeenUpdates', () => {
  it('reports an update as unseen once and seen from then on', async () => {
    const seenUpdates = inMemorySeenUpdates()

    expect(await seenUpdates.seen(70)).toBeFalse()
    expect(await seenUpdates.seen(70)).toBeTrue()
  })

  it('claims each update on its own', async () => {
    const seenUpdates = inMemorySeenUpdates()
    await seenUpdates.seen(70)

    expect(await seenUpdates.seen(71)).toBeFalse()
  })

  it('lets exactly one of three concurrent deliveries through, which any implementation of this seam owes', async () => {
    const seenUpdates = inMemorySeenUpdates()

    const answers = await Promise.all([seenUpdates.seen(70), seenUpdates.seen(70), seenUpdates.seen(70)])

    expect(answers.filter((already) => !already)).toHaveLength(1)
  })

  it('holds a claim for as long as Telegram retries it, whatever arrives in between', async () => {
    let at = Date.parse('2026-09-12T09:30:00.000Z')
    const seenUpdates = inMemorySeenUpdates(1000, () => at)
    await seenUpdates.seen(70)

    for (let other = 71; other < 81; other += 1) await seenUpdates.seen(other)
    at += 999

    expect(await seenUpdates.seen(70)).toBeTrue()
  })

  it('forgets a claim once Telegram has stopped retrying it, so a long lived process is bounded', async () => {
    let at = Date.parse('2026-09-12T09:30:00.000Z')
    const seenUpdates = inMemorySeenUpdates(1000, () => at)
    await seenUpdates.seen(70)

    at += 1001

    expect(await seenUpdates.seen(70)).toBeFalse()
  })
})
