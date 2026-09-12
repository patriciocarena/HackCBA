import { DELEGATE } from '../domain/handoff'
import { acceptQuote, quoteFrom, type Actor } from '../domain/order'
import {
  confirmDeposit,
  confirmDepositFromReceipt,
  requestDeposit,
  type AutoOutcome,
  type DepositOutcome,
  type ReceiptReading,
} from '../domain/deposit'
import { pesos } from '../domain/quote-text'
import { totalOf } from '../domain/breakdown'
import type { IsAdmin } from '../security/allowlist'
import type { ConversationId, Order, Quote, Resolution } from '../domain/types'

export type SaleConfig = {
  alias: string
  now: () => string
  id: () => string
}

export type Sale = {
  hold(conversationId: ConversationId, resolution: Resolution): void
  accept(conversationId: ConversationId, by: Actor): Resolution
  orderFor(conversationId: ConversationId): Order | null
  /**
   * Takes no receipt store, and there is none in this module to take. ADR 0013 is the
   * authority: the person confirming reads the bank, never the photo.
   */
  confirmDeposit(conversationId: ConversationId, by: Actor, isAdmin: IsAdmin): DepositOutcome
  /**
   * The autonomous half. Beside `confirmDeposit`, never instead of it: an admin keeps the
   * power they had. Both write the same map, which is why this lives here rather than in the
   * receipt path: the port owns its orders and nothing outside it may set one.
   */
  confirmFromReceipt(conversationId: ConversationId, reading: ReceiptReading): AutoOutcome
  /**
   * Every order waiting for its deposit. The owner types "confirmado" in his own chat, which
   * carries no customer's conversation, so the one thing he can be answered with is the list
   * of what is waiting. Derived from the orders the port already holds, never a second store.
   */
  awaitingDeposit(): Order[]
}

// ponytail: a Map, A3's tables when a quote has to outlive the process. One store, because
// the quote a conversation may accept and the state that conversation is in expire together.
export function inMemorySale(config: SaleConfig): Sale {
  const held = new Map<ConversationId, Quote>()
  const orders = new Map<ConversationId, Order>()

  return {
    hold(conversationId, resolution) {
      const quote = quoteFrom({ id: config.id(), conversationId, resolution, now: config.now() })
      // Only a price is a quote. quoteFrom refuses the rest, and a refusal holds nothing.
      if (quote.ok) held.set(conversationId, quote.quote)
    },

    accept(conversationId, by) {
      const quote = held.get(conversationId)
      if (quote === undefined) return escalate('ambiguous', DELEGATE)

      const order = acceptQuote(quote, { id: config.id(), now: config.now() })
      if (!order.ok) {
        return order.reason === 'expired'
          ? escalate('ambiguous', `ese presupuesto venció el ${onlyTheDay(quote.validUntil)}, te paso uno nuevo`)
          : escalate('ambiguous', DELEGATE)
      }

      const asked = requestDeposit(order.order, { alias: config.alias, by, now: config.now() })
      if (!asked.ok) return escalate('ambiguous', DELEGATE)

      held.delete(conversationId)
      orders.set(conversationId, asked.order)

      return { kind: 'accepted', order: asked.order, alias: config.alias }
    },

    orderFor(conversationId) {
      return orders.get(conversationId) ?? null
    },

    confirmFromReceipt(conversationId, reading) {
      const order = orders.get(conversationId)
      if (order === undefined) return { ok: false, reason: 'not_a_transition' }

      // Both sides of the comparison come off the order: what it owes, and the alias this
      // customer was actually told. Neither is config.alias, which may have moved since, and
      // neither is anything the image said.
      const confirmed = confirmDepositFromReceipt(order, {
        reading,
        owed: totalOf(order.breakdown),
        alias: order.depositAlias ?? '',
        now: config.now(),
      })
      if (confirmed.ok) orders.set(conversationId, confirmed.order)

      return confirmed
    },

    awaitingDeposit() {
      return [...orders.values()].filter((order) => order.state === 'deposit_pending')
    },

    confirmDeposit(conversationId, by, isAdmin) {
      const order = orders.get(conversationId)
      // No order is not a transition anyone may make, which is what advanceOrder would say
      // if there were an order to ask it about.
      if (order === undefined) return { ok: false, reason: 'not_a_transition' }

      const confirmed = confirmDeposit(order, { by, now: config.now() }, isAdmin)
      if (confirmed.ok) orders.set(conversationId, confirmed.order)

      return confirmed
    },
  }
}

export function depositText(resolution: Extract<Resolution, { kind: 'accepted' }>): string {
  return `Listo, te reservo el pedido por ${pesos(totalOf(resolution.order.breakdown))}. Para confirmarlo, transferí a ${resolution.alias} y mandame el comprobante.`
}

function escalate(reason: 'ambiguous', detail: string): Resolution {
  return { kind: 'escalate', reason, detail }
}

function onlyTheDay(instant: string): string {
  return instant.slice(0, 10)
}
