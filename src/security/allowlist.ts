export type IsAdmin = (telegramUserId: string) => boolean

export type Denial = { telegramUserId: string | null }

export type AdminAllowlistConfig = {
  ids: string | undefined
  recordDenial: (denial: Denial) => void
}

export function adminAllowlist(config: AdminAllowlistConfig): IsAdmin {
  const { ids, recordDenial } = config
  const allowed = new Set((ids ?? '').split(','))

  return (telegramUserId) => {
    if (allowed.has(telegramUserId)) return true

    recordDenial({ telegramUserId })
    return false
  }
}
