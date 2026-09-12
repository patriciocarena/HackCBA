import { fence } from '../security/fence'
import { OUT_OF_CATALOG } from './handoff'
import type { Resolution, UntrustedText } from './types'

/**
 * What the shop is allowed to say about itself.
 *
 * One cap, and it is the whole point: what is not loaded here, Dante does not know, and not
 * knowing it means a person takes the conversation. The bot this replaces invented store
 * addresses and branches that do not exist. An empty fact is never filled with something
 * that sounds right.
 *
 * A fact that exists but has no value yet is pending data, and pending data escalates. That
 * is deliberate: a half loaded catalog of facts must fail loudly, not quietly.
 */

export type Fact = {
  key: string
  label: string
  value: string | null
  confirmedOn?: string
}

export function answerFromFacts(key: string, facts: Fact[]): Resolution {
  const fact = facts.find((candidate) => candidate.key === key)

  if (fact === undefined || fact.value === null) {
    return { kind: 'escalate', reason: 'unknown_fact', detail: OUT_OF_CATALOG }
  }

  return { kind: 'fact', key: fact.key, value: fact.value }
}

/**
 * The block handed to the turn. Only loaded facts go in, one fact per line, and D1's fence
 * carries the delimiter a value cannot guess. Deterministic on purpose: the same facts
 * always produce the same block.
 */
export function factsBlock(facts: Fact[]): UntrustedText {
  const loaded = facts
    .filter((fact) => fact.value !== null)
    .map((fact) => `${oneLine(fact.label)}: ${oneLine(fact.value as string)}`)

  return fence(loaded.join('\n'), 'facts')
}

/**
 * A line inside the block is a fact, so one newline in a value would write a second one.
 * That is how the bot this replaces invented branches. Nothing else is touched: the fence
 * around the block is what keeps the payload from ending it.
 */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
