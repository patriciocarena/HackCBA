import { describe, expect, test } from 'bun:test'
import { catalogRows, baseConfig } from '@/catalog/business-cards'
import { customerTurn } from '@/conversation/customer-turn'
import { receiptTurn } from '@/conversation/receipt-path'
import { inMemorySale } from '@/conversation/sale'
import type { TurnDeps } from '@/conversation/turn'
import type { Receipt, ReceiptStore } from '@/domain/deposit'
import { conversationId } from '@/domain/types'
import { adminAllowlist } from '@/security/allowlist'
import type { Send } from '@/telegram/send'
import { liveCatalog } from '@/catalog/live-catalog'
import { inMemoryPriceEdits } from '@/voice/price-edit-proposal'
import { telegramWebhookRoute } from '@/telegram/route'
import type { FetchLike } from '@/voice/transcription'
import { telegramWebhook } from '@/telegram/webhook'
import { OFFSET_1000 } from '@test/support/fixtures'

const SECRET = 'a-long-random-string'
const OWNER_CHAT = '77'

// The composition root reads every key at boot, which is the point of it. These are the
// ones it needs to be built at all.
process.env.TELEGRAM_WEBHOOK_SECRET = SECRET
process.env.TELEGRAM_BOT_TOKEN = 'a-bot-token'
process.env.OPENROUTER_API_KEY = 'a-key'
process.env.OPENROUTER_MODEL = 'a-model'
process.env.DEPOSIT_ALIAS = 'dante.imprenta.mp'
process.env.OWNER_CHAT_ID = OWNER_CHAT
process.env.ELEVENLABS_API_KEY = 'a-transcription-key'
process.env.ELEVENLABS_MODEL_ID = 'scribe_v2'
process.env.TRANSCRIPTION_LANGUAGE = 'es'
const NOW = '2026-09-12T18:00:00.000Z'
const ADMIN = '77'
const CUSTOMER_CHAT = '-100'
const conversation = conversationId('telegram', CUSTOMER_CHAT, 'customer')

const QUOTE = {
  kind: 'quote',
  family: 'business_cards',
  attributes: OFFSET_1000,
  size: null,
  addOns: [],
  factKey: null,
}

const ACCEPT = { kind: 'accept', family: null, attributes: {}, size: null, addOns: [], factKey: null }

/**
 * The composition route.ts builds, with the two model calls replaced and nothing else. The
 * sale port is built once, and the receipt path is handed its `orderFor` rather than a store
 * of its own: that is the whole point of the test.
 */
function vertical() {
  const written: Receipt[] = []
  const notices: string[] = []
  const replies: { chatId: string; text: string }[] = []
  const answers: unknown[] = [QUOTE, ACCEPT]

  const sale = inMemorySale({ alias: 'dante.imprenta.mp', now: () => NOW, id: sequence('id') })
  const store: ReceiptStore = { async record(receipt) { written.push(receipt) } }
  const send: Send = async (chatId, text) => void replies.push({ chatId, text })

  const deps: TurnDeps = {
    rows: () => catalogRows,
    config: baseConfig,
    facts: [],
    extract: async () => answers.shift() ?? { kind: 'other', family: null, attributes: {}, size: null, addOns: [], factKey: null },
    write: async (request) => passThrough(request.user),
    sale,
  }

  const webhook = telegramWebhook({
    secret: SECRET,
    turn: receiptTurn(
      { findOrder: sale.orderFor, store, notify: async (text) => void notices.push(text) },
      customerTurn(deps, send),
    ),
    onCallback: async () => {},
  })

  return { webhook, sale, written, notices, replies }
}

/** The writer copies the answer block it was handed, which is all the amount check allows. */
function passThrough(user: string): string {
  const blocks = user.split('\n\n')

  return blocks[blocks.length - 1]!.split('\n').slice(1, -1).join('\n')
}

function sequence(prefix: string): () => string {
  let n = 0

  return () => `${prefix}_${(n += 1)}`
}

function says(updateId: number, text: string): Request {
  return delivery(updateId, { text })
}

function sendsAPhoto(updateId: number, fileId: string): Request {
  return delivery(updateId, { photo: [{ file_id: fileId }] })
}

function delivery(updateId: number, message: Record<string, unknown>): Request {
  return new Request('https://dante.example/telegram/webhook', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: updateId,
      message: { chat: { id: Number(CUSTOMER_CHAT), type: 'supergroup' }, from: { id: 42 }, ...message },
    }),
  })
}

