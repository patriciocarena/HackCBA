import type { IsAdmin } from '../security/allowlist'
import { advanceOrder, type Actor, type OrderRefusal } from './order'
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
