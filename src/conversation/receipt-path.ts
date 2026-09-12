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
  /**
   * How many photos one order is worth looking at. Every photo past it is still kept, and
   * none of them is read. Without a ceiling a customer holds a conversation open and sends
   * receipts in a loop, and each one is a real vision call the shop pays for.
   */
  maxReadings?: number
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
  const { findOrder, store, notify, maxReadings = MAX_READINGS } = deps

  // ponytail: in memory, and it dies with the process, which gives a flooder their budget
  // back on every restart. A3's orders table is where the count belongs once an order
  // outlives the process, beside the state it is a count of.
  const readings = new Map<string, number>()

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

    // Counted before the look and only for a photo, because a photo is the only thing that
    // reaches the model. The count is the order's, not the conversation's: a second order is
    // a second thing the shop wants read.
    const spent = readings.get(order.id) ?? 0
    if (photo !== null) readings.set(order.id, spent + 1)

    const verdict = await verdictFor(deps, message.conversationId, photo, spent >= maxReadings)

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

const MAX_READINGS = 3

type Verdict = 'confirmed' | 'not_a_photo' | 'too_many' | 'no_image' | 'unreadable' | AutoRefusal

/**
 * Every branch that is not a match returns a reason, and no branch returns anything the image
 * said. A thrown call is `unreadable` like a silent one: fail closed means the four ways this
 * can go wrong are one answer.
 *
 * The two answers that cost nothing come first. Nothing to look at, and too much already
 * looked at: neither reaches the download, let alone the model.
 */
async function verdictFor(
  deps: ReceiptPathDeps,
  conversationId: ConversationId,
  photo: string | null,
  spent: boolean,
): Promise<Verdict> {
  if (photo === null) return 'not_a_photo'
  if (spent) return 'too_many'

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
    case 'too_many':
      return 'No lo confirmé: ya miré varios comprobantes de este pedido, lo revisa una persona.'
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
