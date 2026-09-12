import { describe, expect, it } from 'bun:test'
import { baseConfig, catalogRows } from '@/catalog/business-cards'
import { customerTurn } from '@/conversation/customer-turn'
import type { TurnDeps } from '@/conversation/turn'
import { totalOf } from '@/domain/breakdown'
import { priceFor } from '@/domain/price-for'
import { pesos } from '@/domain/quote-text'
import { telegramWebhook } from '@/telegram/webhook'
import type { Send } from '@/telegram/send'
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

function sent(): Send & { replies: { chatId: string; text: string }[] } {
  const replies: { chatId: string; text: string }[] = []
  const send = (async (chatId: string, text: string) => { replies.push({ chatId, text }) }) as ReturnType<typeof sent>
  send.replies = replies

  return send
}

function deps(overrides: Partial<TurnDeps> = {}): TurnDeps {
  return {
    rows: catalogRows,
    config: baseConfig,
    facts: [],
    extract: async () => QUOTE,
    write: async () => `Te cotizo ${quotedTotal()} final con IVA incluido.`,
    ...overrides,
  }
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
    const send = sent()
    const webhook = telegramWebhook({ secret: SECRET, turn: customerTurn(deps(), send) })

    const response = await webhook(delivery(70, 'hola, cuánto 1000 tarjetas'))

    expect(response.status).toBe(200)
    expect(send.replies).toEqual([{ chatId: '-100', text: `Te cotizo ${quotedTotal()} final con IVA incluido.` }])
    expect(quotedTotal()).not.toBe(pesos(0))
  })

  it('says nothing when the writer states an amount the engine did not compute', async () => {
    const send = sent()
    const webhook = telegramWebhook({
      secret: SECRET,
      turn: customerTurn(deps({ write: async () => 'Te cotizo $1 final con IVA incluido.' }), send),
    })

    const response = await webhook(delivery(70, 'hola, cuánto 1000 tarjetas'))

    expect(response.status).toBe(200)
    expect(send.replies).toBeEmpty()
  })

  it('carries one message of state into the next, so the introduction happens once', async () => {
    const send = sent()
    const systems: string[] = []
    const webhook = telegramWebhook({
      secret: SECRET,
      turn: customerTurn(
        deps({
          write: async ({ system }) => {
            systems.push(system)

            return `Te cotizo ${quotedTotal()} final con IVA incluido.`
          },
        }),
        send,
      ),
    })

    await webhook(delivery(70, 'hola, cuánto 1000 tarjetas'))
    await webhook(delivery(71, 'y 500?'))

    expect(systems).toHaveLength(2)
    expect(systems[0]).not.toBe(systems[1])
    expect(systems[0]!.startsWith(systems[1]!)).toBe(true)
  })
})
