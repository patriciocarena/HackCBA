import { advanceOrder, type Actor, type OrderRefusal } from './order'
import type { Order, UntrustedText } from './types'

/**
 * The deposit is where the conversation stops being a conversation and money moves, so every
 * step here is attributed to a person and none of them is taken by the agent.
 */

export type DepositRefusal = OrderRefusal | 'no_alias'

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

  await store.record({ orderId: order.id, ...input })

  return { ok: true, notice: noticeFor(order) }
}

/**
 * Everything this module ever says out loud about a receipt. It names the order, says one
 * arrived, and points the reader at the only copy that cannot be forged.
 */
function noticeFor(order: Order): string {
  return `Llegó un comprobante para el pedido ${order.id}. Verificá el banco antes de confirmar.`
}
