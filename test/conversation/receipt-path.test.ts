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
})
