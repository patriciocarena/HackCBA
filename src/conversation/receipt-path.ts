import {
  recordReceipt,
  type AutoOutcome,
  type AutoRefusal,
  type ReceiptReading,
  type ReceiptStore,
} from '../domain/deposit'
import type { ConversationId, Order } from '../domain/types'
import type { InboundMessage, Turn } from '../telegram/inbound'
import type { ReadImage } from './receipt-reading'

/**
 * `Sale.orderFor`, narrowed to the one method this needs. Synchronous because the order it
 * returns is the one the sale port is holding in memory, and it has to be that one: a second
 * store would leave every test on both sides green while the owner confirmed an order no
 * receipt was attached to.
 */
export type FindOrder = (conversationId: ConversationId) => Order | null

/** `Sale.confirmFromReceipt`. The port owns its orders, so the port does the writing. */
export type ConfirmFromReceipt = (conversationId: ConversationId, reading: ReceiptReading) => AutoOutcome

/** Telegram's getFile plus download, which `telegramAudio` already is. */
export type FetchImage = (fileId: string) => Promise<Uint8Array<ArrayBuffer> | null>

export type Notify = (text: string) => Promise<void>

export type ReceiptPathDeps = {
  findOrder: FindOrder
  store: ReceiptStore
  notify: Notify
  fetchImage: FetchImage
  readImage: ReadImage
  confirm: ConfirmFromReceipt
}

export type Recorded = { orderId: string; confirmed: boolean }

export type ReadReceipt = (message: InboundMessage) => Promise<Recorded | null>

/**
 * A non-null result means this message was the transfer and the turn must not run on it.
 * That is the contract the wiring owes: extraction reads "ya transferi" as `other`, `other`
 * escalates, and the customer would end their own conversation by saying they had paid.
 * Skipping the turn is also what keeps the receipt out of a model prompt, which is the second
 * half of the untrusted rule the fence covers on the way in.
 *
 * The order of the two halves is deliberate. Recording is evidence and happens first, so a
 * photo nobody could read is still the answer to a dispute. Only then is it looked at.
 */
export function readReceipt(deps: ReceiptPathDeps): ReadReceipt {
  const { findOrder, store, notify } = deps

  return async (message) => {
    // The conversation id already carries the role, so an admin's id would not find a
    // customer's order. Checked anyway: findOrder belongs to another module, and a receipt is
    // on the money path, where a wiring mistake has to fail closed rather than quietly.
    if (message.role !== 'customer') return null

    const order = findOrder(message.conversationId)
    if (order === null) return null

    const photo = photoId(message)
    const recorded = await recordReceipt(
      order,
      { mediaId: photo, text: message.text, receivedAt: message.receivedAt },
      store,
    )
    if (!recorded.ok) return null

    const verdict = photo === null ? 'not_a_photo' : await verdictFor(deps, message.conversationId, photo)

    await notify(`${recorded.notice} ${sentenceFor(verdict)}`)

    return { orderId: order.id, confirmed: verdict === 'confirmed' }
  }
}

export function receiptTurn(deps: ReceiptPathDeps, next: Turn): Turn {
  const read = readReceipt(deps)

  return async (message) => {
    if ((await read(message)) !== null) return

    await next(message)
  }
}

type Verdict = 'confirmed' | 'not_a_photo' | 'no_image' | 'unreadable' | AutoRefusal

/**
 * Every branch that is not a match returns a reason, and no branch returns anything the image
 * said. A thrown call is `unreadable` like a silent one: fail closed means the four ways this
 * can go wrong are one answer.
 */
async function verdictFor(deps: ReceiptPathDeps, conversationId: ConversationId, photo: string): Promise<Verdict> {
  const image = await deps.fetchImage(photo).catch(() => null)
  if (image === null) return 'no_image'

  const reading = await deps.readImage(image).catch(() => null)
  if (reading === null) return 'unreadable'

  const confirmed = deps.confirm(conversationId, reading)

  return confirmed.ok ? 'confirmed' : confirmed.reason
}

/**
 * What the owner reads. It names the verdict and never the receipt: no amount the image
 * claimed, no destination it showed, no file id. Those live in the store and nowhere else.
 */
function sentenceFor(verdict: Verdict): string {
  switch (verdict) {
    case 'confirmed':
      return 'Lo verifiqué y lo confirmé solo.'
    case 'wrong_amount':
      return 'No lo confirmé: el importe no coincide con lo que debe el pedido.'
    case 'wrong_destination':
      return 'No lo confirmé: la transferencia no fue al alias que le pasamos.'
    case 'not_a_receipt':
      return 'No lo confirmé: la imagen no parece un comprobante.'
    case 'not_a_photo':
      return 'No lo confirmé: lo dijo por texto y no hay nada para mirar.'
    case 'unsure':
    case 'no_amount':
    case 'no_image':
    case 'unreadable':
      return 'No lo confirmé: no pude leerlo.'
    default:
      return 'No lo confirmé solo.'
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
