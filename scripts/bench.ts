/**
 * The route, with Telegram stubbed and nothing else.
 *
 * Shared by the two eval scripts, which is the point: an eval whose harness is its own copy
 * of the wiring proves its copy works. Real OpenRouter, real ElevenLabs, the real allowlist
 * and the real pricing engine. Only Telegram is a stub, because the eval must not message
 * anybody and because a fixture has to stand in for a file id.
 */
import { baseConfig, catalogRows } from '../src/catalog/business-cards'
import { liveCatalog, type LiveCatalog } from '../src/catalog/live-catalog'
import { requireEnv } from '../src/config/env'
import { totalOf } from '../src/domain/breakdown'
import { priceFor } from '../src/domain/price-for'
import type { QuoteIntent } from '../src/domain/types'
import { telegramWebhookRoute } from '../src/telegram/route'
import { inMemoryPriceEdits } from '../src/voice/price-edit-proposal'
import type { FetchLike } from '../src/voice/transcription'

export const OWNER = requireEnv('OWNER_CHAT_ID')
export const CLIENT = '900000001'

const SECRET = requireEnv('TELEGRAM_WEBHOOK_SECRET')
const TOKEN = requireEnv('TELEGRAM_BOT_TOKEN')

/** The one file id the stub serves the voice note for, and the one it serves the receipt for. */
export const VOICE_ID = 'voice-1'
export const PHOTO_ID = 'photo-1'

const FILES: Record<string, { path: string; file: string }> = {
  [VOICE_ID]: { path: 'voice/raise-cards.oga', file: 'fixtures/raise-cards.opus' },
  [PHOTO_ID]: { path: 'photos/receipt.jpg', file: 'fixtures/receipt.jpg' },
}

export type Sent = { chatId: string; text: string; button: string | null }

export type Bench = {
  sent: Sent[]
  catalog: LiveCatalog
  /** What `intent` costs as the catalog is now. The eval knows the number before it asks. */
  priced(intent: QuoteIntent): number
  deliver(update: Record<string, unknown>): Promise<number>
}

export function bench(): Bench {
  const sent: Sent[] = []

  const fetchImpl: FetchLike = async (url, init) => {
    const path = String(url)
    if (new URL(path).host !== 'api.telegram.org') return fetch(url, init)

    if (path.includes('/getFile')) {
      const id = new URL(path).searchParams.get('file_id') ?? ''
      const known = FILES[id]

      return known === undefined
        ? Response.json({ ok: false })
        : Response.json({ ok: true, result: { file_path: known.path } })
    }

    if (path.includes(`/file/bot${TOKEN}/`)) {
      const served = Object.values(FILES).find((one) => path.endsWith(one.path))

      return served === undefined
        ? new Response('no such file', { status: 404 })
        : new Response(await Bun.file(served.file).arrayBuffer())
    }

    if (path.endsWith('/sendMessage')) {
      const body = JSON.parse(String(init?.body)) as {
        chat_id: string
        text: string
        reply_markup?: { inline_keyboard: { callback_data: string }[][] }
      }
      sent.push({
        chatId: String(body.chat_id),
        text: body.text,
        button: body.reply_markup?.inline_keyboard[0]?.[0]?.callback_data ?? null,
      })

      return Response.json({ ok: true })
    }

    return Response.json({ ok: true })
  }

  const catalog = liveCatalog(catalogRows)
  const route = telegramWebhookRoute({}, { catalog, edits: inMemoryPriceEdits(), record: async () => {} }, fetchImpl)
  const handler = (route as { handler: (c: { req: { raw: Request } }) => Promise<Response> }).handler

  return {
    sent,
    catalog,
    priced(intent) {
      const answer = priceFor(intent, catalog.rows(), baseConfig)
      if (answer.kind !== 'price') throw new Error(`the eval's own question does not price: ${answer.kind}`)

      return totalOf(answer.breakdown)
    },
    async deliver(update) {
      const response = await handler({
        req: {
          raw: new Request('https://dante.example/telegram/webhook', {
            method: 'POST',
            headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET, 'Content-Type': 'application/json' },
            body: JSON.stringify(update),
          }),
        },
      })

      return response.status
    },
  }
}

let updateId = 1000

function from(senderId: string): Record<string, unknown> {
  return { chat: { id: Number(senderId), type: 'private' }, from: { id: Number(senderId) } }
}

export function text(senderId: string, body: string): Record<string, unknown> {
  return { update_id: (updateId += 1), message: { ...from(senderId), text: body } }
}

export function voice(senderId: string): Record<string, unknown> {
  return { update_id: (updateId += 1), message: { ...from(senderId), voice: { file_id: VOICE_ID } } }
}

/** Telegram sends a photo as its sizes, smallest first, and the route reads the largest. */
export function photo(senderId: string): Record<string, unknown> {
  return {
    update_id: (updateId += 1),
    message: { ...from(senderId), photo: [{ file_id: 'thumb-1' }, { file_id: PHOTO_ID }] },
  }
}

export function press(senderId: string, data: string): Record<string, unknown> {
  return {
    update_id: (updateId += 1),
    callback_query: { id: 'callback-1', from: { id: Number(senderId) }, message: { ...from(senderId) }, data },
  }
}

export function to(sent: Sent[], chatId: string): Sent[] {
  return sent.filter((one) => one.chatId === chatId)
}
