import type { ConversationId, Order, OrderState, Quote, Resolution } from './types'

/**
 * A quote copies the breakdown it was priced from, and an order copies the quote's.
 *
 * This is the one place in the system where duplicating data is the correct answer: the
 * owner edits his list all day, and a customer who accepted a price yesterday holds that
 * price. Pointing at the row would silently rewrite what was agreed. `totalOf` reads the
 * copy, so editing the list never moves an amount already quoted.
 *
 * Pure, like the pricing engine: the current time arrives as an argument. Parsing a date
 * that was handed in is not reading the clock, so the same inputs always give the same order.
 */

export type Actor = { kind: 'person'; id: string } | { kind: 'agent' }

export type QuoteRefusal = 'not_a_price' | 'not_a_time'
export type OrderRefusal = 'expired' | 'not_a_time' | 'not_a_person' | 'not_a_transition'

export type QuoteOutcome = { ok: true; quote: Quote } | { ok: false; reason: QuoteRefusal }
export type OrderOutcome = { ok: true; order: Order } | { ok: false; reason: OrderRefusal }

export type QuoteInput = {
  id: string
  conversationId: ConversationId
  resolution: Resolution
  now: string
}

export type AcceptInput = {
  id: string
  now: string
}

export type AdvanceInput = {
  to: OrderState
  by: Actor
  now: string
}

/**
 * A job always goes through the deposit. No edge skips it, nothing walks back, and every
 * live state can be cancelled.
 *
 * Written out rather than derived from the position of a state in `ORDER_STATES`. That array
 * is a shared contract another lane appends to, and a rule that reads its order turns an
 * append into a silent change of what an order may do.
 */
const TRANSITIONS: Record<OrderState, OrderState[]> = {
  quoted: ['deposit_pending', 'cancelled'],
  deposit_pending: ['deposit_confirmed', 'cancelled'],
  deposit_confirmed: ['files_ok', 'cancelled'],
  files_ok: ['in_production', 'cancelled'],
  in_production: ['cancelled'],
  cancelled: [],
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export function quoteFrom(input: QuoteInput): QuoteOutcome {
  if (input.resolution.kind !== 'price') {
    // An escalation is a conversation handed to a person, and a question is not a sale.
    return { ok: false, reason: 'not_a_price' }
  }

  const quotedAt = instantOf(input.now)
  if (quotedAt === null) {
    return { ok: false, reason: 'not_a_time' }
  }

  return {
    ok: true,
    quote: {
      id: input.id,
      conversationId: input.conversationId,
      breakdown: structuredClone(input.resolution.breakdown),
      quotedAt: input.now,
      // The window the customer was told, from the resolution that told them. A caller that
      // could pass its own number could expire an order on a date nobody ever said.
      validUntil: new Date(quotedAt + input.resolution.validityDays * MILLISECONDS_PER_DAY).toISOString(),
    },
  }
}

export function acceptQuote(quote: Quote, input: AcceptInput): OrderOutcome {
  const now = instantOf(input.now)
  const validUntil = instantOf(quote.validUntil)
  if (now === null || validUntil === null) {
    return { ok: false, reason: 'not_a_time' }
  }

  if (now > validUntil) {
    // The quote said how long it held. Honouring it past that is the shop's call, not ours.
    return { ok: false, reason: 'expired' }
  }

  return {
    ok: true,
    order: {
      id: input.id,
      quoteId: quote.id,
      conversationId: quote.conversationId,
      breakdown: structuredClone(quote.breakdown),
      state: 'quoted',
      depositAlias: null,
      depositConfirmedBy: null,
      depositConfirmedAt: null,
    },
  }
}

export function advanceOrder(order: Order, input: AdvanceInput): OrderOutcome {
  if (input.by.kind !== 'person') {
    // Money moves when a person says it moved. The agent proposes and records, never decides.
    return { ok: false, reason: 'not_a_person' }
  }

  if (instantOf(input.now) === null) {
    return { ok: false, reason: 'not_a_time' }
  }

  if (!TRANSITIONS[order.state].includes(input.to)) {
    return { ok: false, reason: 'not_a_transition' }
  }

  if (input.to !== 'deposit_confirmed') {
    return { ok: true, order: { ...order, state: input.to } }
  }

  return {
    ok: true,
    order: {
      ...order,
      state: input.to,
      depositConfirmedBy: input.by.id,
      depositConfirmedAt: input.now,
    },
  }
}

function instantOf(value: string): number | null {
  const instant = new Date(value).getTime()
  return Number.isFinite(instant) ? instant : null
}
