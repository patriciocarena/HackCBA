import { totalOf } from '../domain/breakdown'
import { answerFromFacts, factsBlock, type Fact } from '../domain/facts'
import { priceFor, type CatalogRow, type PriceForConfig } from '../domain/price-for'
import { askText, pesos, quoteText } from '../domain/quote-text'
import {
  quoteIntentSchema,
  type FamilyContract,
  type Intent,
  type Resolution,
  type TurnState,
} from '../domain/types'
import { fence } from '../security/fence'
import type { InboundMessage } from '../telegram/inbound'
import { extractionSchema, EXTRACTION_SYSTEM, WRITING_SYSTEM, INTRODUCTION } from './prompt'

export type Extract = (request: { system: string; user: string; schema: object }) => Promise<unknown>

export type Write = (request: { system: string; user: string }) => Promise<string>

export type TurnDeps = {
  rows: CatalogRow[]
  config: PriceForConfig
  facts: Fact[]
  extract: Extract
  write: Write
}

export type TurnResult = {
  reply: string | null
  state: TurnState
}

export async function turn(
  deps: TurnDeps,
  message: InboundMessage,
  state: TurnState,
): Promise<TurnResult> {
  if (state.escalated) return { reply: null, state }
  if (message.role !== 'customer' || message.text === null) return { reply: null, state }

  const family = deps.config.family
  const fenced = fence(message.text, 'message')

  const resolution = await resolve(deps, family, fenced).catch(
    (): Resolution => ({ kind: 'escalate', reason: 'ambiguous', detail: DELEGATE }),
  )
  const settled = settle(resolution, state)
  const answer = answerOf(settled)

  const reply = await deps
    .write({ system: writingSystem(state), user: writingUser(deps, fenced, answer) })
    .catch(() => null)

  if (reply === null || !amountsHold(reply, answer, settled)) {
    return { reply: null, state: { ...state, escalated: true } }
  }

  return { reply, state: nextState(state, settled) }
}

const DELEGATE = 'te delego con un humano'

async function resolve(deps: TurnDeps, family: FamilyContract, fenced: string): Promise<Resolution> {
  const raw = await deps.extract({
    system: EXTRACTION_SYSTEM,
    user: fenced,
    schema: extractionSchema(family),
  })

  const intent = readIntent(raw, family)

  switch (intent.kind) {
    case 'quote':
      return priceFor(intent, deps.rows, deps.config)
    case 'fact':
      return answerFromFacts(intent.key, deps.facts)
    case 'admin_edit':
      return { kind: 'escalate', reason: 'not_authorized', detail: DELEGATE }
    case 'other':
      return { kind: 'escalate', reason: 'ambiguous', detail: DELEGATE }
  }
}

function readIntent(raw: unknown, family: FamilyContract): Intent {
  const answered = raw as Record<string, unknown>

  if (answered?.kind === 'fact') return { kind: 'fact', key: String(answered.factKey ?? '') }
  if (answered?.kind === 'admin_edit') return { kind: 'other' }
  if (answered?.kind !== 'quote') return { kind: 'other' }

  const parsed = quoteIntentSchema(family).safeParse({
    kind: 'quote',
    family: answered.family,
    attributes: stated(answered.attributes),
    size: answered.size,
    addOns: answered.addOns,
  })

  return parsed.success ? parsed.data : { kind: 'other' }
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

  return { kind: 'escalate', reason: 'missing_attribute', detail: DELEGATE }
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

function amountsIn(text: string): string[] {
  return text.match(AMOUNT) ?? []
}

function amountsHold(reply: string, answer: string, resolution: Resolution): boolean {
  const allowed = new Set(amountsIn(answer))
  if (amountsIn(reply).some((amount) => !allowed.has(amount))) return false

  return resolution.kind !== 'price' || reply.includes(pesos(totalOf(resolution.breakdown)))
}
