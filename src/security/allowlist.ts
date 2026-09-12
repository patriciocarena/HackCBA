export type IsAdmin = (telegramUserId: string) => boolean

export type Denial = { telegramUserId: string | null }

export type AdminAllowlistConfig = {
  ids: string | undefined
  recordDenial: (denial: Denial) => void
}

function parse(ids: string | undefined): ReadonlySet<string> {
  const entries = (ids ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  return new Set(entries)
}

export function adminAllowlist(config: AdminAllowlistConfig): IsAdmin {
  const { ids, recordDenial } = config
  const allowed = parse(ids)

  return (telegramUserId) => {
    if (allowed.has(telegramUserId)) return true

    recordDenial({ telegramUserId })
    return false
  }
}
