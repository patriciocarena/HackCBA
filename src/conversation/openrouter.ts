import { requireEnv } from '../config/env'
import type { FetchLike } from '../voice/transcription'
import type { Extract, Write } from './turn'

export type OpenRouterConfig = {
  apiKey: string
  model: string
  fetchImpl?: FetchLike
  timeoutMs?: number
}

export type Model = {
  extract: Extract
  write: Write
}

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_TIMEOUT_MS = 30_000

export function openRouterModel(config: OpenRouterConfig): Model {
  const { apiKey, model, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = config

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
      signal: AbortSignal.timeout(timeoutMs),
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

      return JSON.parse(await complete(system, user, format))
    },

    async write({ system, user }) {
      return await complete(system, user)
    },
  }
}

export function modelFromEnv(): Model {
  return openRouterModel({ apiKey: requireEnv('OPENROUTER_API_KEY'), model: requireEnv('OPENROUTER_MODEL') })
}
