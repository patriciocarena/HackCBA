import { describe, expect, it } from 'bun:test'
import { inMemoryRateLimit } from '@/telegram/rate-limit'

describe('inMemoryRateLimit', () => {
  it('lets a sender through up to its budget and refuses the next one', async () => {
    const limit = inMemoryRateLimit(3, 1000, () => 0)

    expect([await limit.allow('42'), await limit.allow('42'), await limit.allow('42')]).toEqual([true, true, true])
    expect(await limit.allow('42')).toBeFalse()
  })

  it('spends one budget per sender, so a flood from one does not silence the rest', async () => {
    const limit = inMemoryRateLimit(1, 1000, () => 0)
    await limit.allow('42')

    expect(await limit.allow('43')).toBeTrue()
  })

  it('gives the budget back once the window has passed', async () => {
    let at = Date.parse('2026-09-12T09:30:00.000Z')
    const limit = inMemoryRateLimit(1, 1000, () => at)
    await limit.allow('42')

    at += 1001

    expect(await limit.allow('42')).toBeTrue()
  })

  it('slides rather than resets, so the budget is never spent twice in one window', async () => {
    let at = Date.parse('2026-09-12T09:30:00.000Z')
    const limit = inMemoryRateLimit(2, 1000, () => at)
    await limit.allow('42')
    at += 600
    await limit.allow('42')

    at += 300

    expect(await limit.allow('42')).toBeFalse()
  })

  it('forgets a sender who stopped, so a long lived process is bounded', async () => {
    let at = Date.parse('2026-09-12T09:30:00.000Z')
    const limit = inMemoryRateLimit(2, 1000, () => at)
    await limit.allow('42')

    at += 1001

    expect(limit.size()).toBe(1)
    await limit.allow('43')
    expect(limit.size()).toBe(1)
  })
})
