import { totalOf } from '../domain/breakdown'
import { answerFromFacts, factsBlock, type Fact } from '../domain/facts'
import { DELEGATE, OUT_OF_CATALOG } from '../domain/handoff'
import { configFor } from '../catalog/families'
import { priceFor, type CatalogRow } from '../domain/price-for'
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
import { ONLY_AUDIO } from './admin-turn'
import { depositText, type Sale } from './sale'

export type Extract = (request: { system: string; user: string; schema: object }) => Promise<unknown>

/**
 * `thread` and `resource` are what a memory needs to know whose conversation this is: the
 * conversation id, and the person behind the chat. The raw model port ignores both; the agent
 * that carries Observational Memory throws without a thread.
 */
export type Write = (request: {
  system: string
  user: string
  thread: string
  resource: string
}) => Promise<string>

export type TurnDeps = {
  // A getter, not an array. Capturing the catalog once at boot is what makes a confirmed
  // price edit invisible: applyPriceEdit builds a new array and the captured reference goes
  // on quoting the old prices. See ADR 0017.
  rows: () => CatalogRow[]
  /**
   * Every family loaded, in the order extraction offers them. The turn picks one per message
   * rather than being wired to one: with a single family `intent.family === null` meant "the one
   * loaded family" and `priceFor` assumed it, which with three families is a wrong price.
   */
  families: readonly FamilyContract[]
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

  // A voice note or a photo arrives with no text, so there is nothing for extraction to read
  // and the turn used to answer it with silence. Escalating is rule 3: what Dante cannot read
  // it does not know, and not knowing it means handing the conversation over. Neither model is
  // called, which is rule 5 for a customer's audio, and the sentence is a constant so nothing
  // can restate it. It introduces itself because an escalation on the first message never
  // reaches INTRODUCTION.
  if (message.text === null) {
    return {
      reply: NO_MEDIA,
      resolution: escalate('unsupported_media'),
      state: { ...state, escalated: true },
    }
  }

  // The webhook fenced it on the way in, which is what UntrustedText brands. Fencing a
  // second time nests one nonce inside another and tells the model nothing it did not know.
  const fenced = message.text

  const resolved = await resolve(deps, message, fenced, state).catch(
    (): Resolved => ({ resolution: escalate('ambiguous'), attributes: state.attributes, family: state.family }),
  )
  const settled = settle(resolved.resolution, state)
  const answer = answerOf(settled)

  const reply = await deps
    .write({
      system: writingSystem(state),
      user: writingUser(deps, fenced, answer),
      thread: message.conversationId,
      resource: message.senderId,
    })
    .catch(() => null)

  // A writer that never answered owes the customer the one sentence that does not need it.
  // A writer that answered with an amount it was not given is told nothing back, because
  // anything said after that would be a second chance to state the wrong number.
  if (reply === null) {
    return { reply: DELEGATE, resolution: escalate('ambiguous'), state: { ...state, escalated: true } }
  }

  if (!amountsHold(reply, answer, fenced, settled, state.amounts, resolved.attributes)) {
    return silence({ ...state, escalated: true })
  }

  return { reply, resolution: settled, state: nextState(state, settled, resolved, answer) }
}

function silence(state: TurnState): TurnResult {
  return { reply: null, resolution: null, state }
}

export const NO_MEDIA =
  'Soy Dante, asesoro y tomo los pedidos de Multimpresos. Todavía no puedo escuchar audios ni mirar imágenes: esto lo miramos en el local y te contestamos en un rato.'

/** The resolution, and what the conversation knows once this message has been read. */
type Resolved = {
  resolution: Resolution
  attributes: Record<string, string | number>
  /** Which family this message settled on, carried forward so a follow up need not name it. */
  family?: string | null
}

