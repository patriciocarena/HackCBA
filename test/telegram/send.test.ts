import { describe, expect, it } from 'bun:test'
import { plainText, telegramAsk, telegramChatAction, telegramSend } from '@/telegram/send'

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

/**
 * Replies are posted with no parse_mode, so a marker the writing model adds arrives as a
 * marker. The amount is the first thing on screen in the demo and the model wraps it often,
 * so `**$45.000**` is what a customer reads. Stripping is the fix and parse_mode is not:
 * Telegram's parser rejects an unbalanced marker with a 400, which would turn a correct
 * quote into no quote at all.
 */
describe('plainText', () => {
  it('unwraps the amount the writing model emphasised', () => {
    expect(plainText('Te cotizo **$45.000** final con IVA incluido.')).toBe(
      'Te cotizo $45.000 final con IVA incluido.',
    )
  })

  it('unwraps the single marker too, because models emit both', () => {
    expect(plainText('Son *$45.000* finales.')).toBe('Son $45.000 finales.')
  })

  it('unwraps an underscored span without touching a mail address', () => {
    expect(plainText('Escribinos a info@multimpresos.com.ar, __te contestamos__.')).toBe(
      'Escribinos a info@multimpresos.com.ar, te contestamos.',
    )
  })

  it('leaves a lone marker alone, because an unpaired one is somebody\'s text', () => {
    expect(plainText('El 2 * 3 es 6, y el precio no lleva *')).toBe('El 2 * 3 es 6, y el precio no lleva *')
  })

  it('leaves a plain sentence exactly as the writer wrote it', () => {
    expect(plainText('Te delego con un humano.')).toBe('Te delego con un humano.')
  })
})

describe('telegramSend, on what reaches the phone', () => {
  it('posts the stripped text, because no parse_mode means a marker is a marker', async () => {
    const calls: { body: { text?: string } }[] = []
    const send = telegramSend('a-bot-token', async (_url, init) => {
      calls.push({ body: JSON.parse(String(init?.body)) })
      return new Response('{"ok":true}', { status: 200 })
    })

    await send('-100', 'Te cotizo **$45.000** final con IVA incluido.')

    expect(calls[0]!.body.text).toBe('Te cotizo $45.000 final con IVA incluido.')
  })
})

describe('telegramAsk, on what reaches the phone', () => {
  it('strips the proposal the owner reads before he presses', async () => {
    const calls: { body: { text?: string } }[] = []
    const ask = telegramAsk('a-bot-token', async (_url, init) => {
      calls.push({ body: JSON.parse(String(init?.body)) })
      return new Response('{"ok":true}', { status: 200 })
    })

    await ask('77', 'Subo **14 filas** un 20%.', 'proposal-1')

    expect(calls[0]!.body.text).toBe('Subo 14 filas un 20%.')
  })
})

/**
 * The webhook awaits the turn before it answers, so the customer's screen is dead for the
 * whole round trip: three model calls on a quote, and about twenty seconds on the voice
 * path. Telegram's own indicator is the cheapest honest signal that something is happening,
 * and it is one POST.
 */
describe('telegramChatAction', () => {
  it('tells the chat that Dante is writing', async () => {
    const calls: { url: string; body: unknown }[] = []
    const typing = telegramChatAction('a-bot-token', async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) })
      return new Response('{"ok":true}', { status: 200 })
    })

    await typing('-100')

    expect(calls[0]!.url).toBe('https://api.telegram.org/bota-bot-token/sendChatAction')
    expect(calls[0]!.body).toEqual({ chat_id: '-100', action: 'typing' })
  })

  // The indicator is a courtesy and the reply is the product. A Telegram that refuses this
  // one must not cost the customer the answer, so unlike sendMessage it never throws.
  it('swallows a refusal, because an indicator is never worth an answer', async () => {
    const typing = telegramChatAction('a-bot-token', async () => new Response('nope', { status: 400 }))

    expect(await typing('-100').then(() => 'resolved')).toBe('resolved')
  })

  it('swallows a network that is not there at all', async () => {
    const typing = telegramChatAction('a-bot-token', async () => { throw new Error('offline') })

    expect(await typing('-100').then(() => 'resolved')).toBe('resolved')
  })
})
