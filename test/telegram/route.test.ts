import { afterEach, describe, expect, it } from 'bun:test'
import type { InboundMessage } from '@/telegram/inbound'
import { dispatch, telegramWebhookRoute } from '@/telegram/route'
import { liveCatalog } from '@/catalog/live-catalog'
import { catalogRows } from '@/catalog/business-cards'
import type { OnCallback } from '@/telegram/callback'
import { inMemoryPriceEdits } from '@/voice/price-edit-proposal'

const noPress: OnCallback = async () => {}
const aCatalog = () => liveCatalog(catalogRows)
const aWiring = () => ({ catalog: aCatalog(), edits: inMemoryPriceEdits(), record: async () => {} })
import type { FetchLike } from '@/voice/transcription'

process.env.TELEGRAM_WEBHOOK_SECRET = 'a-long-random-string'
process.env.TELEGRAM_BOT_TOKEN = 'a-bot-token'
process.env.OPENROUTER_API_KEY = 'a-key'
process.env.OPENROUTER_MODEL = 'a-model'
process.env.ELEVENLABS_API_KEY = 'a-transcription-key'
process.env.ELEVENLABS_MODEL_ID = 'scribe_v2'
process.env.TRANSCRIPTION_LANGUAGE = 'es'
process.env.DEPOSIT_ALIAS = 'dante.imprenta.mp'
process.env.OWNER_CHAT_ID = '77'

function handle(route: ReturnType<typeof telegramWebhookRoute>, request: Request): Promise<Response> {
  const { handler } = route as { handler: (c: { req: { raw: Request } }) => Promise<Response> }

  return handler({ req: { raw: request } })
}

const SECRET = 'a-long-random-string'

let updateId = 70

function delivery(secret: string, chat: Record<string, unknown> = { id: -100, type: 'supergroup' }): Request {
  return new Request('https://dante.example/telegram/webhook', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify({
      update_id: (updateId += 1),
      message: { chat, from: { id: chat.id }, text: 'cuánto 1000 tarjetas' },
    }),
  })
}

function privateDelivery(senderId: number): Request {
  return delivery(SECRET, { id: senderId, type: 'private' })
}

/** The seed prices 1000 offset cards at this, and the customer may read no other number. */
const QUOTED = 'Te cotizo $45.000 final con IVA incluido.'

const EXTRACTED = {
  kind: 'quote',
  family: 'business_cards',
  attributes: { quantity: 1000, paper: 'illustration_350', sides: 'front_color_back_grayscale', finish: 'none' },
  size: null,
  addOns: [],
  factKey: null,
  reason: null,
}

function host(url: string): string {
  return new URL(url).host
}

/**
 * A bot that answers the way the real services do, so the route has to reach all three hops.
 * An OpenRouter answer that only parses is not enough: the writer's reply has to survive the
 * amount check, or the send never happens and the last leg goes untested.
 */
function wired(over: { telegram?: () => Response } = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = []

  const fetchImpl: FetchLike = async (url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    calls.push({ url, body })

    if (host(url) === 'api.telegram.org') return over.telegram?.() ?? Response.json({ ok: true })

    const content = 'response_format' in body ? JSON.stringify(EXTRACTED) : QUOTED

    return Response.json({ choices: [{ message: { content } }] })
  }

  return { route: telegramWebhookRoute({ onCallback: noPress }, aWiring(), fetchImpl), calls }
}

describe('telegramWebhookRoute', () => {
  it('mounts a POST route on the server that already answers the health check', () => {
    const route = telegramWebhookRoute({ onCallback: noPress }, aWiring())

    expect(route).toMatchObject({ path: '/telegram/webhook', method: 'POST', requiresAuth: false })
  })

  it('hands the raw request to the webhook and takes the secret from the environment', async () => {
    const turns: InboundMessage[] = []
    const route = telegramWebhookRoute({ onCallback: noPress, turn: async (message) => { turns.push(message) } }, aWiring())

    const denied = await handle(route, delivery('wrong'))
    const accepted = await handle(route, delivery(SECRET))

    expect(denied.status).toBe(401)
    expect(accepted.status).toBe(200)
    expect(turns.map((message) => String(message.conversationId))).toEqual(['telegram:-100:customer'])
  })
})

