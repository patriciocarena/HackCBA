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

export function readReceipt(deps: ReceiptPathDeps): (message: InboundMessage) => Promise<Recorded | null> {
  const { findOrder, store, notify } = deps

  return async (message) => {
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
