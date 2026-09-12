import { registerApiRoute } from '@mastra/core/server'
import { requireEnv } from '../config/env'
import { telegramWebhook, type WebhookDeps } from './webhook'

export function telegramWebhookRoute(deps: Omit<WebhookDeps, 'secret'> = {}) {
  const handle = telegramWebhook({ ...deps, secret: requireEnv('TELEGRAM_WEBHOOK_SECRET') })

  return registerApiRoute('/telegram/webhook', {
    method: 'POST',
    requiresAuth: false,
    handler: (c) => handle(c.req.raw),
  })
}
