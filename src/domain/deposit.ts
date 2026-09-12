import { advanceOrder, type Actor, type OrderRefusal } from './order'
import type { Order } from './types'

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
