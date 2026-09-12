import { describe, expect, test } from 'bun:test'
import { openRouterModel } from '@/conversation/openrouter'
import { SchemaDropped } from '@/conversation/structured-output'

const CONFIG = { apiKey: 'sk-test', model: 'anthropic/claude-opus-5' }

function answering(content: string, status = 200) {
  const sent: { url: string; body: Record<string, unknown> }[] = []

  return {
    sent,
    fetchImpl: async (url: string, init?: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init?.body)) })

      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })
    },
  }
}

describe('extraction', () => {
  test('asks for the schema it was given and returns the parsed answer', async () => {
    const { sent, fetchImpl } = answering('{"kind":"fact","factKey":"hours"}')
    const schema = { type: 'object', properties: {}, additionalProperties: false }

    const raw = await openRouterModel({ ...CONFIG, fetchImpl }).extract({
      system: 'you read a message',
      user: '<message:abc>\nhola\n</message:abc>',
      schema,
    })

    expect(raw).toEqual({ kind: 'fact', factKey: 'hours' })
    expect(sent[0].body).toMatchObject({
      model: CONFIG.model,
      temperature: 0,
      messages: [
        { role: 'system', content: 'you read a message' },
        { role: 'user', content: '<message:abc>\nhola\n</message:abc>' },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'intent', strict: true, schema } },
    })
  })

  test('a provider that answers with prose throws rather than returning a guess', async () => {
    const { fetchImpl } = answering('Claro, te ayudo con eso.')

    expect(openRouterModel({ ...CONFIG, fetchImpl }).extract({ system: 's', user: 'u', schema: {} })).rejects.toThrow()
  })

  test('and the throw says the schema was dropped, names the model, and is not an outage', async () => {
    const { fetchImpl } = answering('**Claro!** Te ayudo con eso.')

    expect(
      openRouterModel({ ...CONFIG, fetchImpl }).extract({ system: 's', user: 'u', schema: {} }),
    ).rejects.toBeInstanceOf(SchemaDropped)
    expect(
      openRouterModel({ ...CONFIG, fetchImpl }).extract({ system: 's', user: 'u', schema: {} }),
    ).rejects.toThrow('customer extraction lost its schema')
    expect(
      openRouterModel({ ...CONFIG, fetchImpl }).extract({ system: 's', user: 'u', schema: {} }),
    ).rejects.toThrow(CONFIG.model)
  })

  test('a refused request throws with the status on it', async () => {
    const { fetchImpl } = answering('{}', 401)

    expect(openRouterModel({ ...CONFIG, fetchImpl }).extract({ system: 's', user: 'u', schema: {} })).rejects.toThrow('401')
  })
})

describe('writing', () => {
  test('returns the text and asks for no schema', async () => {
    const { sent, fetchImpl } = answering('Te cotizo $45.000 final con IVA incluido.')

    const reply = await openRouterModel({ ...CONFIG, fetchImpl }).write({ system: 'sos dante', user: 'los bloques' })

    expect(reply).toBe('Te cotizo $45.000 final con IVA incluido.')
    expect(sent[0].body).not.toHaveProperty('response_format')
  })

  test('an empty answer throws, because a reply nobody wrote is not a reply', async () => {
    const { fetchImpl } = answering('')

    expect(openRouterModel({ ...CONFIG, fetchImpl }).write({ system: 's', user: 'u' })).rejects.toThrow()
  })
})
