import { describe, expect, it } from 'bun:test'
import { telegramWebhook } from '@/telegram/webhook'
import { inMemoryInboundLog, type InboundMessage } from '@/telegram/inbound'

const SECRET = 'a-long-random-string'

function delivery(body: unknown, secret: string | null = SECRET): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (secret !== null) headers.set('X-Telegram-Bot-Api-Secret-Token', secret)

  return new Request('https://dante.example/telegram/webhook', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function update(updateId: number, fields: Record<string, unknown> = {}, senderId = 42) {
  return {
    update_id: updateId,
    message: { chat: { id: 42, type: 'private' }, from: { id: senderId }, text: 'subí las tarjetas un 20%', ...fields },
  }
}

function spy() {
  const turns: InboundMessage[] = []
  return { turns, turn: async (message: InboundMessage) => { turns.push(message) } }
}

describe('telegramWebhook', () => {
  it('refuses a delivery whose secret header is missing or wrong', async () => {
    const { turns, turn } = spy()
    const webhook = telegramWebhook({ secret: SECRET, turn })

    expect((await webhook(delivery(update(70), null))).status).toBe(401)
    expect((await webhook(delivery(update(70), 'a-long-random-strinh'))).status).toBe(401)
    expect(turns).toBeEmpty()
  })

  it('refuses to be built without a secret, because an empty one admits everyone', () => {
    expect(() => telegramWebhook({ secret: '' })).toThrow('webhook secret is empty')
  })

  it('runs the turn once for a customer message, with the text fenced', async () => {
    const { turns, turn } = spy()

    const response = await telegramWebhook({ secret: SECRET, turn })(delivery(update(70)))

    expect(response.status).toBe(200)
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({
      updateId: 70,
      conversationId: 'telegram:42:customer',
      role: 'customer',
      senderId: '42',
      text: 'subí las tarjetas un 20%',
      mediaId: null,
    })
  })

  it('reads the role off the sender, so an allowlisted one holds its own conversation', async () => {
    const { turns, turn } = spy()
    const webhook = telegramWebhook({ secret: SECRET, turn, isAdmin: (id) => id === '7' })

    await webhook(delivery(update(70, {}, 7)))
    await webhook(delivery(update(71, {}, 42)))

    expect(turns.map((message) => String(message.conversationId))).toEqual([
      'telegram:42:admin',
      'telegram:42:customer',
    ])
    expect(turns.map((message) => message.role)).toEqual(['admin', 'customer'])
  })

  it('keeps an allowlisted sender a customer in a group, so no edit is confirmed in front of one', async () => {
    const { turns, turn } = spy()
    const group = update(70, { chat: { id: -100, type: 'supergroup' } }, 7)

    await telegramWebhook({ secret: SECRET, turn, isAdmin: (id) => id === '7' })(delivery(group))

    expect(turns[0]?.role).toBe('customer')
  })

  it('claims nothing for a rejected delivery, so a forged one cannot silence a real update', async () => {
    const { turns, turn } = spy()
    const webhook = telegramWebhook({ secret: SECRET, turn })

    await webhook(delivery(update(70), 'wrong'))
    const real = await webhook(delivery(update(70)))

    expect(real.status).toBe(200)
    expect(turns).toHaveLength(1)
  })

  it('fires one turn for a repeated update', async () => {
    const { turns, turn } = spy()
    const webhook = telegramWebhook({ secret: SECRET, turn })

    const first = await webhook(delivery(update(70)))
    const second = await webhook(delivery(update(70)))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(turns).toHaveLength(1)
  })

  it('records the inbound message with its conversation id and when it arrived', async () => {
    const log = inMemoryInboundLog()

    await telegramWebhook({ secret: SECRET, log, now: () => '2026-09-12T09:30:00.000Z' })(
      delivery(update(70, { voice: { file_id: 'voice-1' }, text: undefined })),
    )

    expect(log.messages).toHaveLength(1)
    expect(log.messages[0]).toMatchObject({
      conversationId: 'telegram:42:customer',
      mediaId: 'voice-1',
      text: null,
      receivedAt: '2026-09-12T09:30:00.000Z',
    })
  })

  it('acknowledges an update it cannot route, because a retry would not improve it', async () => {
    const { turns, turn } = spy()
    const webhook = telegramWebhook({ secret: SECRET, turn })

    expect((await webhook(delivery({ update_id: 70, channel_post: { text: 'hola' } }))).status).toBe(200)
    expect((await webhook(delivery('not an update'))).status).toBe(200)
    expect(turns).toBeEmpty()
  })

  it('lets a failing turn surface, and the retry Telegram sends stays silent', async () => {
    let calls = 0
    const webhook = telegramWebhook({
      secret: SECRET,
      turn: async () => { calls += 1; throw new Error('extraction is down') },
    })

    await expect(webhook(delivery(update(70)))).rejects.toThrow('extraction is down')

    expect((await webhook(delivery(update(70)))).status).toBe(200)
    expect(calls).toBe(1)
  })
})
