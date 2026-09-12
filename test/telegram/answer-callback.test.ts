import { describe, expect, test } from 'bun:test'
import { telegramAnswerCallback } from '@/telegram/send'
import type { FetchLike } from '@/voice/transcription'

const TOKEN = 'a-bot-token'

function spy(response: Response = Response.json({ ok: true })) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> })

    return response
  }

  return { calls, answer: telegramAnswerCallback(TOKEN, fetchImpl) }
}

describe('telegramAnswerCallback', () => {
  test('answers the query by its own id, which is what clears the spinner', async () => {
    const watched = spy()

    await watched.answer('cbq_1', 'Aplicado')

    expect(watched.calls[0]?.url).toBe(`https://api.telegram.org/bot${TOKEN}/answerCallbackQuery`)
    expect(watched.calls[0]?.body).toEqual({ callback_query_id: 'cbq_1', text: 'Aplicado' })
  })

  test('throws when Telegram refuses, so a caller can decide what that costs', async () => {
    const watched = spy(new Response('query is too old', { status: 400 }))

    expect(watched.answer('cbq_1', 'Aplicado')).rejects.toThrow('answerCallbackQuery 400')
  })
})
