import { registerApiRoute, type ApiRoute } from '@mastra/core/server'
import { baseConfig, businessCards } from '../catalog/business-cards'
import { shopFacts } from '../catalog/shop-facts'
import type { LiveCatalog } from '../catalog/live-catalog'
import { requireEnv } from '../config/env'
import { adminTurn } from '../conversation/admin-turn'
import { customerTurn } from '../conversation/customer-turn'
import { openRouterModel } from '../conversation/openrouter'
import type { Write } from '../conversation/turn'
import { receiptTurn, type Notify } from '../conversation/receipt-path'
import { receiptReader } from '../conversation/receipt-reading'
import { inMemorySale } from '../conversation/sale'
import { printingSale, workOrders } from '../conversation/work-order'
import { inMemoryReceipts } from '../domain/deposit'
import { adminAllowlistFromEnv } from '../security/allowlist'
import { readAdminAudio } from '../voice/admin-audio'
import { extractionFromEnv } from '../voice/price-edit-intent'
import type { PriceEditStore } from '../voice/price-edit-proposal'
import { transcriptionFromEnv, type FetchLike } from '../voice/transcription'
import { telegramAudio } from './audio-file'
import { confirmCallback, type RecordVersion } from './confirm-callback'
import type { Turn } from './inbound'
import { telegramAnswerCallback, telegramAsk, telegramChatAction, telegramSend } from './send'
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
  /**
   * The writing phase. It is a Mastra agent in production and carries its own HTTP client, so
   * unlike everything else here it cannot be reached through `fetchImpl`. Minting it outside is
   * also what keeps its Observational Memory to one instance: an agent built per message holds
   * a memory nothing ever reads twice.
   */
  write: Write
}

export function telegramWebhookRoute(
  deps: Partial<Omit<WebhookDeps, 'secret'>>,
  wiring: Wiring,
  fetchImpl: FetchLike = fetch,
): ApiRoute {
  const isAdmin = deps.isAdmin ?? adminAllowlistFromEnv()
  const botToken = requireEnv('TELEGRAM_BOT_TOKEN')

  const handle = telegramWebhook({
    ...deps,
    isAdmin,
    secret: requireEnv('TELEGRAM_WEBHOOK_SECRET'),
    typing: deps.typing ?? telegramChatAction(botToken, fetchImpl),
    turn: deps.turn ?? productionTurn(fetchImpl, wiring),
    onCallback:
      deps.onCallback ??
      confirmCallback({
        load: wiring.edits.load,
        save: wiring.edits.save,
        catalog: wiring.catalog,
        record: wiring.record,
        isAdmin,
        answer: telegramAnswerCallback(botToken, fetchImpl),
        send: telegramSend(botToken, fetchImpl),
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
  const held = inMemorySale({
    alias: requireEnv('DEPOSIT_ALIAS'),
    now: () => new Date().toISOString(),
    id: () => crypto.randomUUID(),
  })

  const token = requireEnv('TELEGRAM_BOT_TOKEN')
  const send = telegramSend(token, fetchImpl)
  const ownerChat = requireEnv('OWNER_CHAT_ID')

  // One line to the owner's chat, shared by the two things he has to act on himself: a receipt
  // verdict, and a customer who sent something Dante cannot read.
  const notify: Notify = (text) => send(ownerChat, text)

  // Confirming a deposit is what prints the job, so the sale everything else holds is the one
  // that prints. Hanging it off the state rather than off the receipt is what makes the vision
  // path and a person typing the confirmation produce the same single work order.
  //
  // Nothing in src/ confirms a deposit yet, so no test drives this line through the route.
  // The wrapper is covered where it is defined; what is uncovered is that the route uses it,
  // and that closes when the vision path lands a caller for sale.confirmDeposit.
  const sale = printingSale(
    held,
    workOrders({
      rows: wiring.catalog.rows,
      family: businessCards,
      send,
      ownerChatId: () => ownerChat,
    }),
  )

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
      notify,
      // The customer's own chat. The receipt path stops the turn, so without this line the
      // one message a customer most needs an answer to is the one they get silence for.
      reply: send,
      // getFile plus download, which telegramAudio already is: it takes a file id and returns
      // bytes, and a photo is fetched the same two ways an audio is. C11 uses the same seam.
      fetchImage: telegramAudio(token, fetchImpl),
      readImage: receiptReader(model.look),
      // The port owns its orders, so the port does the writing. confirmDeposit is untouched
      // beside it and an admin keeps every power they had.
      confirm: sale.confirmFromReceipt,
    },
    customerTurn(
      // ponytail: the seed, not the facts table. The rows are the same shape from the same
      // file either way, so the day something reads them back it is a change of reader.
      { rows: wiring.catalog.rows, config: baseConfig, facts: shopFacts, extract: model.extract, write: wiring.write, sale },
      send,
      notify,
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
    fallback: customer,
  })

  return dispatch(customer, owner)
}

/** An owner's message goes to the owner's turn and a customer's to the customer's. */
export function dispatch(customer: Turn, owner: Turn): Turn {
  return async (message) => {
    await (message.role === 'admin' ? owner : customer)(message)
  }
}
