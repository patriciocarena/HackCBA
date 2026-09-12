import { registerApiRoute, type ApiRoute } from '@mastra/core/server'
import { baseConfig, businessCards } from '../catalog/business-cards'
import type { LiveCatalog } from '../catalog/live-catalog'
import { requireEnv } from '../config/env'
import { adminTurn } from '../conversation/admin-turn'
import { customerTurn } from '../conversation/customer-turn'
import { openRouterModel } from '../conversation/openrouter'
import { receiptTurn } from '../conversation/receipt-path'
import { inMemorySale } from '../conversation/sale'
import { inMemoryReceipts } from '../domain/deposit'
import { adminAllowlistFromEnv } from '../security/allowlist'
import { readAdminAudio } from '../voice/admin-audio'
import { extractionFromEnv } from '../voice/price-edit-intent'
import type { PriceEditStore } from '../voice/price-edit-proposal'
import { transcriptionFromEnv, type FetchLike } from '../voice/transcription'
import { telegramAudio } from './audio-file'
import { confirmCallback, type RecordVersion } from './confirm-callback'
import type { Turn } from './inbound'
import { telegramAsk, telegramSend } from './send'
import { telegramWebhook, type WebhookDeps } from './webhook'

/**
 * The two halves of a price edit, and the one catalog they move. Both ends are minted here
 * from the same `edits`, because a disagreement about which store holds a proposal is the
 * invisible kind: the admin turn saves, the callback loads from somewhere else, every unit
 * test on both sides passes and the owner's press finds nothing. See ADR 0017.
 */
export type Wiring = {
  catalog: LiveCatalog
  edits: PriceEditStore
  record: RecordVersion
}

export function telegramWebhookRoute(
  deps: Partial<Omit<WebhookDeps, 'secret'>>,
  wiring: Wiring,
  fetchImpl: FetchLike = fetch,
): ApiRoute {
  const isAdmin = deps.isAdmin ?? adminAllowlistFromEnv()

  const handle = telegramWebhook({
    ...deps,
    isAdmin,
    secret: requireEnv('TELEGRAM_WEBHOOK_SECRET'),
    turn: deps.turn ?? productionTurn(fetchImpl, wiring),
    onCallback:
      deps.onCallback ??
      confirmCallback({
        load: wiring.edits.load,
        save: wiring.edits.save,
        catalog: wiring.catalog,
        record: wiring.record,
        isAdmin,
        versionId: () => crypto.randomUUID(),
        now: () => new Date().toISOString(),
      }),
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
 *
 * The role decides which turn runs, and the role came from the allowlist in the webhook.
 * Dispatching here rather than inside `turn()` keeps the customer turn's three phases unaware
 * that an owner exists.
 */
function productionTurn(fetchImpl: FetchLike, wiring: Wiring): Turn {
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

  const token = requireEnv('TELEGRAM_BOT_TOKEN')
  const send = telegramSend(token, fetchImpl)
  const ownerChat = requireEnv('OWNER_CHAT_ID')

  // The receipt is read before the customer's turn and a recorded one stops there, so
  // "ya transferi" is never handed to extraction, which would read it as `other` and
  // escalate the conversation the customer had just paid for.
  //
  // `sale.orderFor` is the whole wiring, and it is the same argument the Wiring comment
  // above makes about `edits`: a receipt path with a store of its own records against an
  // order nobody confirms, every test on both sides stays green, and the owner's press
  // moves an order no receipt is attached to.
  const customer = receiptTurn(
    {
      findOrder: sale.orderFor,
      // Built once beside the sale, for the reason above it. Written through and never read;
      // ADR 0013 says why there is no accessor to add one.
      store: inMemoryReceipts(),
      notify: (text) => send(ownerChat, text),
    },
    customerTurn(
      // ponytail: no fact is loaded, so every fact question escalates. That is the fail closed
      // half of the rule; the loaded half arrives with the table that holds them.
      { rows: wiring.catalog.rows, config: baseConfig, facts: [], extract: model.extract, write: model.write, sale },
      send,
    ),
  )

  const owner = adminTurn({
    read: readAdminAudio({
      rows: wiring.catalog.rows,
      family: businessCards,
      transcription: transcriptionFromEnv(process.env, fetchImpl),
      extraction: extractionFromEnv(process.env, fetchImpl),
      fetchAudio: telegramAudio(token, fetchImpl),
      save: wiring.edits.save,
    }),
    ask: telegramAsk(token, fetchImpl),
    send,
  })

  return dispatch(customer, owner)
}

/** An owner's message goes to the owner's turn and a customer's to the customer's. */
export function dispatch(customer: Turn, owner: Turn): Turn {
  return async (message) => {
    await (message.role === 'admin' ? owner : customer)(message)
  }
}
