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
import { inMemoryRateLimit, type RateLimit } from './rate-limit'
import { inMemorySeenUpdates, type SeenUpdates } from './seen-updates'
import type { ChatAction } from './send'
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
  rateLimit?: RateLimit
  /**
   * The "escribiendo..." line, sent after the budget check and before the turn. Optional, and
   * defaulted to nothing: a wiring that forgets it is a quiet screen, never a lost answer,
   * which is the opposite of the trade `onCallback` above makes.
   */
  typing?: ChatAction
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
    rateLimit = inMemoryRateLimit(),
    typing = noIndicator,
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
      if (!(await rateLimit.allow(callback.senderId))) return acknowledged()
      if (await seenUpdates.seen(callback.updateId)) return acknowledged()
      await onCallback(callback)

      return acknowledged()
    }

    const update = readUpdate(body)
    if (update === null) return acknowledged()

    // Before the dedupe claim and before the log, so a flood grows neither. Everything past
    // this line costs money: a row, a model call, a reply. A shed request is acknowledged and
    // forgotten, because any other status is a Telegram retry, and a retry is the flood again.
    if (!(await rateLimit.allow(update.senderId))) return acknowledged()
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

    await log.record(message)

    // Before the turn and not beside it. The turn is three model calls on a quote and about
    // twenty seconds on the voice path, and until it answers the customer's screen is blank.
    // Its failure is swallowed here as well as inside the port: this line owes the customer
    // nothing that is worth the answer they came for.
    await typing(message.chatId).catch(() => {})

    await turn(message)

    return acknowledged()
  }
}

const noIndicator: ChatAction = async () => {}

function acknowledged(): Response {
  return new Response(null, { status: 200 })
}

function secretMatches(given: string | null, known: Buffer): boolean {
  if (given === null) return false

  const offered = Buffer.from(given)

  return offered.length === known.length && timingSafeEqual(offered, known)
}
