import { recordReceipt, type ReceiptStore } from '../domain/deposit'
import type { ConversationId, Order } from '../domain/types'
import type { InboundMessage } from '../telegram/inbound'

export type FindOrder = (conversationId: ConversationId) => Promise<Order | null>

export type Notify = (text: string) => Promise<void>

export type ReceiptPathDeps = {
  findOrder: FindOrder
  store: ReceiptStore
  notify: Notify
}

export type Recorded = { orderId: string }

/**
 * A non-null result means this message was the transfer and the turn must not run on it.
 * That is the contract the wiring owes: extraction would read "ya transferí" as `other`,
 * `other` escalates, and the conversation would end on the customer telling the shop they
 * had paid. Skipping the turn is also what keeps the receipt out of a model prompt, which
 * is the second half of the untrusted rule the fence covers on the way in.
 */
export function readReceipt(deps: ReceiptPathDeps): (message: InboundMessage) => Promise<Recorded | null> {
  const { findOrder, store, notify } = deps

  return async (message) => {
    // The conversation id already carries the role, so an admin's id would not find a
    // customer's order. Checked anyway: findOrder belongs to another module, and a receipt is
    // on the money path, where a wiring mistake has to fail closed rather than quietly.
    if (message.role !== 'customer') return null

    const order = await findOrder(message.conversationId)
    if (order === null) return null

    const recorded = await recordReceipt(
      order,
      { mediaId: photoId(message), text: message.text, receivedAt: message.receivedAt },
      store,
    )
    if (!recorded.ok) return null

    await notify(recorded.notice)

    return { orderId: order.id }
  }
}

/**
 * A transfer is a photo or it is typed. A voice note is neither, and passing its id would
 * store a dictated question as evidence of a payment, which is the one thing a receipt has
 * to be able to answer for.
 */
function photoId(message: InboundMessage): string | null {
  return message.media?.kind === 'photo' ? message.media.id : null
}
