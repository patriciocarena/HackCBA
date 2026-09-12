export type IsAdmin = (telegramUserId: string) => boolean

export type AdminAllowlistConfig = {
  ids: string | undefined
}

export type AdminAllowlistEnvConfig = {
  env?: Record<string, string | undefined>
}

const TELEGRAM_USER_ID = /^[1-9][0-9]{0,18}$/

function isTelegramUserId(value: string): boolean {
  return TELEGRAM_USER_ID.test(value)
}

function parse(ids: string | undefined): ReadonlySet<string> {
  const entries = (ids ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  if (!entries.every(isTelegramUserId)) return new Set()

  return new Set(entries)
}

export function adminAllowlist(config: AdminAllowlistConfig): IsAdmin {
  const allowed = parse(config.ids)

  return (telegramUserId) => allowed.has(telegramUserId)
}

export function adminAllowlistFromEnv(config: AdminAllowlistEnvConfig = {}): IsAdmin {
  const { env = process.env } = config

  return adminAllowlist({ ids: env.TELEGRAM_ADMIN_IDS })
}
