import { describe, expect, it } from 'bun:test'
import { telegramSend } from '@/telegram/send'

describe('telegramSend', () => {
  it('posts the reply to the chat it came from', async () => {
    const calls: { url: string; body: unknown }[] = []
    const send = telegramSend('a-bot-token', async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) })
      return new Response('{"ok":true}', { status: 200 })
    })

    await send('-100', 'Te cotizo $170.000 final con IVA incluido.')

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://api.telegram.org/bota-bot-token/sendMessage')
    expect(calls[0]!.body).toEqual({ chat_id: '-100', text: 'Te cotizo $170.000 final con IVA incluido.' })
  })

  it('throws when Telegram refuses, because a reply nobody received is not a reply', async () => {
    const send = telegramSend('a-bot-token', async () => new Response('chat not found', { status: 400 }))

    expect(send('-100', 'hola')).rejects.toThrow('telegram sendMessage 400')
  })
})
