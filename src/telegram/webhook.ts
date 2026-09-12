import { timingSafeEqual } from 'node:crypto'
import { conversationId, type Role } from '../domain/types'
import { fence } from '../security/fence'
import {
  denyEveryone,
  inMemoryInboundLog,
  silentTurn,
  type InboundLog,
  type IsAdmin,
  type InboundMessage,
  type Turn,
} from './inbound'
import { readCallback, type OnCallback } from './callback'
import { inMemorySeenUpdates, type SeenUpdates } from './seen-updates'
import { readUpdate } from './update'

const CHANNEL = 'telegram'
const SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token'

export type WebhookDeps = {
  secret: string
  isAdmin?: IsAdmin
  seenUpdates?: SeenUpdates
  log?: InboundLog
  turn?: Turn
  // Required, and deliberately not defaulted. The last defaulted port in this file was
  // `fence`, which fell back to an identity cast nothing ever replaced, and every Telegram
  // message reached the turn unfenced for as long as the seam existed. A forgotten wire has
  // to be a compile error rather than a button that does nothing in a live demo.
  onCallback: OnCallback
  now?: () => string
}

export function telegramWebhook(deps: WebhookDeps): (request: Request) => Promise<Response> {
  const {
    secret,
    isAdmin = denyEveryone,
    seenUpdates = inMemorySeenUpdates(),
    log = inMemoryInboundLog(),
    turn = silentTurn,
    onCallback,
    now = () => new Date().toISOString(),
  } = deps

  if (secret.length === 0) throw new Error('webhook secret is empty')
  const known = Buffer.from(secret)

  return async (request) => {
    if (!secretMatches(request.headers.get(SECRET_HEADER), known)) return new Response(null, { status: 401 })

    const body = await request.json().catch(() => null)

    // A button press is a callback_query and carries no `message`, so readUpdate reads it as
    // null and it was acknowledged and dropped. The two shapes are disjoint; whichever parser
    // claims the body owns it.
    const callback = readCallback(body)
    if (callback !== null) {
      if (await seenUpdates.seen(callback.updateId)) return acknowledged()
      await onCallback(callback)

      return acknowledged()
    }

    const update = readUpdate(body)
    if (update === null) return acknowledged()
    if (await seenUpdates.seen(update.updateId)) return acknowledged()

    const role: Role = update.privateChat && isAdmin(update.senderId) ? 'admin' : 'customer'
    const message: InboundMessage = {
      updateId: update.updateId,
      conversationId: conversationId(CHANNEL, update.chatId, role),
      role,
      chatId: update.chatId,
      senderId: update.senderId,
      text: update.text === null ? null : fence(update.text, 'message'),
      media: update.media,
      receivedAt: now(),
    }

    try {
      await log.record(message)
      await turn(message)
    } catch (error) {
      // The claim is given back and the failure is re-raised, so Telegram retries and the turn
      // runs again. Before this, a `sendMessage` that came back 429 threw, the handler answered
      // 500, and the retry found the id claimed: the customer was answered zero times and no
      // state recorded that anything had been attempted.
      //
      // This does not risk answering twice, and the reason is the order inside `customerTurn`:
      // the send is the last statement that can throw, so a throw means nothing was said. Any
      // Turn wired here owes the same, and it is the whole contract: a turn that has already
      // spoken must not throw.
      await seenUpdates.release(update.updateId)

      throw error
    }

    return acknowledged()
  }
}

function acknowledged(): Response {
  return new Response(null, { status: 200 })
}

function secretMatches(given: string | null, known: Buffer): boolean {
  if (given === null) return false

  const offered = Buffer.from(given)

  return offered.length === known.length && timingSafeEqual(offered, known)
}
