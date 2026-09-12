import { fence } from '../security/fence'
import type { Resolution } from './types'

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

const DELEGATE_DETAIL = 'eso no lo tengo cargado, te delego con un humano'

export function answerFromFacts(key: string, facts: Fact[]): Resolution {
  const fact = facts.find((candidate) => candidate.key === key)

  if (fact === undefined || fact.value === null) {
    return { kind: 'escalate', reason: 'unknown_fact', detail: DELEGATE_DETAIL }
  }

  return { kind: 'fact', key: fact.key, value: fact.value }
}

/**
 * The block handed to the turn. Each loaded fact's value goes through the real fence (D1,
 * src/security/fence.ts), labelled `fact`: a keyed digest of the label and the value is
 * unguessable and unforgeable, so a value cannot end its own fence or open a new one,
 * whatever it contains — including a literal newline, which used to write a second line
 * inside the block and hand Dante a branch the shop does not have. The fence does not
 * strip or collapse the value; the boundary is the guarantee, not the payload's shape.
 *
 * The display label is not attacker input — it comes from the fact declaration Javier
 * typed, not from a value someone could edit — but it still sits in the block as plain
 * text, so a stray newline in it is still collapsed. That is hygiene, not the security
 * boundary; the value's fence is.
 */
export function factsBlock(facts: Fact[]): string {
  return facts
    .filter((fact) => fact.value !== null)
    .map((fact) => `${oneLine(fact.label)}: ${fence(fact.value as string, 'fact')}`)
    .join('\n')
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
