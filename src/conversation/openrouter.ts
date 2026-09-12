import { structuredJson } from './structured-output'
import type { FetchLike } from '../voice/transcription'
import type { Extract, Write } from './turn'

export type OpenRouterConfig = {
  apiKey: string
  model: string
  fetchImpl?: FetchLike
}

export type Model = {
  extract: Extract
  write: Write
}

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const TIMEOUT_MS = 30_000

export function openRouterModel(config: OpenRouterConfig): Model {
  const { apiKey, model, fetchImpl = fetch } = config

  async function complete(system: string, user: string, format?: object): Promise<string> {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...format,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new Error(`openrouter ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`)
    }

    const content = (await response.json())?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('openrouter returned no content')
    }

    return content
  }

  return {
    async extract({ system, user, schema }) {
      const format = {
        response_format: { type: 'json_schema', json_schema: { name: 'intent', strict: true, schema } },
      }

      // Not JSON.parse. A 200 carrying prose is a schema this repo wrote and the provider
      // dropped, and SchemaDropped says so instead of raising an anonymous SyntaxError that
      // reads like a provider having a bad minute.
      return structuredJson(await complete(system, user, format), { port: 'customer extraction', model })
    },

    async write({ system, user }) {
      return await complete(system, user)
    },
  }
}
