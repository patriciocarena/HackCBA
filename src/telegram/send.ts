import type { FetchLike } from '../voice/transcription'
import { confirmData } from './callback'

export type Send = (chatId: string, text: string) => Promise<void>

export type AskToConfirm = (chatId: string, text: string, proposalId: string) => Promise<void>

/** Telegram requires an answer to every callback query, and it is what clears the spinner. */
export type AnswerCallback = (callbackId: string, text: string) => Promise<void>

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

/**
 * The same sendMessage, carrying the two buttons readCallback knows how to read. The data is
 * built by confirmData, so this end cannot invent a format the other end refuses.
 */
export function telegramAsk(token: string, fetchImpl: FetchLike = fetch): AskToConfirm {
  return async (chatId, text, proposalId) => {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Sí, aplicalo', callback_data: confirmData(proposalId, true) },
              { text: 'No', callback_data: confirmData(proposalId, false) },
            ],
          ],
        },
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')

      throw new Error(`telegram sendMessage ${response.status}: ${body.slice(0, 200)}`)
    }
  }
}

export function telegramAnswerCallback(token: string, fetchImpl: FetchLike = fetch): AnswerCallback {
  return async (callbackId, text) => {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackId, text }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')

      throw new Error(`telegram answerCallbackQuery ${response.status}: ${body.slice(0, 200)}`)
    }
  }
}
