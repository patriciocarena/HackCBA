import { pathToFileURL } from 'node:url'
import { requireEnv } from '../config/env'

const BACKOFF_MS = [2000, 5000, 15000, 30000, 60000]

type Config = { token: string; url: string; secret: string }

export const API = 'https://api.telegram.org'

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

type Deps = {
  fetch?: Fetch
  sleep?: (ms: number) => Promise<void>
}

export async function setTelegramWebhook(cfg: Config, deps: Deps = {}): Promise<void> {
  const fetchFn = deps.fetch ?? fetch
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))

  for (let attempt = 0; ; attempt += 1) {
    const failure = await attemptSetWebhook(cfg, fetchFn)
    if (failure === null) return
    if (attempt >= BACKOFF_MS.length) throw new Error(`setWebhook failed: ${failure}`)
    await sleep(BACKOFF_MS[attempt]!)
  }
}

async function attemptSetWebhook(cfg: Config, fetchFn: Fetch): Promise<string | null> {
  const res = await fetchFn(`${API}/bot${cfg.token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: cfg.url, secret_token: cfg.secret }),
  })
  const body = (await res.json()) as { ok?: boolean; description?: string }
  if (!res.ok || !body.ok) return body.description ?? String(res.status)
  return null
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await setTelegramWebhook({
    token: requireEnv('TELEGRAM_BOT_TOKEN'),
    url: requireEnv('TELEGRAM_WEBHOOK_URL'),
    secret: requireEnv('TELEGRAM_WEBHOOK_SECRET'),
  })
  console.log(`Telegram webhook registered: ${process.env.TELEGRAM_WEBHOOK_URL}`)
}
