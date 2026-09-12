import { describe, expect, test } from 'bun:test'
import { DELEGATE } from '../../src/domain/handoff'
import { baseConfig, catalogRows } from '../../src/catalog/business-cards'
import { totalOf } from '../../src/domain/breakdown'
import { ars } from '../../src/domain/money'
import { acceptQuote, advanceOrder, quoteFrom, type Actor } from '../../src/domain/order'
import { priceFor } from '../../src/domain/price-for'
import { conversationId, type Order, type Quote, type Resolution } from '../../src/domain/types'
import { intent, OFFSET_1000, withVat } from '../support/fixtures'

const quotedAt = '2026-09-12T10:00:00.000Z'
const conversation = conversationId('telegram', '55512345', 'customer')
const owner: Actor = { kind: 'person', id: 'telegram:55512345' }
const dante: Actor = { kind: 'agent' }

const priced: Resolution = priceFor(intent({ attributes: OFFSET_1000 }), catalogRows, baseConfig)

function aQuote(now = quotedAt): Quote {
  const made = quoteFrom({ id: 'qt_1', conversationId: conversation, resolution: priced, now })
  if (!made.ok) throw new Error(`expected a quote, got ${made.reason}`)
  return made.quote
}

function anOrder(now = quotedAt): Order {
  const accepted = acceptQuote(aQuote(), { id: 'ord_1', now })
  if (!accepted.ok) throw new Error(`expected an order, got ${accepted.reason}`)
  return accepted.order
}

function advancedTo(...states: Order['state'][]): Order {
  let order = anOrder()
  for (const state of states) {
    const moved = advanceOrder(order, { to: state, by: owner, now: quotedAt })
    if (!moved.ok) throw new Error(`expected ${state}, got ${moved.reason}`)
    order = moved.order
  }

  return order
}

describe('the order copies the price instead of pointing at it', () => {
  test('a breakdown edited after the quote does not move the order', () => {
    const live: Resolution = priceFor(intent({ attributes: OFFSET_1000 }), catalogRows, baseConfig)
    if (live.kind !== 'price') throw new Error('expected a price')

    const made = quoteFrom({ id: 'qt_9', conversationId: conversation, resolution: live, now: quotedAt })
    if (!made.ok) throw new Error(`expected a quote, got ${made.reason}`)

    const accepted = acceptQuote(made.quote, { id: 'ord_9', now: quotedAt })
    if (!accepted.ok) throw new Error(`expected an order, got ${accepted.reason}`)

    const agreed = totalOf(accepted.order.breakdown)
    live.breakdown.base.amount = ars(99999)

    expect(totalOf(accepted.order.breakdown)).toBe(agreed)
  })

  test('the quote holds its own copy, not the resolution the engine handed it', () => {
    const live: Resolution = priceFor(intent({ attributes: OFFSET_1000 }), catalogRows, baseConfig)
    if (live.kind !== 'price') throw new Error('expected a price')

    const made = quoteFrom({ id: 'qt_9', conversationId: conversation, resolution: live, now: quotedAt })
    if (!made.ok) throw new Error(`expected a quote, got ${made.reason}`)

    const quoted = totalOf(made.quote.breakdown)
    live.breakdown.base.amount = ars(99999)

    expect(totalOf(made.quote.breakdown)).toBe(quoted)
  })

  test('the order holds its own copy, not the quote the customer accepted', () => {
    const live: Resolution = priceFor(intent({ attributes: OFFSET_1000 }), catalogRows, baseConfig)
    if (live.kind !== 'price') throw new Error('expected a price')

    const made = quoteFrom({ id: 'qt_9', conversationId: conversation, resolution: live, now: quotedAt })
    if (!made.ok) throw new Error(`expected a quote, got ${made.reason}`)

    const accepted = acceptQuote(made.quote, { id: 'ord_9', now: quotedAt })
    if (!accepted.ok) throw new Error(`expected an order, got ${accepted.reason}`)

    const agreed = totalOf(accepted.order.breakdown)
    made.quote.breakdown.base.amount = ars(99999)

    expect(totalOf(accepted.order.breakdown)).toBe(agreed)
  })

  test('it is born quoted, carrying the breakdown it was quoted from', () => {
    const order = anOrder()

    expect(order.state).toBe('quoted')
    expect(order.quoteId).toBe('qt_1')
    expect(totalOf(order.breakdown)).toBe(withVat(45_000))
  })

  test('editing the catalog afterwards does not move the amount', () => {
    const order = anOrder()

    // The list goes up 40 percent and the engine now answers something else entirely.
    const dearer = catalogRows.map((row) =>
      row.slug === 'bc_offset_1000_4_1' ? { ...row, price: Math.round(row.price * 1.4) as never } : row,
    )
    const reQuoted = priceFor(intent({ attributes: OFFSET_1000 }), dearer, baseConfig)

    if (reQuoted.kind !== 'price') throw new Error('expected a price')
    expect(totalOf(reQuoted.breakdown)).not.toBe(totalOf(order.breakdown))
    expect(totalOf(order.breakdown)).toBe(withVat(45_000))
  })

  test('an escalation is not a quote', () => {
    const made = quoteFrom({
      id: 'qt_2',
      conversationId: conversation,
      resolution: { kind: 'escalate', reason: 'no_match', detail: DELEGATE },
      now: quotedAt,
    })

    expect(made.ok).toBe(false)
    if (made.ok) return
    expect(made.reason).toBe('not_a_price')
  })
})

