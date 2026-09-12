import { ORDER_STATES, type OrderState, type Resolution } from './types'

/**
 * An order copies the amount it was quoted at. It never points at a catalog row.
 *
 * This is the one place in the system where duplicating data is the correct answer: the
 * owner edits his list all day, and a customer who accepted a price yesterday holds that
 * price. Pointing at the row would silently rewrite what was agreed.
 *
 * Pure, like the pricing engine: the current time arrives as an argument. Parsing a date
 * that was handed in is not reading the clock, so the same inputs always give the same order.
 */

export type Actor = { kind: 'person'; id: string } | { kind: 'agent' }

export type OrderEvent = {
  state: OrderState
  at: string
  by: Actor
}

export type Order = {
  id: string
  itemId: number
  amount: number
  explanation: string
  state: OrderState
  quotedAt: string
  expiresAt: string
  history: OrderEvent[]
}

export type PlaceOrderInput = {
  id: string
  resolution: Resolution
  now: string
  validityDays: number
}

export type AdvanceOrderInput = {
  to: OrderState
  by: Actor
  now: string
}

export type OrderOutcome =
  | { ok: true; order: Order }
  | { ok: false; reason: 'not_a_price' | 'not_a_person' | 'skipped_a_state' }

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export function placeOrder(input: PlaceOrderInput): OrderOutcome {
  if (input.resolution.kind !== 'price') {
    // An escalation is a conversation handed to a person, not a sale.
    return { ok: false, reason: 'not_a_price' }
  }

  return {
    ok: true,
    order: {
      id: input.id,
      itemId: input.resolution.itemId,
      amount: input.resolution.amount,
      explanation: input.resolution.explanation,
      state: 'quoted',
      quotedAt: input.now,
      expiresAt: expiryOf(input.now, input.validityDays),
      history: [{ state: 'quoted', at: input.now, by: { kind: 'agent' } }],
    },
  }
}

export function advanceOrder(order: Order, input: AdvanceOrderInput): OrderOutcome {
  if (input.by.kind !== 'person') {
    // Money moves when a person says it moved. The agent proposes and records, never decides.
    return { ok: false, reason: 'not_a_person' }
  }

  // A job always goes through the deposit. States advance one step, in the order they are
  // declared, so nothing reaches production with nothing confirmed and nothing walks back.
  if (ORDER_STATES.indexOf(input.to) !== ORDER_STATES.indexOf(order.state) + 1) {
    return { ok: false, reason: 'skipped_a_state' }
  }

  return {
    ok: true,
    order: {
      ...order,
      state: input.to,
      history: [...order.history, { state: input.to, at: input.now, by: input.by }],
    },
  }
}

function expiryOf(quotedAt: string, validityDays: number): string {
  return new Date(new Date(quotedAt).getTime() + validityDays * MILLISECONDS_PER_DAY).toISOString()
}