describe('the receipt attaches to the order the confirmation moves', () => {
  test('quote, accept, photo, confirm, and the order reaches deposit_confirmed', async () => {
    const { webhook, sale, written, notices } = vertical()

    await webhook(says(1, 'hola, cuánto 1000 tarjetas'))
    await webhook(says(2, 'dale, la quiero'))

    const ordered = sale.orderFor(conversation)
    expect(ordered?.state).toBe('deposit_pending')

    await webhook(sendsAPhoto(3, 'AgACtransfer'))

    // One store, one order. The receipt names the order the sale port is holding, and the
    // confirmation below moves that same one.
    expect(written).toHaveLength(1)
    expect(written[0]?.orderId).toBe(ordered!.id)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toContain(ordered!.id)

    const confirmed = sale.confirmDeposit(conversation, { kind: 'person', id: ADMIN }, adminAllowlist({ ids: ADMIN }))
    if (!confirmed.ok) throw new Error(`expected a confirmation, got ${confirmed.reason}`)

    expect(confirmed.order.id).toBe(written[0]!.orderId)
    expect(confirmed.order.state).toBe('deposit_confirmed')
    expect(confirmed.order.depositConfirmedBy).toBe(ADMIN)
  })

  test('a second photo after the confirmation writes nothing', async () => {
    const { webhook, sale, written, notices } = vertical()

    await webhook(says(1, 'hola, cuánto 1000 tarjetas'))
    await webhook(says(2, 'dale, la quiero'))
    await webhook(sendsAPhoto(3, 'AgACtransfer'))

    sale.confirmDeposit(conversation, { kind: 'person', id: ADMIN }, adminAllowlist({ ids: ADMIN }))

    await webhook(sendsAPhoto(4, 'AgACsecond'))

    // The state has to be read back from the sale port on every message. A copy taken when
    // the first receipt arrived would still read deposit_pending and record this one.
    expect(written).toHaveLength(1)
    expect(notices).toHaveLength(1)
    expect(sale.orderFor(conversation)?.state).toBe('deposit_confirmed')
  })
})

/**
 * The same walk through `telegramWebhookRoute` itself. The test above wires `findOrder` with
 * its own hand, so it proves the module and says nothing about what the composition root
 * passes it: a route that built a store of its own would keep that test green. Here nothing
 * is wired by the test, so a receipt path that cannot find the sale's order sends the owner
 * no notice and this fails.
 */
function routed() {
  const answers: unknown[] = [QUOTE, ACCEPT]
  const sends: { chatId: string; text: string }[] = []

  const fetchImpl: FetchLike = async (url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>

    if (new URL(url).host === 'api.telegram.org') {
      sends.push({ chatId: String(body.chat_id), text: String(body.text) })

      return Response.json({ ok: true })
    }

    const content =
      'response_format' in body
        ? JSON.stringify(answers.shift() ?? { kind: 'other', family: null, attributes: {}, size: null, addOns: [], factKey: null, reason: null })
        : passThrough(lastUserMessage(body))

    return Response.json({ choices: [{ message: { content } }] })
  }

  const route = telegramWebhookRoute(
    { onCallback: async () => {} },
    { catalog: liveCatalog(catalogRows), edits: inMemoryPriceEdits(), record: async () => {} },
    fetchImpl,
  )
  const { handler } = route as { handler: (c: { req: { raw: Request } }) => Promise<Response> }

  return { deliver: (request: Request) => handler({ req: { raw: request } }), sends }
}

function lastUserMessage(body: Record<string, unknown>): string {
  const messages = body.messages as { role: string; content: string }[]

  return messages[messages.length - 1]!.content
}

describe('through the composition root, with nothing wired by the test', () => {
  test('the owner is told a receipt arrived for the order the sale port is holding', async () => {
    const { deliver, sends } = routed()

    await deliver(says(11, 'hola, cuánto 1000 tarjetas'))
    await deliver(says(12, 'dale, la quiero'))
    await deliver(sendsAPhoto(13, 'AgACtransfer'))

    const toOwner = sends.filter((sent) => sent.chatId === OWNER_CHAT)
    const toCustomer = sends.filter((sent) => sent.chatId === CUSTOMER_CHAT)

    // One notice, and it found an order: a receipt path handed a store of its own instead of
    // sale.orderFor finds nothing and says nothing.
    expect(toOwner).toHaveLength(1)
    expect(toOwner[0]!.text).toContain('banco')
    expect(toOwner[0]!.text).not.toContain('AgACtransfer')

    // The quote and the deposit request. The photo never reached the turn, so it added none.
    expect(toCustomer).toHaveLength(2)
  })
})
