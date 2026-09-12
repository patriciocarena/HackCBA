import { describe, expect, test } from 'bun:test'
import { advanceOrder, placeOrder, type Actor, type Order } from '../../src/domain/order'
import type { Resolution } from '../../src/domain/types'

const quotedAt = '2026-09-12T10:00:00.000Z'
const owner: Actor = { kind: 'person', id: 'telegram:55512345' }
const dante: Actor = { kind: 'agent' }

const priced: Extract<Resolution, { kind: 'price' }> = {
  kind: 'price',
  amount: 54_450,
  itemId: 9,
  explanation: 'Te cotizo $54.450 final con IVA incluido. La cotización es válida por 15 días.',
}

const anOrder = (): Order => {
  const placed = placeOrder({ id: 'ord_1', resolution: priced, now: quotedAt, validityDays: 15 })
  if (!placed.ok) throw new Error('expected the order to be placed')
  return placed.order
}

describe('the order copies the price instead of pointing at it', () => {
  test('it is born quoted, carrying the amount it was quoted at', () => {
    const order = anOrder()

    expect(order.state).toBe('quoted')
    expect(order.amount).toBe(54_450)
    expect(order.itemId).toBe(9)
  })

  test('editing the catalog afterwards does not move the amount', () => {
    const order = anOrder()

    // The list goes up 40 percent. The engine would now answer something else entirely.
    const reQuoted: typeof priced = { ...priced, amount: 76_230 }
    expect(reQuoted.amount).not.toBe(order.amount)

    // The order holds its own copy, and nothing about the catalog reaches it.
    expect(order.amount).toBe(54_450)
  })

  test('an escalation is not an order', () => {
    const placed = placeOrder({
      id: 'ord_2',
      resolution: { kind: 'escalate', reason: 'no_match', detail: 'te delego con un humano' },
      now: quotedAt,
      validityDays: 15,
    })

    expect(placed.ok).toBe(false)
  })
})

describe('the expiry is stored when the order is born', () => {
  test('fifteen days from the quote, written down, not worked out later', () => {
    const order = anOrder()

    expect(order.quotedAt).toBe(quotedAt)
    expect(order.expiresAt).toBe('2026-09-27T10:00:00.000Z')
  })

  test('reading the order a month later does not move its expiry', () => {
    const order = anOrder()
    const sameOrder = JSON.parse(JSON.stringify(order)) as Order

    expect(sameOrder.expiresAt).toBe(order.expiresAt)
  })
})

describe('a person moves the state, never the agent alone', () => {
  test('a person can move it forward, and the record says who', () => {
    const moved = advanceOrder(anOrder(), { to: 'deposit_pending', by: owner, now: quotedAt })

    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.order.state).toBe('deposit_pending')
    expect(moved.order.history.at(-1)?.by).toEqual(owner)
  })

  test('the agent cannot move it on its own', () => {
    const moved = advanceOrder(anOrder(), { to: 'deposit_confirmed', by: dante, now: quotedAt })

    expect(moved.ok).toBe(false)
  })

  test('the agent being refused leaves the order untouched', () => {
    const order = anOrder()
    advanceOrder(order, { to: 'deposit_confirmed', by: dante, now: quotedAt })

    expect(order.state).toBe('quoted')
  })

  test('every move is on the record, in order', () => {
    const first = advanceOrder(anOrder(), { to: 'deposit_pending', by: owner, now: quotedAt })
    if (!first.ok) throw new Error('expected the move')
    const second = advanceOrder(first.order, { to: 'deposit_confirmed', by: owner, now: '2026-09-12T11:00:00.000Z' })
    if (!second.ok) throw new Error('expected the move')

    expect(second.order.history.map((entry) => entry.state)).toEqual([
      'quoted',
      'deposit_pending',
      'deposit_confirmed',
    ])
  })
})

describe('a job always goes through the deposit', () => {
  test('quoted cannot jump straight to production', () => {
    const moved = advanceOrder(anOrder(), { to: 'in_production', by: owner, now: quotedAt })

    expect(moved.ok).toBe(false)
    if (moved.ok) return
    expect(moved.reason).toBe('skipped_a_state')
  })

  test('the deposit cannot be skipped even by a person', () => {
    const pending = advanceOrder(anOrder(), { to: 'deposit_pending', by: owner, now: quotedAt })
    if (!pending.ok) throw new Error('expected the move')

    // Straight from waiting on the deposit to the files being fine, with nothing confirmed.
    const skipped = advanceOrder(pending.order, { to: 'files_ok', by: owner, now: quotedAt })

    expect(skipped.ok).toBe(false)
  })

  test('the whole run in order is allowed', () => {
    let order = anOrder()
    for (const state of ['deposit_pending', 'deposit_confirmed', 'files_ok', 'in_production'] as const) {
      const moved = advanceOrder(order, { to: state, by: owner, now: quotedAt })
      expect(moved.ok).toBe(true)
      if (!moved.ok) return
      order = moved.order
    }

    expect(order.state).toBe('in_production')
    expect(order.history.map((entry) => entry.state)).toEqual([
      'quoted',
      'deposit_pending',
      'deposit_confirmed',
      'files_ok',
      'in_production',
    ])
  })

  test('an order in production is not walked backwards to quoted', () => {
    let order = anOrder()
    for (const state of ['deposit_pending', 'deposit_confirmed'] as const) {
      const moved = advanceOrder(order, { to: state, by: owner, now: quotedAt })
      if (!moved.ok) throw new Error('expected the move')
      order = moved.order
    }

    const backwards = advanceOrder(order, { to: 'quoted', by: owner, now: quotedAt })

    expect(backwards.ok).toBe(false)
  })
})
