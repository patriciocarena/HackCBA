import { acceptQuote, quoteFrom, type Actor } from '../domain/order'
import { requestDeposit } from '../domain/deposit'
import { pesos } from '../domain/quote-text'
import { totalOf } from '../domain/breakdown'
import type { ConversationId, Quote, Resolution } from '../domain/types'

export type SaleConfig = {
  alias: string
  now: () => string
  id: () => string
}

export type Sale = {
  hold(conversationId: ConversationId, resolution: Resolution): void
  accept(conversationId: ConversationId, by: Actor): Resolution
}

const DELEGATE = 'te delego con un humano'

// ponytail: a Map, A3's tables when a quote has to outlive the process. One store, because
// the quote a conversation may accept and the state that conversation is in expire together.
export function inMemorySale(config: SaleConfig): Sale {
  const held = new Map<ConversationId, Quote>()

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

      return { kind: 'accepted', order: asked.order, alias: config.alias }
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
