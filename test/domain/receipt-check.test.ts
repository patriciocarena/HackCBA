import { describe, expect, test } from 'bun:test'
import { totalOf } from '@/domain/breakdown'
import { confirmDepositFromReceipt, AGENT, type ReceiptReading } from '@/domain/deposit'
import { acceptQuote, quoteFrom } from '@/domain/order'
import { priceFor } from '@/domain/price-for'
import { catalogRows, baseConfig } from '@/catalog/business-cards'
import { conversationId, type Order } from '@/domain/types'
import { intent, OFFSET_1000 } from '@test/support/fixtures'

const now = '2026-09-12T18:00:00.000Z'
const ALIAS = 'dante.imprenta.mp'
const conversation = conversationId('telegram', '4242', 'customer')

/** The order the seed prices at $45.000, built the way the sale port builds one. */
function awaitingDeposit(overrides: Partial<Order> = {}): Order {
  const priced = priceFor(intent({ attributes: OFFSET_1000 }), catalogRows, baseConfig)
  const quote = quoteFrom({ id: 'qt_1', conversationId: conversation, resolution: priced, now })
  if (!quote.ok) throw new Error(quote.reason)

  const order = acceptQuote(quote.quote, { id: 'ord_1', now })
  if (!order.ok) throw new Error(order.reason)

  return { ...order.order, state: 'deposit_pending', depositAlias: ALIAS, ...overrides }
}

const owed = (order: Order) => totalOf(order.breakdown)

function read(overrides: Partial<ReceiptReading> = {}): ReceiptReading {
  return { looksLikeReceipt: true, amount: 45000, destination: ALIAS, confidence: 0.95, ...overrides }
}

describe('the agent confirms only what it can check against the order', () => {
  test('the right amount to the right alias confirms, and the record says the agent did it', () => {
    const order = awaitingDeposit()

    const got = confirmDepositFromReceipt(order, { reading: read(), owed: owed(order), alias: ALIAS, now })

    if (!got.ok) throw new Error(`expected a confirmation, got ${got.reason}`)
    expect(got.order.state).toBe('deposit_confirmed')
    expect(got.order.depositConfirmedBy).toBe(AGENT)
    expect(got.order.depositConfirmedAt).toBe(now)
  })
})
