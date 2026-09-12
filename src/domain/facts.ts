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

export type FactAnswer =
  | { kind: 'fact'; value: string }
  | { kind: 'escalate'; reason: 'not_a_fact'; detail: string }

const DELEGATE_DETAIL = 'eso no lo tengo cargado, te delego con un humano'

const FENCE_OPEN = '<facts>'
const FENCE_CLOSE = '</facts>'

export function answerFromFacts(key: string, facts: Fact[]): FactAnswer {
  const fact = facts.find((candidate) => candidate.key === key)

  if (fact === undefined || fact.value === null) {
    return { kind: 'escalate', reason: 'not_a_fact', detail: DELEGATE_DETAIL }
  }

  return { kind: 'fact', value: fact.value }
}

/**
 * The block handed to the turn. Only loaded facts go in, and a value can never close the
 * fence around it, whatever it contains. Deterministic on purpose: the same facts always
 * produce the same block.
 *
 * The project wide fencing of untrusted text is ticket D1. When it lands, neutralise() is
 * the single line to swap.
 */
export function factsBlock(facts: Fact[]): string {
  const loaded = facts
    .filter((fact) => fact.value !== null)
    .map((fact) => `${fact.label}: ${neutralise(fact.value as string)}`)

  return [FENCE_OPEN, ...loaded, FENCE_CLOSE].join('\n')
}

function neutralise(value: string): string {
  return value.split(FENCE_CLOSE).join('').split(FENCE_OPEN).join('')
}
