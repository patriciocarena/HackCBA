import { registerApiRoute, type ApiRoute } from '@mastra/core/server'
import { baseConfig } from '../catalog/business-cards'
import type { LiveCatalog } from '../catalog/live-catalog'
import { requireEnv } from '../config/env'
import { customerTurn } from '../conversation/customer-turn'
import { openRouterModel } from '../conversation/openrouter'
import { inMemorySale } from '../conversation/sale'
import { adminAllowlistFromEnv } from '../security/allowlist'
import type { FetchLike } from '../voice/transcription'
import type { Turn } from './inbound'
import { telegramSend } from './send'
import { telegramWebhook, type WebhookDeps } from './webhook'

export function telegramWebhookRoute(
  deps: Omit<WebhookDeps, 'secret'>,
  catalog: LiveCatalog,
  fetchImpl: FetchLike = fetch,
): ApiRoute {
  const handle = telegramWebhook({
    ...deps,
    isAdmin: deps.isAdmin ?? adminAllowlistFromEnv(),
    secret: requireEnv('TELEGRAM_WEBHOOK_SECRET'),
    turn: deps.turn ?? productionTurn(fetchImpl, catalog),
  })

  return registerApiRoute('/telegram/webhook', {
    method: 'POST',
    requiresAuth: false,
    handler: (c) => handle(c.req.raw),
  })
}

/**
 * The seam where the wiring is real. Every key is read here, so a deployment missing one
 * dies at boot rather than acknowledging customers it will never answer.
 */
function productionTurn(fetchImpl: FetchLike, catalog: LiveCatalog): Turn {
  const model = openRouterModel({
    apiKey: requireEnv('OPENROUTER_API_KEY'),
    model: requireEnv('OPENROUTER_MODEL'),
    fetchImpl,
  })

  // Built once, beside the states Map customerTurn holds, and for the same reason: a store
  // built per message loses the quote between the message that gave it and the one that
  // accepts it, and every unit test stays green while it does.
  const sale = inMemorySale({
    alias: requireEnv('DEPOSIT_ALIAS'),
    now: () => new Date().toISOString(),
    id: () => crypto.randomUUID(),
  })

  return customerTurn(
    // ponytail: no fact is loaded, so every fact question escalates. That is the fail closed
    // half of the rule; the loaded half arrives with the table that holds them.
    { rows: catalog.rows, config: baseConfig, facts: [], extract: model.extract, write: model.write, sale },
    telegramSend(requireEnv('TELEGRAM_BOT_TOKEN'), fetchImpl),
  )
}
