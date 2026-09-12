export type IsAdmin = (telegramUserId: string) => boolean

export type Denial = { telegramUserId: string | null }

export type RecordDenial = (denial: Denial) => void

export type AdminAllowlistConfig = {
  ids: string | undefined
  recordDenial: RecordDenial
}

export type AdminAllowlistEnvConfig = {
  recordDenial: RecordDenial
  env?: Record<string, string | undefined>
}

const TELEGRAM_USER_ID = /^[1-9][0-9]{0,18}$/

function parse(ids: string | undefined): ReadonlySet<string> {
  const entries = (ids ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  if (entries.some((entry) => !TELEGRAM_USER_ID.test(entry))) return new Set()

  return new Set(entries)
}

export function adminAllowlist(config: AdminAllowlistConfig): IsAdmin {
  const { ids, recordDenial } = config
  const allowed = parse(ids)

  return (telegramUserId) => {
    if (allowed.has(telegramUserId)) return true

    recordDenial({ telegramUserId: TELEGRAM_USER_ID.test(telegramUserId) ? telegramUserId : null })
    return false
  }
}

export function adminAllowlistFromEnv(config: AdminAllowlistEnvConfig): IsAdmin {
  const { recordDenial, env = process.env } = config

  return adminAllowlist({ ids: env.TELEGRAM_ADMIN_IDS, recordDenial })
}
