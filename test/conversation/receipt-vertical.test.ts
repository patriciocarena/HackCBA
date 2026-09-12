import { describe, expect, test } from 'bun:test'
import { LOADED_FAMILIES } from '../../src/catalog/families'
import { withVat } from '../support/fixtures'
import { pesos } from '@/domain/quote-text'
import { catalogRows, baseConfig } from '@/catalog/business-cards'
import { customerTurn } from '@/conversation/customer-turn'
import { receiptTurn } from '@/conversation/receipt-path'
import { inMemorySale } from '@/conversation/sale'
import type { TurnDeps } from '@/conversation/turn'
import type { Receipt, ReceiptStore } from '@/domain/deposit'
import { conversationId } from '@/domain/types'
import { AGENT, type ReceiptReading } from '@/domain/deposit'
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

/** What the model reads off a clean receipt for this order: $45.000 to the alias it was told. */
const MATCHES: ReceiptReading = {
  looksLikeReceipt: true,
  amount: withVat(45_000),
  destination: 'dante.imprenta.mp',
  confidence: 0.95,
}

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
function vertical(reading: ReceiptReading | null = MATCHES) {
  const written: Receipt[] = []
  const notices: string[] = []
  const replies: { chatId: string; text: string }[] = []
  const answers: unknown[] = [QUOTE, ACCEPT, QUOTE]

  const sale = inMemorySale({ alias: 'dante.imprenta.mp', now: () => NOW, id: sequence('id') })
  const store: ReceiptStore = { async record(receipt) { written.push(receipt) } }
  const send: Send = async (chatId, text) => void replies.push({ chatId, text })

  const deps: TurnDeps = {
    rows: () => catalogRows,
    families: LOADED_FAMILIES,
    facts: [],
    extract: async () => answers.shift() ?? { kind: 'other', family: null, attributes: {}, size: null, addOns: [], factKey: null },
    write: async (request) => passThrough(request.user),
    sale,
  }

  const webhook = telegramWebhook({
    secret: SECRET,
    turn: receiptTurn(
      {
        findOrder: sale.orderFor,
        store,
        notify: async (text) => void notices.push(text),
        fetchImage: async () => new Uint8Array([1, 2, 3]) as Uint8Array<ArrayBuffer>,
        readImage: async () => reading,
        confirm: sale.confirmFromReceipt,
      },
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

/**
 * What broke the bot on a client's phone, end to end. The receipt path runs before the turn,
 * and while an order waited for its deposit it claimed every message the conversation carried:
 * "quiero mil tarjetas mas, serian 54450?" was filed as a comprobante and answered "¡Gracias
 * por mandar el comprobante!", so the price question reached nothing that could price it.
 */
describe('a question asked while the deposit is pending is still answered', () => {
  test('the extra thousand is quoted, not filed as a receipt', async () => {
    const { webhook, sale, written, notices, replies } = vertical()

    await webhook(says(1, 'hola, cuánto 1000 tarjetas'))
    await webhook(says(2, 'dale, la quiero'))
    expect(sale.orderFor(conversation)?.state).toBe('deposit_pending')

    const before = replies.length
    await webhook(says(3, 'porfavor cotizame 1.000 tarjetas mas'))

    const answered = replies.slice(before)

    expect(answered).toHaveLength(1)
    expect(answered[0]?.text).not.toMatch(/comprobante/i)
    expect(answered[0]?.text).toContain(pesos(withVat(45_000)))
    // Nothing was recorded against the order, and the owner was not told a receipt arrived.
    expect(written).toEqual([])
    expect(notices).toEqual([])
  })

  test('and saying they paid is still the transfer', async () => {
    const { webhook, sale, written } = vertical()

    await webhook(says(1, 'hola, cuánto 1000 tarjetas'))
    await webhook(says(2, 'dale, la quiero'))
    await webhook(says(3, 'ya te transferí, te paso el comprobante'))

    expect(written).toHaveLength(1)
    expect(written[0]?.orderId).toBe(sale.orderFor(conversation)!.id)
  })
})

describe('the receipt attaches to the order the confirmation moves', () => {
  test('quote, accept, photo, and the order confirms itself with nobody pressing anything', async () => {
    const { webhook, sale, written, notices } = vertical()

    await webhook(says(1, 'hola, cuánto 1000 tarjetas'))
    await webhook(says(2, 'dale, la quiero'))

    const ordered = sale.orderFor(conversation)
    expect(ordered?.state).toBe('deposit_pending')

    await webhook(sendsAPhoto(3, 'AgACtransfer'))

    // One store, one order. The receipt names the order the sale port is holding, and that
    // same one is the one that moved.
    expect(written).toHaveLength(1)
    expect(written[0]?.orderId).toBe(ordered!.id)

    const confirmed = sale.orderFor(conversation)
    expect(confirmed?.id).toBe(written[0]!.orderId)
    expect(confirmed?.state).toBe('deposit_confirmed')
    expect(confirmed?.depositConfirmedBy).toBe(AGENT)

    expect(notices).toHaveLength(1)
    expect(notices[0]).toContain(ordered!.id)
  })

  test('a reading that does not match waits for the admin, who still has the power', async () => {
    const { webhook, sale } = vertical({ ...MATCHES, amount: 1 })

    await webhook(says(1, 'hola, cuánto 1000 tarjetas'))
    await webhook(says(2, 'dale, la quiero'))
    await webhook(sendsAPhoto(3, 'AgACtransfer'))

    expect(sale.orderFor(conversation)?.state).toBe('deposit_pending')

    // confirmDeposit is untouched: the admin path is exactly what it was.
    const confirmed = sale.confirmDeposit(conversation, { kind: 'person', id: ADMIN }, adminAllowlist({ ids: ADMIN }))
    if (!confirmed.ok) throw new Error(`expected a confirmation, got ${confirmed.reason}`)

    expect(confirmed.order.state).toBe('deposit_confirmed')
    expect(confirmed.order.depositConfirmedBy).toBe(ADMIN)
  })

  test('a second photo after the confirmation writes nothing', async () => {
    const { webhook, sale, written, notices } = vertical()

    await webhook(says(1, 'hola, cuánto 1000 tarjetas'))
    await webhook(says(2, 'dale, la quiero'))
    await webhook(sendsAPhoto(3, 'AgACtransfer'))

    expect(sale.orderFor(conversation)?.state).toBe('deposit_confirmed')

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
  const answers: unknown[] = [QUOTE, ACCEPT, QUOTE]
  const sends: { chatId: string; text: string }[] = []

  const fetchImpl: FetchLike = async (url, init) => {
    // The two Telegram GETs telegramAudio makes for a file id, which is how the photo arrives.
    if (url.includes('/getFile?')) return Response.json({ ok: true, result: { file_path: 'photos/1.jpg' } })
    if (url.includes('/file/bot')) return new Response(new Uint8Array([1, 2, 3]))

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>

    if (new URL(url).host === 'api.telegram.org') {
      // Only what carries words. A chat action is a POST to the same host and it says nothing,
      // so counting it here would make every assertion about what a customer read wrong.
      if (body.text !== undefined) sends.push({ chatId: String(body.chat_id), text: String(body.text) })

      return Response.json({ ok: true })
    }

    // An image call carries its content as parts rather than a string, which is the only
    // thing that tells the two model calls apart from out here.
    const content = looksAtAnImage(body)
      ? JSON.stringify(MATCHES)
      : 'response_format' in body
        ? JSON.stringify(answers.shift() ?? { kind: 'other', family: null, attributes: {}, size: null, addOns: [], factKey: null, reason: null })
        : passThrough(lastUserMessage(body))

    return Response.json({ choices: [{ message: { content } }] })
  }

  const route = telegramWebhookRoute(
    { onCallback: async () => {} },
    // The writer is a Mastra agent in production and carries its own HTTP client, so fetchImpl
    // cannot reach it. `passThrough` is what the fetch stub did for the writing call, moved to
    // the seam the writer now arrives through.
    {
      catalog: liveCatalog(catalogRows),
      edits: inMemoryPriceEdits(),
      record: async () => {},
      write: async ({ user }) => passThrough(user),
    },
    fetchImpl,
  )
  const { handler } = route as { handler: (c: { req: { raw: Request } }) => Promise<Response> }

  return { deliver: (request: Request) => handler({ req: { raw: request } }), sends }
}

function looksAtAnImage(body: Record<string, unknown>): boolean {
  const messages = body.messages as { content: unknown }[]

  return Array.isArray(messages[messages.length - 1]?.content)
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

    // The notice and the job. Which lands first is not asserted: the job is sent from a
    // confirm the domain makes synchronously and the notice is awaited after it, so the order
    // is the microtask queue's and not a promise this makes the owner.
    expect(toOwner).toHaveLength(2)

    const notice = toOwner.find((sent) => sent.text.includes('banco'))!
    const job = toOwner.find((sent) => sent.text.startsWith('ORDEN'))!

    expect(notice.text).not.toContain('AgACtransfer')

    // It confirmed it, through the route, with nobody pressing anything. The sale port is
    // private in there, so this sentence is the only place the outcome is visible.
    expect(notice.text).toContain('lo confirmé solo')

    // And confirming is what prints, so the job arrives with nobody having asked for it.
    expect(job.text).toContain('seña confirmada')

    // The quote, the deposit request, and the thanks. The photo never reaches the turn, so
    // the third is the receipt path's own line and not something a model wrote.
    expect(toCustomer).toHaveLength(3)

    const thanks = toCustomer[2]!

    expect(thanks.text).toMatch(/gracias/i)
    expect(thanks.text).toMatch(/confirm/i)
    // The owner's sentence is the owner's. A customer who reads "lo confirmé solo" is reading
    // a line written for somebody deciding whether to print.
    expect(thanks.text).not.toContain('lo confirmé solo')
  })
})
