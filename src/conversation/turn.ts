import { totalOf } from '../domain/breakdown'
import { answerFromFacts, factsBlock, type Fact } from '../domain/facts'
import { priceFor, type CatalogRow, type PriceForConfig } from '../domain/price-for'
import { askText, pesos, quoteText } from '../domain/quote-text'
import {
  quoteIntentSchema,
  type EscalationReason,
  type AcceptIntent,
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
import { depositText, type Sale } from './sale'

export type Extract = (request: { system: string; user: string; schema: object }) => Promise<unknown>

export type Write = (request: { system: string; user: string }) => Promise<string>

export type TurnDeps = {
  // A getter, not an array. Capturing the catalog once at boot is what makes a confirmed
  // price edit invisible: applyPriceEdit builds a new array and the captured reference goes
  // on quoting the old prices. See ADR 0017.
  rows: () => CatalogRow[]
  config: PriceForConfig
  facts: Fact[]
  extract: Extract
  write: Write
  /** Absent means no acceptance can be taken, which is the state before E6 is wired. */
  sale?: Sale
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

  const resolution = await resolve(deps, message, fenced).catch((): Resolution => escalate('ambiguous'))
  const settled = settle(resolution, state)
  const answer = answerOf(settled)

  const reply = await deps
    .write({ system: writingSystem(state), user: writingUser(deps, fenced, answer) })
    .catch(() => null)

  // A writer that never answered owes the customer the one sentence that does not need it.
  // A writer that answered with an amount it was not given is told nothing back, because
  // anything said after that would be a second chance to state the wrong number.
  if (reply === null) {
    return { reply: DELEGATE, resolution: escalate('ambiguous'), state: { ...state, escalated: true } }
  }

  if (!amountsHold(reply, answer, fenced, settled)) return silence({ ...state, escalated: true })

  return { reply, resolution: settled, state: nextState(state, settled) }
}

function silence(state: TurnState): TurnResult {
  return { reply: null, resolution: null, state }
}

const DELEGATE = 'te delego con un humano'

async function resolve(deps: TurnDeps, message: InboundMessage, fenced: string): Promise<Resolution> {
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
    case 'quote': {
      // C10's getter, so a quote reads the catalog as it is now and not as it was at boot.
      const priced = priceFor(intent, deps.rows(), deps.config)
      // Held before it is said, so the quote the customer may accept is the one they read.
      deps.sale?.hold(message.conversationId, priced)

      return priced
    }
    case 'fact':
      return answerFromFacts(intent.key, deps.facts)
    case 'accept':
      return deps.sale === undefined
        ? escalate('ambiguous')
        : deps.sale.accept(message.conversationId, { kind: 'person', id: message.senderId })
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
): QuoteIntent | FactIntent | AcceptIntent | OtherIntent | null {
  const answered = raw as Record<string, unknown>

  if (answerKind(raw) === 'fact') return { kind: 'fact', key: String(answered.factKey ?? '') }
  if (answerKind(raw) === 'accept') return { kind: 'accept' }
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
    case 'accepted':
      return depositText(resolution)
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

const AMOUNT = /\$\s*[\d.,]*\d/g
const NUMBER = /\d[\d.,]*/g
const DELIMITER = /<\/?[a-z][a-z0-9_]*:[0-9a-f]{32}>/g

/**
 * A number wearing a currency, whichever side the currency sits on. `$` was the only marker the
 * guard knew, and ADR 0010 named the two that got past it, `37190 pesos` and `ARS 30.000`, then
 * left them to the floor to catch. The floor is gone, and these are now read as amounts.
 */
const CURRENCY = /(?:\$|\bARS\b)\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(?:pesos?\b|ARS\b)/gi

export function amountsIn(text: string): string[] {
  return text.match(AMOUNT) ?? []
}

/** Every amount in the text, as a bare run of digits, so `$37.190` and `37190 pesos` are one. */
function currencyIn(text: string): string[] {
  return [...text.matchAll(CURRENCY)].map((match) => plain(match[1] ?? match[2] ?? ''))
}

function plain(run: string): string {
  return run.replace(/[.,]/g, '')
}

/** Every number as the guard compares them, so `37.190` and `37190` are one value. */
function numbersIn(text: string): string[] {
  return (text.match(NUMBER) ?? []).map(plain)
}

/** The customer's words without the fence around them: a nonce is hex and hex carries digits. */
function said(fenced: string): string {
  return fenced.replace(DELIMITER, '')
}

/**
 * A reply may stand only on numbers it was given, and only the engine may hand it a price.
 *
 * Two rules, because the two failures are different. An amount is a claim about what the shop
 * charges, so it has to come from the answer and from nowhere else: the customer's own message is
 * not a source of prices, however they phrase it, because the message is also the one channel an
 * attacker writes. A plain number is not a claim about money, so a reply may repeat the quantity
 * or the paper weight the customer asked for.
 *
 * The floor is gone. It exempted every number under 1000 from the second rule, which is every
 * number a quote actually states except the price: the validity window, the module count, the
 * discount rate. A reply promising ninety days on a fifteen day quote passed, and the shop is
 * held to what it says.
 */
function amountsHold(reply: string, answer: string, fenced: string, resolution: Resolution): boolean {
  const quoted = new Set(currencyIn(answer))
  if (currencyIn(reply).some((amount) => !quoted.has(amount))) return false

  const given = new Set([...numbersIn(answer), ...numbersIn(said(fenced))])
  if (numbersIn(reply).some((number) => !given.has(number))) return false

  return resolution.kind !== 'price' || reply.includes(pesos(totalOf(resolution.breakdown)))
}
