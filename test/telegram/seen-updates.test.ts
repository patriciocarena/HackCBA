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

  it('forgets the oldest claim past its capacity, so a long lived process is bounded', async () => {
    const seenUpdates = inMemorySeenUpdates(2)
    await seenUpdates.seen(70)
    await seenUpdates.seen(71)
    await seenUpdates.seen(72)

    expect(await seenUpdates.seen(71)).toBeTrue()
    expect(await seenUpdates.seen(70)).toBeFalse()
  })
})
