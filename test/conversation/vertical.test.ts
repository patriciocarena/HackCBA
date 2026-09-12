import { describe, expect, it } from 'bun:test'
import { baseConfig, catalogRows } from '@/catalog/business-cards'
import { customerTurn } from '@/conversation/customer-turn'
import type { TurnDeps } from '@/conversation/turn'
import { totalOf } from '@/domain/breakdown'
import { priceFor } from '@/domain/price-for'
import { pesos } from '@/domain/quote-text'
import type { Send } from '@/telegram/send'
import { telegramWebhook } from '@/telegram/webhook'
import { OFFSET_1000 } from '@test/support/fixtures'

const SECRET = 'a-long-random-string'

const QUOTE = {
  kind: 'quote',
  family: 'business_cards',
  attributes: OFFSET_1000,
  size: null,
  addOns: [],
  factKey: null,
}

/** The number the engine computed, which is the only number the customer may read. */
function quotedTotal(): string {
  const resolution = priceFor(
    { kind: 'quote', family: 'business_cards', attributes: OFFSET_1000, size: null, addOns: [] },
    catalogRows,
    baseConfig,
  )
  if (resolution.kind !== 'price') throw new Error(`the seed no longer prices 1000 offset cards: ${resolution.kind}`)

  return pesos(totalOf(resolution.breakdown))
}

/** The one reply the engine's own number permits. */
function quotedReply(): string {
  return `Te cotizo ${quotedTotal()} final con IVA incluido.`
}

/**
 * The whole vertical behind one webhook, recording both ends: what the writer was asked and
 * what the customer was sent. A test overrides only the phase it is about.
 */
function vertical(overrides: Partial<TurnDeps> = {}, send?: Send) {
  const replies: { chatId: string; text: string }[] = []
  const requests: { system: string; user: string }[] = []

  const deps: TurnDeps = {
    rows: catalogRows,
    config: baseConfig,
    facts: [],
    extract: async () => QUOTE,
    write: async (request) => {
      requests.push(request)

      return quotedReply()
    },
    ...overrides,
  }

  const record: Send = async (chatId, text) => {
    replies.push({ chatId, text })
  }

  return { webhook: telegramWebhook({ secret: SECRET, turn: customerTurn(deps, send ?? record) }), replies, requests }
}

function delivery(updateId: number, text: string): Request {
  return new Request('https://dante.example/telegram/webhook', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: updateId,
      message: { chat: { id: -100, type: 'supergroup' }, from: { id: 42 }, text },
    }),
  })
}

describe('a customer message crosses the whole vertical', () => {
  it('comes back with the exact pesos the engine computed, VAT included', async () => {
    const { webhook, replies } = vertical()

    const response = await webhook(delivery(70, 'hola, cuánto 1000 tarjetas'))

    expect(response.status).toBe(200)
    expect(replies).toEqual([{ chatId: '-100', text: quotedReply() }])
    expect(quotedTotal()).not.toBe(pesos(0))
  })

  it('says nothing when the writer states an amount the engine did not compute', async () => {
    const { webhook, replies } = vertical({ write: async () => 'Te cotizo $1 final con IVA incluido.' })

    const response = await webhook(delivery(70, 'hola, cuánto 1000 tarjetas'))

    expect(response.status).toBe(200)
    expect(replies).toBeEmpty()
  })

  it('carries one message of state into the next, so the introduction happens once', async () => {
    const { webhook, requests } = vertical()

    await webhook(delivery(70, 'hola, cuánto 1000 tarjetas'))
    await webhook(delivery(71, 'y 500?'))

    const systems = requests.map((request) => request.system)

    expect(systems).toHaveLength(2)
    expect(systems[0]).not.toBe(systems[1])
    expect(systems[0]!.startsWith(systems[1]!)).toBe(true)
  })
})

describe('one message, one delimiter', () => {
  it('hands the writer the block the webhook fenced, not a fence around a fence', async () => {
    const { webhook, requests } = vertical()

    await webhook(delivery(70, 'hola, cuánto 1000 tarjetas'))

    expect(requests[0]!.user.match(/<message:[0-9a-f]{32}>/g)).toHaveLength(1)
  })
})

describe('a reply Telegram refused', () => {
  it('leaves the conversation where it was, so the next message starts over', async () => {
    let refuse = true
    const { webhook, requests } = vertical({}, async () => {
      if (refuse) throw new Error('telegram sendMessage 400: chat not found')
    })

    await webhook(delivery(70, 'hola, cuánto 1000 tarjetas')).catch(() => {})
    refuse = false
    await webhook(delivery(71, 'hola, cuánto 1000 tarjetas'))

    expect(requests).toHaveLength(2)
    expect(requests[0]!.system).toBe(requests[1]!.system)
  })
})
