import type { Actor } from '../domain/order'
import { chatIdOf, type Order } from '../domain/types'
import type { IsAdmin } from '../security/allowlist'
import type { Send } from '../telegram/send'
import type { Sale } from './sale'

/** Narrowed to the two things confirming needs, so nothing here can hold a quote. */
export type ConfirmingSale = Pick<Sale, 'awaitingDeposit' | 'confirmDeposit'>

export type ConfirmsPendingDeps = {
  sale: ConfirmingSale
  isAdmin: IsAdmin
  /** The customer's chat, read off the order's own conversation. */
  send: Send
}

/** What the owner reads. Takes the order id when he named one, and needs none when one waits. */
export type ConfirmsPending = (by: Actor, orderId?: string) => Promise<string>

export const NOTHING_PENDING = 'No hay ninguna seña esperando confirmación.'

const NOT_CONFIRMED = 'No pude confirmar esa seña. Revisá el pedido antes de intentarlo de nuevo.'

/**
 * Whether a message from the owner says the money is in.
 *
 * ADR 0014 put the owner's price edits behind a button because a proposal has to be read back
 * before it lands. A deposit is the other shape: the thing he is agreeing to is a bank
 * statement, which Dante never sees, so there is nothing to read back and nothing to mint a
 * button from. He typed "confirmado" on his own channel, so that is what this reads.
 */
export function claimsConfirmation(text: string): boolean {
  return CONFIRMS.test(text)
}

// A word boundary is no help here: `\b` sits between letters and non-letters, and an accented
// vowel is a non-letter to it, so `confirmá` and `cobré` would never close. The lookahead does
// the same job over the alphabet this shop writes in. "confirmame el precio" matches nothing,
// which is the point: the word has to be the whole of what he said about it.
const CONFIRMS =
  /(?:^|[^a-záéíóúñ])(confirm(?:o|ad[oa]|á|ar|alo)|ya\s+cobr[eé]|entr[oó]\s+(?:la\s+)?plata|lleg[oó]\s+(?:la\s+)?(?:plata|transferencia))(?![a-záéíóúñ])/i

/**
 * The manual half of the money path, which had no caller at all: `Sale.confirmDeposit` existed
 * and nothing in `src/` reached it, so a receipt the reader refused left the customer told that
 * the shop would confirm and no way for the shop to do it.
 *
 * The owner's chat carries no customer, so the order comes off the pending list. One waiting is
 * the one he means. More than one is not a guess worth making with money, so both are named and
 * he says which.
 */
export function confirmsPending(deps: ConfirmingSale | ConfirmsPendingDeps): ConfirmsPending {
  const { sale, isAdmin, send } = deps as ConfirmsPendingDeps

  return async (by, orderId) => {
    const waiting = sale.awaitingDeposit()
    if (waiting.length === 0) return NOTHING_PENDING

    const named = orderId === undefined ? only(waiting) : waiting.find((order) => order.id === orderId)
    if (named === undefined) return whichOne(waiting)

    const confirmed = sale.confirmDeposit(named.conversationId, by, isAdmin)
    if (!confirmed.ok) return NOT_CONFIRMED

    // After the owner's own line and never instead of it: the deposit is already confirmed, and
    // a customer whose chat refuses the message is not a reason to tell the owner it failed.
    await send(chatIdOf(named.conversationId), CUSTOMER_TOLD).catch(() => {})

    return `Listo, confirmé la seña del pedido ${named.id}. Ya le avisé al cliente.`
  }
}

const CUSTOMER_TOLD = '¡Gracias! Confirmamos la seña y tu pedido ya entró en producción. Te aviso cuando esté listo.'

function only(waiting: Order[]): Order | undefined {
  return waiting.length === 1 ? waiting[0] : undefined
}

function whichOne(waiting: Order[]): string {
  return `Hay ${waiting.length} señas esperando: ${waiting.map((order) => order.id).join(', ')}. Decime cuál con "confirmado <id>".`
}
