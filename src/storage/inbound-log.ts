import type { Client } from '@libsql/client'
import type { InboundLog } from '@/telegram/inbound'

export function sqliteInboundLog(client: Client): InboundLog {
  return {
    async record(message) {
      await client.execute({
        sql: `INSERT INTO inbound_messages
          (update_id, conversation_id, role, chat_id, sender_id, text, media_id, received_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          message.updateId,
          message.conversationId,
          message.role,
          message.chatId,
          message.senderId,
          message.text,
          message.mediaId,
          message.receivedAt,
        ],
      })
    },
  }
}
