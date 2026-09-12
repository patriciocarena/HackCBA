import { describe, expect, it } from 'bun:test'
import { setTelegramWebhook } from '@/telegram/set-webhook'

const cfg = { token: 't', url: 'https://dante.example/telegram/webhook', secret: 's' }

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('setTelegramWebhook', () => {
  it('retries a transient failure and succeeds', async () => {
    const responses = [
      respond(400, { ok: false, description: 'Bad Request: bad webhook: Failed to resolve host' }),
      respond(200, { ok: true }),
    ]
    const slept: number[] = []

    await setTelegramWebhook(cfg, {
      fetch: async () => responses.shift()!,
      sleep: async (ms) => { slept.push(ms) },
    })

    expect(responses).toBeEmpty()
    expect(slept).toEqual([2000])
  })

  it('gives up after the backoff is exhausted and reports the last failure', async () => {
    const slept: number[] = []
    let calls = 0

    const run = setTelegramWebhook(cfg, {
      fetch: async () => {
        calls += 1
        return respond(400, { ok: false, description: 'Failed to resolve host' })
      },
      sleep: async (ms) => { slept.push(ms) },
    })

    expect(run).rejects.toThrow('setWebhook failed: Failed to resolve host')
    await run.catch(() => {})
    expect(calls).toBe(6)
    expect(slept).toEqual([2000, 5000, 15000, 30000, 60000])
  })
})
