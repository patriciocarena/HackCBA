import type { FetchLike } from '../voice/transcription'
import { confirmData } from './callback'

export type Send = (chatId: string, text: string) => Promise<void>

/**
 * A reply with its markdown markers taken off.
 *
 * Nothing here is sent with a parse_mode, so a marker the writing model adds is a marker the
 * customer reads, and the amount is what it wraps most. Adding parse_mode instead would be
 * the worse trade: Telegram answers an unbalanced marker with a 400, so a correct quote
 * carrying one stray asterisk would become no quote at all.
 *
 * Only a pair around non-space content is unwrapped. A lone asterisk is somebody's
 * multiplication sign and an underscore inside a word is part of an address, and neither is
 * emphasis to remove.
 */
export function plainText(text: string): string {
  return text
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '$1')
    .replace(/__(?=\S)([\s\S]*?\S)__/g, '$1')
    .replace(/(?<![*\w])\*(?=\S)([^*\n]*?\S)\*(?![*\w])/g, '$1')
}

export type AskToConfirm = (chatId: string, text: string, proposalId: string) => Promise<void>

/** Telegram requires an answer to every callback query, and it is what clears the spinner. */
export type AnswerCallback = (callbackId: string, text: string) => Promise<void>

/** The "escribiendo..." line under the chat title. Telegram clears it after five seconds. */
export type ChatAction = (chatId: string) => Promise<void>

export function telegramSend(token: string, fetchImpl: FetchLike = fetch): Send {
  return async (chatId, text) => {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: plainText(text) }),
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
        text: plainText(text),
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

/**
 * The indicator, and the one call in this file that is allowed to fail quietly.
 *
 * Everything else here owes the customer something: a reply nobody received is not a reply,
 * so sendMessage throws. This owes them nothing but the knowledge that Dante is awake, and
 * losing it costs a moment of doubt. Letting it throw would cost the answer itself, which is
 * the trade the other direction and the wrong one.
 */
export function telegramChatAction(token: string, fetchImpl: FetchLike = fetch): ChatAction {
  return async (chatId) => {
    await fetchImpl(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    }).catch(() => null)
  }
}
