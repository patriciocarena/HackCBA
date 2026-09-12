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

export const localFence: Fence = (text) => text as UntrustedText

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