describe('telegramWebhookRoute, on who counts as the owner', () => {
  afterEach(() => { delete process.env.TELEGRAM_ADMIN_IDS })

  it('reads the allowlist from the deployment, so an unconfigured one admits nobody', async () => {
    const turns: InboundMessage[] = []
    const route = telegramWebhookRoute({ onCallback: noPress, turn: async (message) => { turns.push(message) } }, aWiring())

    await handle(route, privateDelivery(7))

    expect(turns[0]?.role).toBe('customer')
  })

  it('makes an allowlisted sender the admin in his own private chat', async () => {
    process.env.TELEGRAM_ADMIN_IDS = '7'
    const turns: InboundMessage[] = []
    const route = telegramWebhookRoute({ onCallback: noPress, turn: async (message) => { turns.push(message) } }, aWiring())

    await handle(route, privateDelivery(7))
    await handle(route, privateDelivery(42))

    expect(turns.map((message) => message.role)).toEqual(['admin', 'customer'])
  })
})

describe('the default turn', () => {
  it('carries a customer message all the way to Telegram, not merely into a model', async () => {
    const { route, calls } = wired()

    const accepted = await handle(route, delivery(SECRET))

    expect(accepted.status).toBe(200)
    expect(calls.map((call) => host(call.url))).toEqual(['openrouter.ai', 'openrouter.ai', 'api.telegram.org'])
    expect(calls[2]!.url).toBe('https://api.telegram.org/bota-bot-token/sendMessage')
    expect(calls[2]!.body).toEqual({ chat_id: '-100', text: QUOTED })
  })

  it('fails loudly when Telegram refuses, because the last leg is the whole point', async () => {
    const { route } = wired({ telegram: () => new Response('chat not found', { status: 400 }) })

    expect(handle(route, delivery(SECRET))).rejects.toThrow('telegram sendMessage 400')
  })
})

describe('every key is read at boot', () => {
  for (const key of ['OPENROUTER_MODEL', 'OPENROUTER_API_KEY', 'TELEGRAM_BOT_TOKEN', 'DEPOSIT_ALIAS', 'OWNER_CHAT_ID']) {
    it(`throws when ${key} is missing, at construction and not at the first customer`, () => {
      const held = process.env[key]
      delete process.env[key]

      try {
        expect(() => telegramWebhookRoute({ onCallback: noPress }, aWiring())).toThrow(`${key} is not set`)
      } finally {
        process.env[key] = held
      }
    })
  }
})

describe('telegramWebhookRoute, on who gets which turn', () => {
  afterEach(() => { delete process.env.TELEGRAM_ADMIN_IDS })

  function roles() {
    const seen: { role: string; by: string }[] = []
    const route = telegramWebhookRoute(
      { turn: async (message) => void seen.push({ role: message.role, by: 'dispatched' }) },
      aWiring(),
    )

    return { seen, route }
  }

  it('sends an unallowlisted private sender down the customer path, so nobody is an owner by default', async () => {
    const { seen, route } = roles()

    await handle(route, privateDelivery(7))

    expect(seen).toMatchObject([{ role: 'customer' }])
  })

  it('makes the allowlisted sender an owner, and only in his own private chat', async () => {
    process.env.TELEGRAM_ADMIN_IDS = '7'
    const { seen, route } = roles()

    await handle(route, privateDelivery(7))
    await handle(route, delivery(SECRET, { id: -100, type: 'supergroup' }))

    expect(seen.map((entry) => entry.role)).toEqual(['admin', 'customer'])
  })
})

describe('dispatch', () => {
  const message = (role: 'admin' | 'customer') =>
    ({ role, chatId: '7' }) as unknown as Parameters<ReturnType<typeof dispatch>>[0]

  it('runs the owner turn for an owner and the customer turn for everyone else', async () => {
    const ran: string[] = []
    const turn = dispatch(
      async () => void ran.push('customer'),
      async () => void ran.push('owner'),
    )

    await turn(message('admin'))
    await turn(message('customer'))

    expect(ran).toEqual(['owner', 'customer'])
  })
})
