import type { IsAdmin } from '../security/allowlist'
import { advanceOrder, mayAdvance, type Actor, type OrderRefusal } from './order'
import type { Ars } from './money'
import type { Order, UntrustedText } from './types'

export type DepositRefusal = OrderRefusal | 'no_alias' | 'not_an_admin'

export type DepositOutcome = { ok: true; order: Order } | { ok: false; reason: DepositRefusal }

export type RequestInput = {
  alias: string
  by: Actor
  now: string
}

/**
 * `advanceOrder` decides whether the edge exists; this only records which alias was sent.
 * Writing `state` here instead would fork the transition table, and the second copy is the
 * one that goes stale.
 */
export function requestDeposit(order: Order, input: RequestInput): DepositOutcome {
  const alias = input.alias.trim()
  if (alias.length === 0) {
    // An unset variable reads as a blank alias, and a blank alias asks a customer to transfer
    // into nothing. The same failure ADR 0009 describes for an unset allowlist.
    return { ok: false, reason: 'no_alias' }
  }

  const asked = advanceOrder(order, { to: 'deposit_pending', by: input.by, now: input.now })
  if (!asked.ok) {
    return asked
  }

  return { ok: true, order: { ...asked.order, depositAlias: alias } }
}

export type Receipt = {
  orderId: string
  mediaId: string | null
  text: UntrustedText | null
  receivedAt: string
}

/**
 * One member, and it writes. A receipt is kept so a dispute has an answer, not so the person
 * confirming can look at it: a forged photo that looks right is the threat this ticket names,
 * and a human who checks the picture instead of the bank is how it wins. `confirmDeposit`
 * therefore takes no store, and a store with no reader means there is no expression the
 * confirmation path could write to reach one.
 */
export type ReceiptStore = {
  record(receipt: Receipt): Promise<void>
}

// ponytail: in memory, A3's receipts table when a receipt has to outlive the process. No
// accessor, so the seam a later lane picks up cannot read a receipt back either, which is
// the same rule ADR 0013 puts on the type.
export function inMemoryReceipts(): ReceiptStore {
  const receipts: Receipt[] = []

  return {
    async record(receipt) {
      receipts.push(receipt)
    },
  }
}

export type ReceiptRefusal = 'no_deposit_pending' | 'empty_receipt'

export type ReceiptOutcome = { ok: true; notice: string } | { ok: false; reason: ReceiptRefusal }

export type ReceiptInput = {
  mediaId: string | null
  text: UntrustedText | null
  receivedAt: string
}

export async function recordReceipt(
  order: Order,
  input: ReceiptInput,
  store: ReceiptStore,
): Promise<ReceiptOutcome> {
  if (order.state !== 'deposit_pending') {
    // Nothing is lost by refusing: A4's inbound log already kept the message and its media.
    return { ok: false, reason: 'no_deposit_pending' }
  }

  if (input.mediaId === null && input.text === null) {
    return { ok: false, reason: 'empty_receipt' }
  }

  // Built field by field rather than spread. TypeScript only checks excess properties on an
  // object literal, so spreading a wider caller object would carry whatever else it holds into
  // the store, and the store is the one place a receipt is allowed to reach.
  await store.record({
    orderId: order.id,
    mediaId: input.mediaId,
    text: input.text,
    receivedAt: input.receivedAt,
  })

  // Everything this module ever says out loud about a receipt: which order, that one arrived,
  // and the only copy of the transfer that cannot be forged.
  return {
    ok: true,
    notice: `Llegó un comprobante para el pedido ${order.id}. Verificá el banco antes de confirmar.`,
  }
}

export type ConfirmInput = {
  by: Actor
  now: string
}

/**
 * Takes no `ReceiptStore`, on purpose, and that omission is the ticket. See `ReceiptStore`.
 *
 * The allowlist arrives injected and defaults to denying everyone, so a caller that forgets to
 * wire it confirms nothing rather than confirming for anybody.
 *
 * `by.id` is handed to the allowlist unchanged. The allowlist holds what `TELEGRAM_ADMIN_IDS`
 * holds, so the caller passes the Telegram user id and nothing else. Normalising a prefix here
 * would be a rule invented inside a security check, and the cost of not having it is a wiring
 * mistake that denies everyone, which is the direction a mistake should fail.
 */
