import { totalOf } from '../domain/breakdown'
import type { Actor } from '../domain/order'
import { pesos } from '../domain/quote-text'
import type { CatalogRow } from '../domain/price-for'
import type { ConversationId, FamilyContract, Order } from '../domain/types'
import type { IsAdmin } from '../security/allowlist'
import { spanishAttributes } from '../catalog/spanish'
import type { Send } from '../telegram/send'
import type { Sale } from './sale'
import type { DepositOutcome } from '../domain/deposit'

export type WorkOrderDeps = {
  rows: () => CatalogRow[]
  family: FamilyContract
  send: Send
  ownerChatId: () => string | null
}

export type DeliverWorkOrder = (order: Order) => Promise<boolean>

/**
 * The job the owner prints from, sent once, when an order reaches deposit_confirmed.
 *
 * It hangs off the state and not off the receipt, so the vision path and a person typing the
 * confirmation both produce exactly one of these. The order id is the key, because a retried
 * update and a second receipt are two events about one job.
 */
export function workOrders(deps: WorkOrderDeps): DeliverWorkOrder {
  const { rows, family, send, ownerChatId } = deps

  // ponytail: in memory, A3's table when a work order has to survive a restart. The claim is
  // taken before the send, so a retry that arrives while the first is in flight finds it.
  const printed = new Set<string>()

  return async (order) => {
    if (order.state !== 'deposit_confirmed') return false
    if (printed.has(order.id)) return false

    const chatId = ownerChatId()
    // No allowlisted owner is nobody to hand the job to. Silence beats printing it at a
    // stranger, and the allowlist is the deployment fact that decides, per ADR 0009.
    if (chatId === null) return false

    printed.add(order.id)
    await send(chatId, workOrderText(order, rows(), family))

    return true
  }
}

/**
 * Everything he needs and nothing he has to ask about.
 *
 * The amount is `totalOf` over the order's own breakdown, which is the copy made when the
 * price was agreed. Never the receipt, never a model: what the customer transferred is
 * evidence that they paid, not a statement of what the job costs.
 *
 * The customer is named by the conversation the job came from and by nothing they typed. A
 * work order is read by a person who is about to act on it, which is the most valuable place
 * in the system to inject into, so their words do not appear here at all.
 */
export function workOrderText(order: Order, rows: CatalogRow[], family: FamilyContract): string {
  return [
    `ORDEN ${oneLine(order.id)}`,
    '',
    `Imprimir: ${jobLine(order, rows, family)}`,
    `Cobrado: ${pesos(totalOf(order.breakdown))}, seña confirmada.`,
    `Cliente: ${chatOf(order.conversationId)}`,
    `Cotizado: ${onlyTheDay(order.quotedAt)}`,
  ].join('\n')
}

function jobLine(order: Order, rows: CatalogRow[], family: FamilyContract): string {
  const row = rows.find((candidate) => candidate.slug === order.breakdown.base.slug)
  const stated = row?.attributes === undefined ? [] : spanishAttributes(row.attributes, family.askOrder)

  // No row is a list that moved under a job already sold. The label the breakdown copied is
  // what was agreed, so it is what gets printed, and the owner reads a slug rather than
  // nothing at all.
  if (stated.length === 0) return oneLine(`${family.label}, ${order.breakdown.base.label}`)

  return oneLine([family.label, ...stated].join(', '))
}

/**
 * The chat the job came from, which is how he reaches them. Not a name they typed.
 *
 * Collapsed onto one line even though the webhook builds this id from a Telegram chat id and
 * a number carries no newline. The work order is a block of labelled lines read by someone
 * about to cut paper, and a value that can open a seventh line is the whole attack; the guard
 * costs one call and does not depend on a sibling module keeping its promise.
 */
function chatOf(conversationId: ConversationId): string {
  const [channel, chatId] = String(conversationId).split(':')

  return oneLine(`${channel} ${chatId}`)
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function onlyTheDay(instant: string): string {
  return instant.slice(0, 10)
}

export type ConfirmAndPrint = (
  conversationId: ConversationId,
  by: Actor,
  isAdmin: IsAdmin,
) => Promise<DepositOutcome>

/**
 * The one funnel. `Sale.confirmDeposit` is the only edge into deposit_confirmed, so wrapping
 * it is what makes the work order fire from the state change rather than from whoever
 * remembered to send it. Every path that confirms a deposit calls this instead of the sale's
 * own method, and a path that does not is a job nobody prints.
 */
export function confirmingPrints(sale: Sale, deliver: DeliverWorkOrder): ConfirmAndPrint {
  return async (conversationId, by, isAdmin) => {
    const confirmed = sale.confirmDeposit(conversationId, by, isAdmin)
    if (confirmed.ok) await deliver(confirmed.order)

    return confirmed
  }
}
