import { Agent } from '@mastra/core/agent'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { dbUrl } from '../storage/sqlite'
import { WRITING_SYSTEM } from './prompt'
import type { Write } from './turn'

/**
 * The writing phase, and only the writing phase.
 *
 * Observational Memory hangs off a Memory on an Agent, so the phase that gets one has to become
 * an agent. Writing is the phase where that is safe: it receives the amount as data it may only
 * copy, and `amountsHold` in turn.ts checks the reply against the amounts the engine actually
 * gave. Extraction stays on the raw OpenRouter port with its strict schema, because an
 * observation is written by a model and an attribute that reaches `priceFor` may only come from
 * a customer's own words. See ADR 0019.
 */

/** `Agent.generate`, narrowed to what the writer uses, so a test can stand in for it. */
export type Generate = (
  message: string,
  options: {
    instructions: string
    memory: { thread: string; resource: string }
  },
) => Promise<{ text: string }>

const PREFIX = 'openrouter/'

/**
 * OPENROUTER_API_KEY is the only model credential in this repo, so every model string the
 * router is handed has to name that provider. See ADR 0002.
 */
export function routerModel(model: string): string {
  return model.startsWith(PREFIX) ? model : `${PREFIX}${model}`
}

/**
 * The Observer and the Reflector. Mastra defaults them to a bare `google/gemini-2.5-flash`,
 * which asks for a key this repo does not have and will not add. Naming them is not a
 * preference, it is what keeps the boot from needing a second credential.
 */
export const OBSERVER_MODEL = `${PREFIX}google/gemini-2.5-flash`

/**
 * `url` is a parameter so the eval can run against a database of its own. An eval that wrote
 * its observations into the shop's memory would change what the next real customer is answered
 * with, and its own third flow would stop starting from nothing.
 */
export function danteAgent(model: string, url = dbUrl()): Agent {
  return new Agent({
    id: 'dante-writer',
    name: 'Dante',
    instructions: WRITING_SYSTEM,
    model: routerModel(model),
    memory: new Memory({
      // Its own client on the same file the rest of the app already opens. Mastra creates
      // mastra_threads, mastra_messages, mastra_resources and mastra_observational_memory with
      // CREATE TABLE IF NOT EXISTS on first use, which is the posture storage/migrate.ts takes.
      storage: new LibSQLStore({ id: 'dante-memory', url }),
      options: { observationalMemory: { model: OBSERVER_MODEL } },
    }),
  })
}

/**
 * `instructions` rather than `system`, because it replaces the agent's own and the turn already
 * builds the whole prompt, introduction and all. One message per call and never the history:
 * the memory holds the past, and sending it again is what makes timestamps collide.
 */
export function agentWrite(agent: { generate: Generate }): Write {
  return async ({ system, user, thread, resource }) => {
    const { text } = await agent.generate(user, {
      instructions: system,
      memory: { thread, resource },
    })

    if (text.trim() === '') throw new Error('the writing agent returned no content')

    return text
  }
}