export function confirmDeposit(
  order: Order,
  input: ConfirmInput,
  isAdmin: IsAdmin = () => false,
): DepositOutcome {
  if (input.by.kind !== 'person' || !isAdmin(input.by.id)) {
    return { ok: false, reason: 'not_an_admin' }
  }

  if (order.depositAlias === null || order.depositAlias.trim().length === 0) {
    // advanceOrder is public, so an order can reach deposit_pending without going through
    // requestDeposit and without ever naming where the money was meant to go. Confirming that
    // is confirming a transfer to nothing. Blank counts: requestDeposit refuses a blank alias,
    // and an order round-tripping through A3's TEXT column comes back '' rather than null.
    return { ok: false, reason: 'no_alias' }
  }

  return advanceOrder(order, { to: 'deposit_confirmed', by: input.by, now: input.now })
}

/**
 * What a person would check on a transfer receipt, and nothing else. Every field is the
 * model's reading of an image, so every field is untrusted: none of them may decide anything
 * on its own, and `owed` never comes from here.
 */
export type ReceiptReading = {
  looksLikeReceipt: boolean
  amount: number | null
  destination: string | null
  confidence: number
}

export type ReceiptVerdict =
  | 'not_a_receipt'
  | 'unsure'
  | 'no_amount'
  | 'wrong_amount'
  | 'wrong_destination'

export type AutoRefusal = DepositRefusal | ReceiptVerdict

export type AutoOutcome = { ok: true; order: Order } | { ok: false; reason: AutoRefusal }

export type FromReceiptInput = {
  reading: ReceiptReading
  /** The order's own money, computed from its own breakdown. Never the image's. */
  owed: Ars
  alias: string
  now: string
}

/** Who the record names when nobody pressed anything. Telegram user ids are digits only, so
 * this cannot collide with a person. */
export const AGENT = 'agent'

/**
 * The autonomous half of the deposit, beside `confirmDeposit` and not instead of it. An admin
 * keeps the power they had; this adds a second way in for the case where a person would have
 * had nothing to decide.
 *
 * The comparison is the whole point. `owed` arrives from the caller, computed off the order's
 * own breakdown, and the reading is only ever compared against it. There is no expression here
 * that reaches a confirmation using an amount the image supplied, which is why a receipt that
 * says it paid a million pesos confirms nothing.
 *
 * It asks `mayAdvance` rather than `advanceOrder`, because `advanceOrder` refuses an agent by
 * design and that refusal is correct for every other edge.
 */
export function confirmDepositFromReceipt(order: Order, input: FromReceiptInput): AutoOutcome {
  const { reading, owed, alias, now } = input

  // The order's own facts first. Nothing the image says is worth reading until the order is
  // one that could take a deposit at all.
  if (order.depositAlias === null) return { ok: false, reason: 'no_alias' }
  if (!Number.isFinite(new Date(now).getTime())) return { ok: false, reason: 'not_a_time' }
  if (!mayAdvance(order.state, 'deposit_confirmed')) return { ok: false, reason: 'not_a_transition' }

  if (!reading.looksLikeReceipt) return { ok: false, reason: 'not_a_receipt' }
  if (!(reading.confidence >= CONFIDENCE_FLOOR)) return { ok: false, reason: 'unsure' }
  if (reading.amount === null) return { ok: false, reason: 'no_amount' }
  if (reading.amount !== owed) return { ok: false, reason: 'wrong_amount' }
  if (!sameDestination(reading.destination, alias)) return { ok: false, reason: 'wrong_destination' }

  return {
    ok: true,
    order: { ...order, state: 'deposit_confirmed', depositConfirmedBy: AGENT, depositConfirmedAt: now },
  }
}

/**
 * Not a config value: it is the line below which we would rather a person looked, and it moves
 * only with an argument about why. `>=` written as `!(x >= floor)` above so a NaN confidence
 * fails rather than passing an inverted comparison.
 */
const CONFIDENCE_FLOOR = 0.8

function sameDestination(destination: string | null, alias: string): boolean {
  return destination !== null && destination.trim().toLowerCase() === alias.trim().toLowerCase()
}
