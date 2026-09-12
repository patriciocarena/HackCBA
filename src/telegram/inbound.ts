import { fence } from '../security/fence'
import type { ConversationId, Role, UntrustedText } from '../domain/types'

export type InboundMessage = {
  updateId: number
  conversationId: ConversationId
  role: Role
  chatId: string
  senderId: string
  text: UntrustedText | null
  mediaId: string | null
  receivedAt: string
}

export type IsAdmin = (telegramUserId: string) => boolean

export type Fence = (text: string) => UntrustedText

export type Turn = (message: InboundMessage) => Promise<void>

export type InboundLog = {
  record(message: InboundMessage): Promise<void>
}

export const denyEveryone: IsAdmin = () => false

// The real fence (D1, src/security/fence.ts), labelled `message` because a customer or
// admin message is what this call site names it as. `fefaca7` shipped a fence that
// "brands and changes nothing" as an explicit placeholder default; this closes it. A
// message is untrusted the moment it leaves Telegram, so this runs before the role split
// above, before the turn, before anything reads `.text` as data.
export const localFence: Fence = (text) => fence(text, 'message')

export const silentTurn: Turn = async () => {}

// ponytail: in memory, A3's table when a record has to outlive the process
export function inMemoryInboundLog(): InboundLog & { messages: InboundMessage[] } {
  const messages: InboundMessage[] = []

  return {
    messages,
    async record(message) {
      messages.push(message)
    },
  }
}
