import { registerApiRoute } from '@mastra/core/server'
import { requireEnv } from '../config/env'
import { adminAllowlistFromEnv } from '../security/allowlist'
import { telegramWebhook, type WebhookDeps } from './webhook'

export function telegramWebhookRoute(deps: Omit<WebhookDeps, 'secret'> = {}) {
  const handle = telegramWebhook({
    ...deps,
    isAdmin: deps.isAdmin ?? adminAllowlistFromEnv(),
    secret: requireEnv('TELEGRAM_WEBHOOK_SECRET'),
  })

  return registerApiRoute('/telegram/webhook', {
    method: 'POST',
    requiresAuth: false,
    handler: (c) => handle(c.req.raw),
  })
}
