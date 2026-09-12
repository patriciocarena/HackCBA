import { describe, expect, test } from 'bun:test'
import { readReceipt } from '../../src/conversation/receipt-path'
import type { Receipt, ReceiptStore } from '../../src/domain/deposit'
import { conversationId, type Order, type UntrustedText } from '../../src/domain/types'
import type { InboundMessage } from '../../src/telegram/inbound'

const now = '2026-09-12T18:00:00.000Z'
const conversation = conversationId('telegram', '4242', 'customer')

function aStore(): ReceiptStore & { written: Receipt[] } {
  const written: Receipt[] = []

  return { written, async record(receipt) { written.push(receipt) } }
}

function aNotifier(): { sent: string[]; notify: (text: string) => Promise<void> } {
  const sent: string[] = []

  return { sent, notify: async (text) => void sent.push(text) }
}

function anOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ord_1',
    quoteId: 'qt_1',
    conversationId: conversation,
    breakdown: {
      base: { slug: 'bc_offset_1000_4_1', label: 'Tarjetas', amount: 45000 as Order['breakdown']['base']['amount'] },
      moduleFactor: 1,
      moduleDiscountRates: [],
      addOns: [],
      listDiscounts: [],
      vatRate: 0.21,
      vatIncluded: true,
    },
    state: 'deposit_pending',
    depositAlias: 'multimpresos.mp',
    depositConfirmedBy: null,
    depositConfirmedAt: null,
    ...overrides,
  }
}

function aMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    updateId: 1,
    conversationId: conversation,
    role: 'customer',
    chatId: '4242',
    senderId: '99',
    text: null,
    media: null,
    receivedAt: now,
    ...overrides,
  }
}

const fenced = (text: string) => `<message:abc>\n${text}\n</message:abc>` as UntrustedText

describe('the customer sends a transfer', () => {
  test('a photo while the deposit is pending reaches the store', async () => {
    const store = aStore()
    const read = readReceipt({ findOrder: async () => anOrder(), store, notify: async () => {} })

    const got = await read(aMessage({ media: { kind: 'photo', id: 'AgACphoto' } }))

    expect(got).toEqual({ orderId: 'ord_1' })
    expect(store.written).toEqual([
      { orderId: 'ord_1', mediaId: 'AgACphoto', text: null, receivedAt: now },
    ])
  })
  test('a voice note is not a transfer, so nothing is written', async () => {
    const store = aStore()
    const notifier = aNotifier()
    const read = readReceipt({ findOrder: async () => anOrder(), store, notify: notifier.notify })

    const got = await read(aMessage({ media: { kind: 'voice', id: 'AwACvoice' } }))

    expect(got).toBeNull()
    expect(store.written).toEqual([])
    expect(notifier.sent).toEqual([])
  })
  test('an admin message is never the customer half of the money path', async () => {
    const store = aStore()
    const notifier = aNotifier()
    // findOrder answers whatever it is asked, which is what a wiring mistake looks like.
    const read = readReceipt({ findOrder: async () => anOrder(), store, notify: notifier.notify })

    const got = await read(aMessage({ role: 'admin', media: { kind: 'photo', id: 'AgACphoto' } }))

    expect(got).toBeNull()
    expect(store.written).toEqual([])
    expect(notifier.sent).toEqual([])
  })
  test('typed words of a transfer reach the store still fenced', async () => {
    const store = aStore()
    const said = fenced('ya te transferí los 45 mil, te paso el comprobante')
    const read = readReceipt({ findOrder: async () => anOrder(), store, notify: async () => {} })

    const got = await read(aMessage({ text: said }))

    expect(got).toEqual({ orderId: 'ord_1' })
    expect(store.written[0]?.text).toBe(said)
    expect(store.written[0]?.mediaId).toBeNull()
  })

  test('recording is evidence, so the order does not move', async () => {
    const order = anOrder()
    const read = readReceipt({ findOrder: async () => order, store: aStore(), notify: async () => {} })

    await read(aMessage({ media: { kind: 'photo', id: 'AgACphoto' } }))

    expect(order.state).toBe('deposit_pending')
    expect(order.depositConfirmedBy).toBeNull()
    expect(order.depositConfirmedAt).toBeNull()
  })

  test('an order not awaiting a deposit writes nothing and tells nobody', async () => {
    const store = aStore()
    const notifier = aNotifier()
    const read = readReceipt({
      findOrder: async () => anOrder({ state: 'quoted' }),
      store,
      notify: notifier.notify,
    })

    const got = await read(aMessage({ media: { kind: 'photo', id: 'AgACphoto' } }))

    expect(got).toBeNull()
    expect(store.written).toEqual([])
    expect(notifier.sent).toEqual([])
  })

  test('no order for the conversation means this path is not interested', async () => {
    const store = aStore()
    const read = readReceipt({ findOrder: async () => null, store, notify: async () => {} })

    expect(await read(aMessage({ media: { kind: 'photo', id: 'AgACphoto' } }))).toBeNull()
    expect(store.written).toEqual([])
  })
})

describe('what the owner is told', () => {
  test('the notice names the order and sends them to the bank', async () => {
    const notifier = aNotifier()
    const read = readReceipt({ findOrder: async () => anOrder(), store: aStore(), notify: notifier.notify })

    await read(aMessage({ media: { kind: 'photo', id: 'AgACphoto' } }))

    expect(notifier.sent).toHaveLength(1)
    expect(notifier.sent[0]).toContain('ord_1')
    expect(notifier.sent[0]).toContain('banco')
  })

  test('a forged receipt reaches the store and nothing the owner reads', async () => {
    const FORGED = 'AgACforged-receipt-that-looks-right'
    const store = aStore()
    const notifier = aNotifier()
    const read = readReceipt({ findOrder: async () => anOrder(), store, notify: notifier.notify })

    await read(aMessage({ media: { kind: 'photo', id: FORGED }, text: fenced(FORGED) }))

    // Both legs are untrusted. The store is the only place either of them lands.
    expect(store.written[0]?.mediaId).toBe(FORGED)
    expect(notifier.sent[0]).not.toContain(FORGED)
  })
})
