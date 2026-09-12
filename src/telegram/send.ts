import type { FetchLike } from '../voice/transcription'

export type Send = (chatId: string, text: string) => Promise<void>

export function telegramSend(token: string, fetchImpl: FetchLike = fetch): Send {
  return async (chatId, text) => {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')

      throw new Error(`telegram sendMessage ${response.status}: ${body.slice(0, 200)}`)
    }
  }
}
