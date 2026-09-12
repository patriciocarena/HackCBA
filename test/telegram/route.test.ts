import { afterEach, describe, expect, it } from 'bun:test'
import { telegramWebhookRoute } from '@/telegram/route'
import type { InboundMessage } from '@/telegram/inbound'

process.env.TELEGRAM_WEBHOOK_SECRET = 'a-long-random-string'

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

describe('telegramWebhookRoute', () => {
  it('mounts a POST route on the server that already answers the health check', () => {
    const route = telegramWebhookRoute()

    expect(route).toMatchObject({ path: '/telegram/webhook', method: 'POST', requiresAuth: false })
  })

  it('hands the raw request to the webhook and takes the secret from the environment', async () => {
    const turns: InboundMessage[] = []
    const route = telegramWebhookRoute({ turn: async (message) => { turns.push(message) } })

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
    const route = telegramWebhookRoute({ turn: async (message) => { turns.push(message) } })

    await handle(route, privateDelivery(7))

    expect(turns[0]?.role).toBe('customer')
  })

  it('makes an allowlisted sender the admin in his own private chat', async () => {
    process.env.TELEGRAM_ADMIN_IDS = '7'
    const turns: InboundMessage[] = []
    const route = telegramWebhookRoute({ turn: async (message) => { turns.push(message) } })

    await handle(route, privateDelivery(7))
    await handle(route, privateDelivery(42))

    expect(turns.map((message) => message.role)).toEqual(['admin', 'customer'])
  })
})
