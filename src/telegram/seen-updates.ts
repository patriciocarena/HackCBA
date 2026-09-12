export type SeenUpdates = {
  seen(updateId: number): Promise<boolean>
  /**
   * Give a claim back, for an update the process claimed and then failed to answer. Claiming
   * before answering is what keeps one update from being answered twice; releasing on a failure
   * is what keeps it from being answered zero times.
   */
  release(updateId: number): Promise<void>
}

const RETRY_WINDOW_MS = 48 * 60 * 60 * 1000

// ponytail: in memory, A3's table when the process restarts
export function inMemorySeenUpdates(windowMs = RETRY_WINDOW_MS, now = () => Date.now()): SeenUpdates {
  const claimedAt = new Map<number, number>()

  return {
    async seen(updateId) {
      const at = now()

      for (const [claimed, when] of claimedAt) {
        if (at - when <= windowMs) break
        claimedAt.delete(claimed)
      }

      if (claimedAt.has(updateId)) return true

      claimedAt.set(updateId, at)

      return false
    },

    async release(updateId) {
      claimedAt.delete(updateId)
    },
  }
}
