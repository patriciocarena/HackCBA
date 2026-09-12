import { describe, expect, test } from 'bun:test'
import { withVat } from '../support/fixtures'
import { totalOf } from '@/domain/breakdown'
import { confirmDepositFromReceipt, AGENT, type AutoRefusal, type ReceiptReading } from '@/domain/deposit'
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
  return { looksLikeReceipt: true, amount: withVat(45_000), destination: ALIAS, confidence: 0.95, ...overrides }
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
  test('a matching alias in different case and spacing still confirms', () => {
    const order = awaitingDeposit()
    const got = confirmDepositFromReceipt(order, {
      reading: read({ destination: '  Dante.Imprenta.MP ' }),
      owed: owed(order),
      alias: ALIAS,
      now,
    })

    expect(got.ok).toBe(true)
  })
})

describe('fail closed, every way in', () => {
  const order = awaitingDeposit()

  const refusals: [string, Partial<ReceiptReading>, AutoRefusal][] = [
    ['it is not a receipt at all', { looksLikeReceipt: false }, 'not_a_receipt'],
    ['the model is not sure it read it', { confidence: 0.79 }, 'unsure'],
    ['the confidence is not a number', { confidence: Number.NaN }, 'unsure'],
    ['no amount was read', { amount: null }, 'no_amount'],
    ['the amount is short', { amount: 44999 }, 'wrong_amount'],
    ['the amount is over', { amount: 45001 }, 'wrong_amount'],
    ['no destination was read', { destination: null }, 'wrong_destination'],
    ['the transfer went to a CBU we never named', { destination: '0000003100010000000001' }, 'wrong_destination'],
    ['the transfer went to somebody else', { destination: 'otra.imprenta.mp' }, 'wrong_destination'],
  ]

  for (const [why, overrides, reason] of refusals) {
    test(`${why} does not confirm`, () => {
      const got = confirmDepositFromReceipt(order, { reading: read(overrides), owed: owed(order), alias: ALIAS, now })

      expect(got).toEqual({ ok: false, reason })
    })
  }

  test('an order that is not awaiting a deposit does not confirm', () => {
    const quoted = awaitingDeposit({ state: 'quoted' })
    const got = confirmDepositFromReceipt(quoted, { reading: read(), owed: owed(quoted), alias: ALIAS, now })

    expect(got).toEqual({ ok: false, reason: 'not_a_transition' })
  })

  test('an order that never named a destination does not confirm', () => {
    const blind = awaitingDeposit({ depositAlias: null })
    const got = confirmDepositFromReceipt(blind, { reading: read(), owed: owed(blind), alias: ALIAS, now })

    expect(got).toEqual({ ok: false, reason: 'no_alias' })
  })

  test('a refusal leaves the order exactly as it was', () => {
    const untouched = awaitingDeposit()
    confirmDepositFromReceipt(untouched, {
      reading: read({ amount: 1 }),
      owed: owed(untouched),
      alias: ALIAS,
      now,
    })

    expect(untouched.state).toBe('deposit_pending')
    expect(untouched.depositConfirmedBy).toBeNull()
  })
})

describe('nothing the image says can reach a confirmation', () => {
  test('a receipt claiming a fortune, perfectly read, to the right alias, is a wrong amount', () => {
    const order = awaitingDeposit()
    const got = confirmDepositFromReceipt(order, {
      reading: read({ amount: 100_000_000, confidence: 1 }),
      owed: owed(order),
      alias: ALIAS,
      now,
    })

    expect(got).toEqual({ ok: false, reason: 'wrong_amount' })
  })

  test('owed comes from the breakdown, so editing the list after the quote confirms nothing new', () => {
    const order = awaitingDeposit()

    // The list doubles. The order still owes what it was quoted, and that is what is compared.
    expect(owed(order)).toBe(totalOf(order.breakdown))

    const got = confirmDepositFromReceipt(order, {
      reading: read({ amount: owed(order) * 2 }),
      owed: owed(order),
      alias: ALIAS,
      now,
    })

    expect(got).toEqual({ ok: false, reason: 'wrong_amount' })
  })
})
