import { describe, expect, it } from 'bun:test'
import { LOADED_FAMILIES } from '../../src/catalog/families'
import { amountOf } from '../../src/domain/price-for'
import { withVat } from '../support/fixtures'
import { DELEGATE } from '../../src/domain/handoff'
import { pesos } from '../../src/domain/quote-text'
import { baseConfig, catalogRows } from '@/catalog/business-cards'
import { customerTurn } from '@/conversation/customer-turn'
import { NO_MEDIA, type TurnDeps } from '@/conversation/turn'
import type { PriceForConfig } from '@/domain/price-for'
import type { Send } from '@/telegram/send'
import type { Notify } from '@/conversation/receipt-path'
import { telegramWebhook } from '@/telegram/webhook'
import { OFFSET_1000 } from '@test/support/fixtures'
import { inMemorySale } from '@/conversation/sale'
import { liveCatalog, type LiveCatalog } from '@/catalog/live-catalog'
import { conversationId } from '@/domain/types'
import { totalOf } from '@/domain/breakdown'
import { ars } from '@/domain/money'

const SECRET = 'a-long-random-string'

const QUOTE = {
  kind: 'quote',
  family: 'business_cards',
  attributes: OFFSET_1000,
  size: null,
  addOns: [],
  factKey: null,
}

/** What the owner's list charges for 1000 offset cards, net, as he typed it. */
const LISTED = 45_000

/**
 * What the customer is told, written out rather than computed. Asking `priceFor` what
 * `priceFor` should say proves the wiring and nothing about the price: double every row in the
 * seed and a derived expectation follows it up. ADR 0020: the list is net, so this is the list
 * amount plus 21%.
 */
const QUOTED = '$54.450'

/** The same row if the list had been final, which is the other branch of `totalOf`. */
const QUOTED_FINAL_LIST = '$45.000'

const QUOTED_REPLY = `Te cotizo ${QUOTED} final con IVA incluido.`

/**
 * The whole vertical behind one webhook, recording both ends: what the writer was asked and
 * what the customer was sent. A test overrides only the phase it is about.
 */
function vertical(overrides: Partial<TurnDeps> = {}, send?: Send, notify?: Notify) {
  const replies: { chatId: string; text: string }[] = []
  const requests: { system: string; user: string }[] = []

  const deps: TurnDeps = {
    rows: () => catalogRows,
    families: LOADED_FAMILIES,
    facts: [],
    extract: async () => QUOTE,
    write: async (request) => {
      requests.push(request)

      return QUOTED_REPLY
    },
    ...overrides,
  }

  const record: Send = async (chatId, text) => {
    replies.push({ chatId, text })
  }

  return { webhook: telegramWebhook({ secret: SECRET, turn: customerTurn(deps, send ?? record, notify), onCallback: async () => {} }), replies, requests }
}

/** A voice note as Telegram sends it: no text at all, and a file id. */
function voiceDelivery(updateId: number): Request {
  return new Request('https://dante.example/telegram/webhook', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: updateId,
      message: { chat: { id: -100, type: 'supergroup' }, from: { id: 42 }, voice: { file_id: 'voice-1' } },
    }),
  })
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

describe('a customer sends something Dante cannot read', () => {
  it('answers the voice note and tells the owner, instead of staying silent', async () => {
    const notified: string[] = []
    const { webhook, replies, requests } = vertical({}, undefined, async (text) => void notified.push(text))

    const response = await webhook(voiceDelivery(90))

    expect(response.status).toBe(200)
    expect(replies).toEqual([{ chatId: '-100', text: NO_MEDIA }])
    expect(requests).toBeEmpty()
    expect(notified).toHaveLength(1)
  })

  it('says nothing more, because a person owns the conversation now', async () => {
    const { webhook, replies } = vertical()

    await webhook(voiceDelivery(91))
    await webhook(delivery(92, 'hola, cuánto 1000 tarjetas'))

    expect(replies).toHaveLength(1)
  })
})

