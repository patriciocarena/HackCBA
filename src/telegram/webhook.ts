import { timingSafeEqual } from 'node:crypto'
import { conversationId, type Role } from '../domain/types'
import {
  denyEveryone,
  inMemoryInboundLog,
  localFence,
  silentTurn,
  type Fence,
  type InboundLog,
  type IsAdmin,
  type InboundMessage,
  type Turn,
} from './inbound'
import { inMemorySeenUpdates, type SeenUpdates } from './seen-updates'
import { readUpdate } from './update'

const CHANNEL = 'telegram'
const SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token'

export type WebhookDeps = {
  secret: string
  isAdmin?: IsAdmin
  fence?: Fence
  seenUpdates?: SeenUpdates
  log?: InboundLog
  turn?: Turn
  now?: () => string
}

export function telegramWebhook(deps: WebhookDeps): (request: Request) => Promise<Response> {
  const {
    secret,
    isAdmin = denyEveryone,
    fence = localFence,
    seenUpdates = inMemorySeenUpdates(),
    log = inMemoryInboundLog(),
    turn = silentTurn,
    now = () => new Date().toISOString(),
  } = deps

  if (secret.length === 0) throw new Error('webhook secret is empty')
  const known = Buffer.from(secret)

  return async (request) => {
    if (!secretMatches(request.headers.get(SECRET_HEADER), known)) return new Response(null, { status: 401 })

    const update = readUpdate(await request.json().catch(() => null))
    if (update === null) return acknowledged()
    if (await seenUpdates.seen(update.updateId)) return acknowledged()

    const role: Role = isAdmin(update.senderId) ? 'admin' : 'customer'
    const message: InboundMessage = {
      updateId: update.updateId,
      conversationId: conversationId(CHANNEL, update.chatId, role),
      role,
      chatId: update.chatId,
      senderId: update.senderId,
      text: update.text === null ? null : fence(update.text),
      mediaId: update.mediaId,
      receivedAt: now(),
    }

    await log.record(message)
    await turn(message)

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
