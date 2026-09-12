import { describe, expect, it } from 'bun:test'
import { telegramAudio } from '@/telegram/admin-audio'

const TOKEN = 'bot-token'

function responses(...bodies: Array<Response | (() => Response)>) {
  const urls: string[] = []
  let next = 0

  return {
    urls,
    fetch: async (url: string) => {
      urls.push(url)
      const body = bodies[next++]
      if (body === undefined) throw new Error(`no response for ${url}`)
      return typeof body === 'function' ? body() : body
    },
  }
}

function file(path: string): Response {
  return Response.json({ ok: true, result: { file_id: 'voice-1', file_path: path } })
}

describe('telegramAudio', () => {
  it('asks where the file is, then downloads it', async () => {
    const stub = responses(file('voice/file_1.oga'), new Response(new Uint8Array([1, 2, 3])))

    const audio = await telegramAudio(TOKEN, stub.fetch)('voice-1')

    expect(audio).toEqual(new Uint8Array([1, 2, 3]))
    expect(stub.urls).toEqual([
      'https://api.telegram.org/botbot-token/getFile?file_id=voice-1',
      'https://api.telegram.org/file/botbot-token/voice/file_1.oga',
    ])
  })

  it('escapes the file id, so one cannot be dictated into another query parameter', async () => {
    const stub = responses(file('voice/file_1.oga'), new Response(new Uint8Array([1])))

    await telegramAudio(TOKEN, stub.fetch)('voice-1&offset=9')

    expect(stub.urls[0]).toEndWith('getFile?file_id=voice-1%26offset%3D9')
  })

  it('returns nothing for a file path that would climb out of the file endpoint', async () => {
    for (const path of ['../bot-token/getUpdates', 'voice/../../x', 'voice/file 1.oga', 'https://elsewhere/x']) {
      const stub = responses(file(path), new Response(new Uint8Array([1])))

      expect(await telegramAudio(TOKEN, stub.fetch)(`voice-1`)).toBeNull()
      expect(stub.urls).toHaveLength(1)
    }
  })

  it('returns nothing when Telegram will not say where the file is', async () => {
    const stub = responses(Response.json({ ok: false, description: 'file not found' }, { status: 400 }))

    expect(await telegramAudio(TOKEN, stub.fetch)('voice-1')).toBeNull()
  })

  it('returns nothing when the download fails, rather than an empty recording', async () => {
    const stub = responses(file('voice/file_1.oga'), new Response(null, { status: 502 }))

    expect(await telegramAudio(TOKEN, stub.fetch)('voice-1')).toBeNull()
  })

  it('returns nothing when the network is down, because the turn has no branch for a throw', async () => {
    const stub = responses(() => { throw new Error('ECONNRESET') })

    expect(await telegramAudio(TOKEN, stub.fetch)('voice-1')).toBeNull()
  })
})
