export type RateLimit = {
  allow(key: string): Promise<boolean>
}

const LIMIT = 20
const WINDOW_MS = 60 * 1000

/**
 * The half of D8 that never landed. The secret header turns away a request that never came
 * from Telegram, and dedupe turns away the same update twice; neither of them costs anything
 * to a sender who holds a valid secret and sends a thousand different messages, and every one
 * of those reaches a model call.
 *
 * Keyed on the sender rather than the request, because every request arrives from Telegram's
 * addresses and there is no other request to compare against.
 *
 * ponytail: in memory, A3's table when the budget has to survive a restart. A restart giving
 * a flooder their budget back is a smaller loss than a bucket the process cannot read.
 */
export function inMemoryRateLimit(
  limit = LIMIT,
  windowMs = WINDOW_MS,
  now = () => Date.now(),
): RateLimit & { size(): number } {
  const spent = new Map<string, number[]>()

  function live(at: number, spentAt: number[]): number[] {
    return spentAt.filter((when) => at - when < windowMs)
  }

  return {
    async allow(key) {
      const at = now()

      // Every key, not just this one. A flood arrives under many senders as readily as one,
      // and a map that only ever grows is the same exhaustion this is here to stop.
      for (const [sender, spentAt] of spent) {
        const still = live(at, spentAt)
        if (still.length === 0) spent.delete(sender)
        else spent.set(sender, still)
      }

      const mine = spent.get(key) ?? []
      if (mine.length >= limit) return false

      spent.set(key, [...mine, at])

      return true
    },

    // Not on the port. What a caller may do with a budget is ask it, and the count is here so
    // a test can hold this implementation to the bound its own comment claims.
    size() {
      return spent.size
    },
  }
}