describe('a customer message crosses the whole vertical', () => {
  it('comes back with the exact pesos the engine computed, VAT included', async () => {
    const { webhook, replies } = vertical()

    const response = await webhook(delivery(70, 'hola, cuánto 1000 tarjetas'))

    expect(response.status).toBe(200)
    expect(replies).toEqual([{ chatId: '-100', text: QUOTED_REPLY }])
  })

  /**
   * The two halves of ADR 0020 in one assertion. The writer states the list amount, which is
   * what a model that read the owner's own table would say, and the guard refuses it because
   * the engine grossed it up. `totalOf`'s other branch, a family whose list is already final,
   * is unit tested: this vertical loads the families the shop actually loaded, and every one
   * of them is net.
   */
  it('refuses the list amount when the list is net, because the customer reads the gross', async () => {
    const reply = `Te cotizo ${QUOTED_FINAL_LIST} final con IVA incluido.`
    const { webhook, replies } = vertical({ write: async () => reply })

    await webhook(delivery(70, 'hola, cuánto 1000 tarjetas'))

    expect(replies).toBeEmpty()
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

const ACCEPT = { kind: 'accept', family: null, attributes: {}, size: null, addOns: [], factKey: null, reason: null }

const ALIAS = 'dante.imprenta.mp'

/**
 * Two messages, one conversation, through the webhook the route builds. The quote has to
 * survive the gap between them, which is the thing a per-message store silently loses.
 */
function saleVertical(catalog: LiveCatalog = liveCatalog(catalogRows)) {
  const replies: { chatId: string; text: string }[] = []
  let asked = 0

  const sale = inMemorySale({
    alias: ALIAS,
    now: () => '2026-09-12T14:00:00.000Z',
    id: () => `id_${(asked += 1)}`,
  })

  const deps: TurnDeps = {
    rows: catalog.rows,
    families: LOADED_FAMILIES,
    facts: [],
    sale,
    extract: async ({ user }) => (user.includes('la quiero') ? ACCEPT : QUOTE),
    // The writer copies the answer it was handed, which is what the real prompt tells it to do.
    write: async ({ user }) => user.split('<respuesta:')[1]?.split('\n').slice(1, -1).join('\n') ?? '',
  }

  const send: Send = async (chatId, text) => {
    replies.push({ chatId, text })
  }

  return {
    webhook: telegramWebhook({ secret: SECRET, turn: customerTurn(deps, send), onCallback: async () => {} }),
    replies,
    sale,
  }
}

describe('the customer accepts, and the order is born', () => {
  it('quotes, then turns an acceptance in a later message into a deposit ask', async () => {
    const { webhook, replies, sale } = saleVertical()

    await webhook(delivery(70, 'hola, cuánto 1000 tarjetas'))
    await webhook(delivery(71, 'dale, la quiero'))

    expect(replies).toHaveLength(2)
    expect(replies[0]?.text).toContain(QUOTED)

    const order = sale.orderFor(conversationId('telegram', '-100', 'customer'))
    expect(order?.state).toBe('deposit_pending')
    expect(order?.depositAlias).toBe(ALIAS)
    expect(totalOf(order!.breakdown)).toBe(withVat(LISTED))

    expect(replies[1]?.text).toContain(ALIAS)
    expect(replies[1]?.text).toContain(QUOTED)
  })

  it('escalates the acceptance when no sale store is wired, rather than inventing an order', async () => {
    const { webhook, replies } = vertical({
      extract: async ({ user }) => (user.includes('la quiero') ? ACCEPT : QUOTE),
      write: async ({ user }) => user.split('<respuesta:')[1]?.split('\n').slice(1, -1).join('\n') ?? '',
    })

    await webhook(delivery(70, 'hola, cuánto 1000 tarjetas'))
    await webhook(delivery(71, 'dale, la quiero'))

    expect(replies[1]?.text).toBe(DELEGATE)
  })
})

describe('the owner raises prices between the quote and the acceptance', () => {
  it('honours the amount the customer was quoted, and quotes the new one to the next customer', async () => {
    const catalog = liveCatalog(catalogRows)
    const { webhook, replies, sale } = saleVertical(catalog)

    await webhook(delivery(70, 'hola, cuánto 1000 tarjetas'))
    expect(replies[0]?.text).toContain(QUOTED)

    // The owner's edit lands through the same getter C10 wired, while the quote is still open.
    catalog.swap(catalogRows.map((row) => ({ ...row, price: ars(amountOf(row) * 2) })))

    await webhook(delivery(71, 'dale, la quiero'))

    const order = sale.orderFor(conversationId('telegram', '-100', 'customer'))
    expect(totalOf(order!.breakdown)).toBe(withVat(LISTED))
    expect(replies[1]?.text).toContain(QUOTED)

    // The next quote reads the list as it is now, which is the whole point of the getter.
    await webhook(delivery(72, 'hola, cuánto 1000 tarjetas'))
    expect(replies[2]?.text).toContain(pesos(withVat(LISTED * 2)))
  })
})
