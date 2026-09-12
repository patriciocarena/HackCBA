export type SeenUpdates = {
  seen(updateId: number): Promise<boolean>
}

export function inMemorySeenUpdates(capacity = 1000): SeenUpdates {
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
