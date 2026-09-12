import type { Client } from '@libsql/client'
import type { InboundLog } from '@/telegram/inbound'

// media_id holds the id and not the kind. The kind is not derivable from a Telegram file id,
// so this drops it: a photo with no caption and a voice note both land as one id and a null
// text. Where the kind decides anything it is already kept, on price_edits.source. The DDL is
// recreated rather than migrated, so a column costs nothing to add the day a reader needs one.
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
          message.media?.id ?? null,
          message.receivedAt,
        ],
      })
    },
  }
}
