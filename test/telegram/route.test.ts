import { describe, expect, it } from 'bun:test'
import { telegramWebhookRoute } from '@/telegram/route'
import type { InboundMessage } from '@/telegram/inbound'

process.env.TELEGRAM_WEBHOOK_SECRET = 'a-long-random-string'

function handle(route: ReturnType<typeof telegramWebhookRoute>, request: Request): Promise<Response> {
  const { handler } = route as { handler: (c: { req: { raw: Request } }) => Promise<Response> }

  return handler({ req: { raw: request } })
}

function delivery(secret: string): Request {
  return new Request('https://dante.example/telegram/webhook', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify({
      update_id: 70,
      message: { chat: { id: -100, type: 'supergroup' }, from: { id: 42 }, text: 'cuánto 1000 tarjetas' },
    }),
  })
}

function privateDelivery(senderId: number): Request {
  return new Request('https://dante.example/telegram/webhook', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': 'a-long-random-string' },
    body: JSON.stringify({
      update_id: senderId,
      message: { chat: { id: senderId, type: 'private' }, from: { id: senderId }, text: 'subí las tarjetas un 20%' },
    }),
  })
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
    const accepted = await handle(route, delivery('a-long-random-string'))

    expect(denied.status).toBe(401)
    expect(accepted.status).toBe(200)
    expect(turns.map((message) => String(message.conversationId))).toEqual(['telegram:-100:customer'])
  })
})

describe('telegramWebhookRoute, on who counts as the owner', () => {
  it('reads the allowlist from the deployment, so an unconfigured one admits nobody', async () => {
    delete process.env.TELEGRAM_ADMIN_IDS
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
    delete process.env.TELEGRAM_ADMIN_IDS
  })
})