async function resolve(
  deps: TurnDeps,
  message: InboundMessage,
  fenced: string,
  state: TurnState,
): Promise<Resolved> {
  const raw = await deps.extract({
    system: EXTRACTION_SYSTEM,
    user: fenced,
    // The loaded keys, so extraction names a fact the shop has rather than guessing the word
    // for one. A key it cannot name is a fact it cannot claim was asked for. One schema over
    // every family, so one model call decides the family and the attributes together.
    schema: extractionSchema(deps.families, deps.facts.map((fact) => fact.key)),
  })

  // A reason outranks the kind. Extraction naming one means it recognised something the
  // engine must not answer, and a quote filled in beside it is a quote nobody may be given.
  const kept = state.attributes
  const only = (resolution: Resolution): Resolved => ({ resolution, attributes: kept, family: state.family })

  const stated = statedReason(raw)
  // The sentence follows the reason: a product the shop does not print is not something it
  // will go and check. ADR 0012 keeps one sentence per reason, and this is that mapping.
  if (stated !== null) {
    return only(stated === 'out_of_catalog' ? escalate(stated, OUT_OF_CATALOG) : escalate(stated))
  }

  // The role decides what a person may change, never whether they are answered. A customer
  // asking for a price change is refused; the owner asking for one by text is pointed at the
  // audio, because escalating him would end the conversation he tests the shop from.
  if (answerKind(raw) === 'admin_edit') {
    return only(message.role === 'admin' ? { kind: 'instruct', text: ONLY_AUDIO } : escalate('not_authorized'))
  }

  const intent = readIntent(raw, deps.families)
  if (intent === null) return only(escalate('unsupported_option'))

  switch (intent.kind) {
    case 'quote': {
      // What this message said, on top of what the conversation already knew. The customer
      // answering one question must not unsay the three answers they gave before it. The family
      // is remembered the same way: "A4 color" after "cuánto 2 talonarios" names no family, and
      // asking which product again is the loop a conversation dies of.
      const attributes = { ...kept, ...intent.attributes }
      const slug = intent.family ?? state.family

      // A message that names no family, in a conversation that has not named one either. With
      // one family this was an assumption the engine made silently. With three it is a question.
      if (slug === null) return { resolution: { kind: 'ask', missing: ['family'] }, attributes, family: null }

      const config = configFor(slug)
      if (config === undefined) {
        return { resolution: escalate('out_of_catalog', OUT_OF_CATALOG), attributes, family: slug }
      }

      // C10's getter, so a quote reads the catalog as it is now and not as it was at boot.
      const priced = priceFor({ ...intent, family: slug, attributes }, deps.rows(), config)
      // Held before it is said, so the quote the customer may accept is the one they read.
      deps.sale?.hold(message.conversationId, priced)

      return { resolution: priced, attributes, family: slug }
    }
    case 'fact':
      return only(answerFromFacts(intent.key, deps.facts))
    case 'accept':
      return only(
        deps.sale === undefined
          ? escalate('ambiguous')
          : deps.sale.accept(message.conversationId, { kind: 'person', id: message.senderId }),
      )
    case 'other':
      return only(escalate('ambiguous'))
  }
}

function escalate(reason: EscalationReason, detail: string = DELEGATE): Resolution {
  return { kind: 'escalate', reason, detail }
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
  families: readonly FamilyContract[],
): QuoteIntent | FactIntent | AcceptIntent | OtherIntent | null {
  const answered = raw as Record<string, unknown>

  if (answerKind(raw) === 'fact') return { kind: 'fact', key: String(answered.factKey ?? '') }
  if (answerKind(raw) === 'accept') return { kind: 'accept' }
  if (answerKind(raw) !== 'quote') return { kind: 'other' }

  const parsed = quoteIntentSchema(families).safeParse({
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
    case 'instruct':
      return resolution.text
  }
}

function nextState(
  state: TurnState,
  resolution: Resolution,
  resolved: Resolved,
  answer: string,
): TurnState {
  return {
    ...state,
    attributes: resolved.attributes,
    family: resolved.family ?? state.family,
    amounts: [...new Set([...state.amounts, ...amountsIn(answer)])],
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

// ponytail: the floor is what keeps a quantity from reading as a price. The cheapest row in
// the catalog is 12100, so nothing a customer is charged can hide under it. Drop the floor and
// compare against the catalog's own minimum when a row goes cheaper than this.
const FLOOR = 1000

export function amountsIn(text: string): string[] {
  return text.match(AMOUNT) ?? []
}

/** Every number as the guard compares them, so `37.190` and `37190` are one value. */
function numbersIn(text: string): string[] {
  return (text.match(NUMBER) ?? []).map((run) => run.replace(/[.,]/g, ''))
}

/** The customer's words without the fence around them: a nonce is hex and hex carries digits. */
function said(fenced: string): string {
  return fenced.replace(DELIMITER, '')
}

/**
 * A reply may stand only on numbers it was given. A pesos sign is the shape a price usually
 * has, and the prompt cannot stop a model writing `37190 pesos` or `ARS 30.000` instead, so
 * every number above the floor has to come from the answer or from the customer's own message.
 */
function amountsHold(
  reply: string,
  answer: string,
  fenced: string,
  resolution: Resolution,
  earlier: string[],
  stated: Record<string, string | number>,
): boolean {
  // A pesos sign may only ever come from the engine: this turn's answer, or an amount it
  // already gave this conversation. Nothing the customer said widens this set.
  const shaped = new Set([...amountsIn(answer), ...earlier])
  if (amountsIn(reply).some((amount) => !shaped.has(amount))) return false

  // A bare number may also be one the customer stated themselves. `quantity: 1000` sits on the
  // floor, so once the writer has a memory it says "las 1000 tarjetas" in a turn whose message
  // never repeats the number, and without this the reply is refused and the customer hears
  // nothing. An attribute is the customer's own word, read under a strict schema, and repeating
  // it invents no price.
  const given = new Set([
    ...numbersIn(answer),
    ...numbersIn(said(fenced)),
    ...numbersIn(earlier.join(' ')),
    ...numbersIn(Object.values(stated).join(' ')),
  ])
  if (numbersIn(reply).some((number) => Number(number) >= FLOOR && !given.has(number))) return false

  return resolution.kind !== 'price' || reply.includes(pesos(totalOf(resolution.breakdown)))
}
