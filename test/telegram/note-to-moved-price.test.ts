import { describe, expect, test } from 'bun:test'
import { businessCards, catalogRows } from '@/catalog/business-cards'
import { liveCatalog } from '@/catalog/live-catalog'
import type { PriceVersion } from '@/catalog/apply-edit'
import { telegramWebhookRoute } from '@/telegram/route'
import { inMemoryPriceEdits } from '@/voice/price-edit-proposal'
import type { FetchLike } from '@/voice/transcription'

const SECRET = 'a-long-random-string'
const OWNER = 7
const TOKEN = 'a-bot-token'
const SLUG = 'bc_special_100_front'

process.env.TELEGRAM_WEBHOOK_SECRET = SECRET
process.env.TELEGRAM_BOT_TOKEN = TOKEN
process.env.OPENROUTER_API_KEY = 'a-key'
process.env.OPENROUTER_MODEL = 'a-model'
process.env.ELEVENLABS_API_KEY = 'a-transcription-key'
process.env.ELEVENLABS_MODEL_ID = 'scribe_v2'
process.env.TRANSCRIPTION_LANGUAGE = 'es'
process.env.DEPOSIT_ALIAS = 'dante.imprenta.mp'
process.env.OWNER_CHAT_ID = '7'

const DICTATED = { kind: 'edit', target: businessCards.label, direction: 'raise', changeKind: 'percent', value: 20, reason: null, detail: '' }

function handle(route: ReturnType<typeof telegramWebhookRoute>, request: Request): Promise<Response> {
  const { handler } = route as { handler: (c: { req: { raw: Request } }) => Promise<Response> }

  return handler({ req: { raw: request } })
}

function post(body: unknown): Request {
  return new Request('https://dante.example/telegram/webhook', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET },
    body: JSON.stringify(body),
  })
}

/** The whole outside world: Telegram's file API, ElevenLabs, OpenRouter and sendMessage. */
function theWorld() {
  const sent: Record<string, unknown>[] = []
  const answered: Record<string, unknown>[] = []

  const fetchImpl: FetchLike = async (url, init) => {
    if (url.includes('/getFile')) return Response.json({ ok: true, result: { file_path: 'voice/note.oga' } })
    if (url.includes(`/file/bot${TOKEN}/`)) return new Response(new Uint8Array([1, 2, 3]))
    if (url.includes('elevenlabs.io')) return Response.json({ text: 'subí las tarjetas un veinte por ciento' })

    if (url.includes('openrouter.ai')) {
      return Response.json({ choices: [{ message: { content: JSON.stringify(DICTATED) } }] })
    }

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    if (url.includes('/answerCallbackQuery')) answered.push(body)
    else sent.push(body)

    return Response.json({ ok: true })
  }

  return { fetchImpl, sent, answered }
}

function buttonIn(message: Record<string, unknown>): { yes: string; no: string } {
  const markup = message.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] }
  const row = markup.inline_keyboard[0] as { text: string; callback_data: string }[]

  return { yes: row[0]?.callback_data as string, no: row[1]?.callback_data as string }
}

describe('a voice note becomes a moved price, through the real composition root', () => {
  test('note, proposal, press, and the catalog the customer is quoted from has moved', async () => {
    process.env.TELEGRAM_ADMIN_IDS = String(OWNER)

    try {
      const world = theWorld()
      const catalog = liveCatalog(catalogRows)
      const edits = inMemoryPriceEdits()
      const versions: PriceVersion[] = []
      const listed = catalog.rows().find((row) => row.slug === SLUG)?.price as number

      const route = telegramWebhookRoute(
        {},
        { catalog, edits, record: async (version) => void versions.push(version), write: async () => 'una respuesta' },
        world.fetchImpl,
      )

      await handle(route, post({
        update_id: 500,
        message: { chat: { id: OWNER, type: 'private' }, from: { id: OWNER }, voice: { file_id: 'voice-1' } },
      }))

      // One proposal exists, and the owner was shown both prices of a line before any button.
      expect(edits.proposals).toHaveLength(1)
      const minted = edits.proposals[0]!

      expect(minted.state).toBe('proposed')
      expect(sentText(world.sent)).toContain('→')

      // The press carries the id this end minted, read back through the parser.
      const { yes } = buttonIn(world.sent[0]!)

      expect(yes).toContain(minted.id)

      await handle(route, post({
        update_id: 501,
        callback_query: { id: 'cbq_1', from: { id: OWNER }, message: { chat: { id: OWNER, type: 'private' } }, data: yes },
      }))

      const after = catalog.rows().find((row) => row.slug === SLUG)?.price as number

      expect(after).toBeGreaterThan(listed)
      expect(after).toBe(minted.lines.find((entry) => entry.slug === SLUG)?.newPrice as number)
      expect(versions).toHaveLength(1)
      expect(versions[0]).toMatchObject({ proposalId: minted.id, appliedBy: String(OWNER) })
      expect((await edits.load(minted.id))?.state).toBe('applied')

      // The press is answered, so Telegram stops spinning, and the owner reads what moved.
      expect(world.answered).toHaveLength(1)
      expect(world.answered[0]).toMatchObject({ callback_query_id: 'cbq_1' })
      expect(String(world.sent[1]?.text)).toContain('ya está en vigencia')
      expect(String(world.sent[1]?.text)).toContain('→')
    } finally {
      delete process.env.TELEGRAM_ADMIN_IDS
    }
  })
})

function sentText(sent: Record<string, unknown>[]): string {
  return String(sent[0]?.text ?? '')
}
