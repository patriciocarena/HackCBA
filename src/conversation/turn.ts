import { totalOf } from '../domain/breakdown'
import { answerFromFacts, factsBlock, type Fact } from '../domain/facts'
import { priceFor, type CatalogRow, type PriceForConfig } from '../domain/price-for'
import { askText, pesos, quoteText } from '../domain/quote-text'
import {
  quoteIntentSchema,
  type EscalationReason,
  type FactIntent,
  type FamilyContract,
  type OtherIntent,
  type QuoteIntent,
  type Resolution,
  type TurnState,
} from '../domain/types'
import { fence } from '../security/fence'
import type { InboundMessage } from '../telegram/inbound'
import { extractionSchema, EXTRACTION_REASONS, EXTRACTION_SYSTEM, WRITING_SYSTEM, INTRODUCTION } from './prompt'

export type Extract = (request: { system: string; user: string; schema: object }) => Promise<unknown>

export type Write = (request: { system: string; user: string }) => Promise<string>

export type TurnDeps = {
  rows: CatalogRow[]
  config: PriceForConfig
  facts: Fact[]
  extract: Extract
  write: Write
}

/** `resolution` is what was said, so it carries a value exactly when `reply` does. */
export type TurnResult = {
  reply: string | null
  resolution: Resolution | null
  state: TurnState
}

export async function turn(
  deps: TurnDeps,
  message: InboundMessage,
  state: TurnState,
): Promise<TurnResult> {
  if (state.conversationId !== message.conversationId) {
    throw new Error(`state for ${state.conversationId} was handed a message from ${message.conversationId}`)
  }

  if (state.escalated) return silence(state)
  if (message.role !== 'customer' || message.text === null) return silence(state)

  // The webhook fenced it on the way in, which is what UntrustedText brands. Fencing a
  // second time nests one nonce inside another and tells the model nothing it did not know.
  const fenced = message.text

  const resolution = await resolve(deps, fenced).catch((): Resolution => escalate('ambiguous'))
  const settled = settle(resolution, state)
  const answer = answerOf(settled)

  const reply = await deps
    .write({ system: writingSystem(state), user: writingUser(deps, fenced, answer) })
    .catch(() => null)

  if (reply === null || !amountsHold(reply, answer, settled)) {
    return silence({ ...state, escalated: true })
  }

  return { reply, resolution: settled, state: nextState(state, settled) }
}

function silence(state: TurnState): TurnResult {
  return { reply: null, resolution: null, state }
}

const DELEGATE = 'te delego con un humano'

async function resolve(deps: TurnDeps, fenced: string): Promise<Resolution> {
  const family = deps.config.family
  const raw = await deps.extract({
    system: EXTRACTION_SYSTEM,
    user: fenced,
    schema: extractionSchema(family),
  })

  // A reason outranks the kind. Extraction naming one means it recognised something the
  // engine must not answer, and a quote filled in beside it is a quote nobody may be given.
  const stated = statedReason(raw)
  if (stated !== null) return escalate(stated)

  if (answerKind(raw) === 'admin_edit') return escalate('not_authorized')

  const intent = readIntent(raw, family)
  if (intent === null) return escalate('unsupported_option')

  switch (intent.kind) {
    case 'quote':
      return priceFor(intent, deps.rows, deps.config)
    case 'fact':
      return answerFromFacts(intent.key, deps.facts)
    case 'other':
      return escalate('ambiguous')
  }
}

function escalate(reason: EscalationReason): Resolution {
  return { kind: 'escalate', reason, detail: DELEGATE }
}

function statedReason(raw: unknown): EscalationReason | null {
  const stated = (raw as Record<string, unknown>)?.reason

  return EXTRACTION_REASONS.some((reason) => reason === stated)
    ? (stated as EscalationReason)
    : null
}

function answerKind(raw: unknown): unknown {
  return (raw as Record<string, unknown>)?.kind
}

/** Null is a quote the loaded catalog cannot express, which is not the same as no quote. */
function readIntent(
  raw: unknown,
  family: FamilyContract,
): QuoteIntent | FactIntent | OtherIntent | null {
  const answered = raw as Record<string, unknown>

  if (answerKind(raw) === 'fact') return { kind: 'fact', key: String(answered.factKey ?? '') }
  if (answerKind(raw) !== 'quote') return { kind: 'other' }

  const parsed = quoteIntentSchema(family).safeParse({
    kind: 'quote',
    family: answered.family,
    attributes: stated(answered.attributes),
    size: answered.size,
    addOns: answered.addOns,
  })

  return parsed.success ? parsed.data : null
}

function stated(attributes: unknown): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries((attributes ?? {}) as Record<string, string | number | null>).filter(
      ([, value]) => value !== null,
    ),
  ) as Record<string, string | number>
}

function settle(resolution: Resolution, state: TurnState): Resolution {
  if (resolution.kind !== 'ask') return resolution
  if (!resolution.missing.some((name) => state.asked.includes(name))) return resolution

  return escalate('missing_attribute')
}

function answerOf(resolution: Resolution): string {
  switch (resolution.kind) {
    case 'price':
      return quoteText(resolution.breakdown, resolution.validityDays)
    case 'ask':
      return askText(resolution.missing)
    case 'fact':
      return resolution.value
    case 'escalate':
      return resolution.detail
  }
}

function nextState(state: TurnState, resolution: Resolution): TurnState {
  return {
    ...state,
    introduced: true,
    escalated: resolution.kind === 'escalate',
    asked: resolution.kind === 'ask' ? [...new Set([...state.asked, ...resolution.missing])] : state.asked,
  }
}

function writingSystem(state: TurnState): string {
  return state.introduced ? WRITING_SYSTEM : `${WRITING_SYSTEM}\n\n${INTRODUCTION}`
}

function writingUser(deps: TurnDeps, fenced: string, answer: string): string {
  return [factsBlock(deps.facts), fenced, fence(answer, 'respuesta')].join('\n\n')
}

// ponytail: a pesos-shaped run is what a model writes when it states a price. A number
// spelled out in words would pass; the prompt forbids arithmetic and this catches the shape
// every fixture produces.
const AMOUNT = /\$\s?[\d.,]*\d/g

export function amountsIn(text: string): string[] {
  return text.match(AMOUNT) ?? []
}

function amountsHold(reply: string, answer: string, resolution: Resolution): boolean {
  const allowed = new Set(amountsIn(answer))
  if (amountsIn(reply).some((amount) => !allowed.has(amount))) return false

  return resolution.kind !== 'price' || reply.includes(pesos(totalOf(resolution.breakdown)))
}
