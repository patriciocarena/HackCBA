import type { ConversationId, Role, UntrustedText } from '../domain/types'
import type { IsAdmin } from '../security/allowlist'
import type { Media } from './update'

export type InboundMessage = {
  updateId: number
  conversationId: ConversationId
  role: Role
  chatId: string
  senderId: string
  text: UntrustedText | null
  media: Media | null
  receivedAt: string
}

export type { IsAdmin }

export type Turn = (message: InboundMessage) => Promise<void>

export type InboundLog = {
  record(message: InboundMessage): Promise<void>
}

export const denyEveryone: IsAdmin = () => false

export const silentTurn: Turn = async () => {}

// ponytail: in memory, A3's table when a record has to outlive the process.
// It stores the fenced block, not the words. When A3 lands the table, record
// update.text instead: a nonce outlives nothing, so a rotated FENCE_SECRET
// leaves every stored row reading as a forgery.
export function inMemoryInboundLog(): InboundLog & { messages: InboundMessage[] } {
  const messages: InboundMessage[] = []

  return {
    messages,
    async record(message) {
      messages.push(message)
    },
  }
}
