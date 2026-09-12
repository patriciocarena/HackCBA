export type IsAdmin = (telegramUserId: string) => boolean

export type Denial = { telegramUserId: string | null }

export type AdminAllowlistConfig = {
  ids: string | undefined
  recordDenial: (denial: Denial) => void
}

export function adminAllowlist(config: AdminAllowlistConfig): IsAdmin {
  const { recordDenial } = config

  return (telegramUserId) => {
    recordDenial({ telegramUserId })
    return false
  }
}