describe('the window the customer was told is the window the quote holds', () => {
  test('fifteen days from the quote, written down, not worked out later', () => {
    const quote = aQuote()

    expect(quote.quotedAt).toBe(quotedAt)
    expect(quote.validUntil).toBe('2026-09-27T10:00:00.000Z')
  })

  test('the validity comes from the resolution, so no caller can pick another one', () => {
    if (priced.kind !== 'price') throw new Error('expected a price')

    const days =
      (Date.parse(aQuote().validUntil) - Date.parse(quotedAt)) / (24 * 60 * 60 * 1000)
    expect(days).toBe(priced.validityDays)
  })

  test('a quote past its window is not accepted', () => {
    const accepted = acceptQuote(aQuote(), { id: 'ord_1', now: '2026-09-28T10:00:00.000Z' })

    expect(accepted.ok).toBe(false)
    if (accepted.ok) return
    expect(accepted.reason).toBe('expired')
  })

  test('the last day of the window still works', () => {
    expect(acceptQuote(aQuote(), { id: 'ord_1', now: '2026-09-27T10:00:00.000Z' }).ok).toBe(true)
  })

  test('a time nobody can read is refused, not turned into an Invalid Date', () => {
    const made = quoteFrom({ id: 'qt_3', conversationId: conversation, resolution: priced, now: 'ayer' })

    expect(made.ok).toBe(false)
    if (made.ok) return
    expect(made.reason).toBe('not_a_time')
  })

  test('reading the quote a month later does not move its window', () => {
    const quote = aQuote()
    const same = JSON.parse(JSON.stringify(quote)) as Quote

    expect(same.validUntil).toBe(quote.validUntil)
  })
})

describe('a person moves the state, never the agent alone', () => {
  test('a person can move it forward', () => {
    const moved = advanceOrder(anOrder(), { to: 'deposit_pending', by: owner, now: quotedAt })

    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.order.state).toBe('deposit_pending')
  })

  test('the agent cannot move it on its own', () => {
    const moved = advanceOrder(anOrder(), { to: 'deposit_pending', by: dante, now: quotedAt })

    expect(moved.ok).toBe(false)
    if (moved.ok) return
    expect(moved.reason).toBe('not_a_person')
  })

  test('the agent being refused leaves the order untouched', () => {
    const order = anOrder()
    advanceOrder(order, { to: 'deposit_pending', by: dante, now: quotedAt })

    expect(order.state).toBe('quoted')
  })

  test('the deposit records who confirmed it and when', () => {
    const order = advancedTo('deposit_pending', 'deposit_confirmed')

    expect(order.depositConfirmedBy).toBe(owner.id)
    expect(order.depositConfirmedAt).toBe(quotedAt)
  })

  test('a state that is not the deposit records nobody', () => {
    const order = advancedTo('deposit_pending')

    expect(order.depositConfirmedBy).toBeNull()
  })
})

describe('a job always goes through the deposit', () => {
  test('quoted cannot jump straight to production', () => {
    const moved = advanceOrder(anOrder(), { to: 'in_production', by: owner, now: quotedAt })

    expect(moved.ok).toBe(false)
    if (moved.ok) return
    expect(moved.reason).toBe('not_a_transition')
  })

  test('the deposit cannot be skipped even by a person', () => {
    const pending = advancedTo('deposit_pending')

    expect(advanceOrder(pending, { to: 'files_ok', by: owner, now: quotedAt }).ok).toBe(false)
  })

  test('the whole run in order is allowed', () => {
    const order = advancedTo('deposit_pending', 'deposit_confirmed', 'files_ok', 'in_production')

    expect(order.state).toBe('in_production')
  })

  test('an order in production is not walked backwards', () => {
    const order = advancedTo('deposit_pending', 'deposit_confirmed')

    expect(advanceOrder(order, { to: 'quoted', by: owner, now: quotedAt }).ok).toBe(false)
  })
})

describe('cancelling is a move like any other, from wherever the job is', () => {
  // The rule used to be the position of a state in ORDER_STATES, which put `cancelled` last
  // and so made an order on the press the only one anybody could cancel.
  const live = ['quoted', 'deposit_pending', 'deposit_confirmed', 'files_ok', 'in_production'] as const

  for (const state of live) {
    test(`an order in ${state} can be cancelled`, () => {
      const order: Order = { ...anOrder(), state }

      expect(advanceOrder(order, { to: 'cancelled', by: owner, now: quotedAt }).ok).toBe(true)
    })
  }

  test('a cancelled order does not come back', () => {
    const order: Order = { ...anOrder(), state: 'cancelled' }

    expect(advanceOrder(order, { to: 'deposit_pending', by: owner, now: quotedAt }).ok).toBe(false)
  })

  test('the agent cannot cancel either', () => {
    expect(advanceOrder(anOrder(), { to: 'cancelled', by: dante, now: quotedAt }).ok).toBe(false)
  })
})
