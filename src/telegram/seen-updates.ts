export type SeenUpdates = {
  seen(updateId: number): Promise<boolean>
}

const CAPACITY = 1000

export function inMemorySeenUpdates(capacity = CAPACITY): SeenUpdates {
  const claimed = new Set<number>()

  return {
    async seen(updateId) {
      if (claimed.has(updateId)) return true

      claimed.add(updateId)
      if (claimed.size > capacity) claimed.delete(claimed.values().next().value!)

      return false
    },
  }
}
