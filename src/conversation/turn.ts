import { answerFromFacts, factsBlock, type Fact } from '../domain/facts'
import { DELEGATE, OUT_OF_CATALOG } from '../domain/handoff'
import { configFor } from '../catalog/families'
import { priceFor, type CatalogRow } from '../domain/price-for'
import { askText, quoteText } from '../domain/quote-text'
import {
  quoteIntentSchema,
  type EscalationReason,
  type AcceptIntent,
  type FactIntent,
  type FamilyContract,
  type OtherIntent,
  type QuoteIntent,
  type Resolution,
  type Role,
  type TurnState,
} from '../domain/types'
import { fence } from '../security/fence'
import type { InboundMessage } from '../telegram/inbound'
import { extractionSchema, ADMIN_INTRODUCTION_PROMPT, EXTRACTION_REASONS, EXTRACTION_SYSTEM, WRITING_SYSTEM, INTRODUCTION } from './prompt'
import { ADMIN_INTRODUCTION, NOT_LOADED, ONLY_AUDIO, WHAT_I_CAN_DO } from './admin-turn'
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
  // What this conversation has already asked, for the family it is now about. A message that
  // names a new family asks nothing twice, however many of the names repeat.
  const asked = askedFor(state, resolved)
  const settled = toldToTheOwner(settle(resolved.resolution, asked), message, state)
  const answer = answerOf(settled)

  // An instruct is Dante's own sentence, not an answer to be phrased. It is said as written,
  // because the writer would paraphrase the one wording the owner picked, and it spends no
  // model call, which is what a greeting on stage should cost.
  if (settled.kind === 'instruct') {
    return { reply: answer, resolution: settled, state: nextState(state, settled, resolved, asked) }
  }

  const reply = await deps
    .write({
      system: writingSystem(state, message.role),
      user: writingUser(deps, fenced, answer),
      thread: message.conversationId,
      resource: message.senderId,
    })
    .catch(() => null)

  // A writer that never answered owes the customer the one sentence that does not need it.
  if (reply === null) {
    return { reply: DELEGATE, resolution: escalate('ambiguous'), state: { ...state, escalated: ends(message) } }
  }

  // Whatever it wrote is what is sent. ADR 0010's guard used to read the reply first and refuse
  // it, and ADR 0027 says why it is gone: it answered a refusal with silence, and silence in
  // front of a customer is the one failure nobody in the shop can recover from.
  return { reply, resolution: settled, state: nextState(state, settled, resolved, asked) }
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
      const slug = intent.family ?? state.family
      // A new family is a new job. `quantity` and `sides` are declared by the cards family and
      // by folletos, and 500 and 1000 are values both carry, so the bag kept from the last
      // product answers this one's questions with the last one's job and the customer is
      // quoted a number they never said. An attribute is a property the family declares, so
      // what answers it is answered for that family and for no other.
      //
      // Only a switch clears it. A conversation that had no family yet is one that was asked
      // which product, and the quantity said in the same breath is still this job's.
      const attributes = { ...(switched(state.family, slug) ? {} : kept), ...intent.attributes }

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

/**
 * The owner is never handed to a person: he is the person.
 *
 * ADR 0011 closes a conversation on its first escalation so a customer who was told somebody
 * will answer stops talking to a bot that has stopped answering. Applied to the owner's chat it
 * takes down the only text channel the shop is run from, and it did: one "hola" extracted as
 * `other`, escalated, and every message after it got silence. His voice notes survived only
 * because `adminTurn` reads them before this turn ever runs.
 *
 * Converting here rather than at each `escalate` call is what makes it hold for all of them at
 * once: the greeting, a fact nobody loaded, a family the list does not carry, an attribute asked
 * twice, the five reasons extraction states, and the catch around `resolve`.
 */
function toldToTheOwner(resolution: Resolution, message: InboundMessage, state: TurnState): Resolution {
  if (message.role !== 'admin' || resolution.kind !== 'escalate') return resolution

  // One sentence for everything he cannot be answered, the way ADR 0012 gives the customer one.
  if (resolution.reason !== 'ambiguous') return { kind: 'instruct', text: NOT_LOADED }

  // The greeting answers a greeting. `introduced` lives in memory, so every deploy makes his
  // next message look like his first, and he typed "confirmado" after a restart and read the
  // whole introduction back. Both have to hold: the word, and the conversation not having
  // heard it yet.
  const greeted = !state.introduced && greets(message.text)

  return { kind: 'instruct', text: greeted ? ADMIN_INTRODUCTION : WHAT_I_CAN_DO }
}

/**
 * Whether the message is somebody saying hello and nothing more pressing. Read off the fenced
 * text, which is what the webhook hands over; the nonce is hex and carries no letters that
 * spell any of these.
 */
function greets(text: string | null): boolean {
  return text !== null && GREETING.test(text)
}

const GREETING = /(?:^|[^a-záéíóúñ])(hola|buenas|buen d[ií]a|buenas tardes|buenas noches|qu[eé] tal|c[oó]mo (and[aá]s|est[aá]s|va))(?![a-záéíóúñ])/i

/** Whether this message's escalation closes the conversation. ADR 0011, and who it is for. */
function ends(message: InboundMessage): boolean {
  return message.role !== 'admin'
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

/** True when the conversation was about one family and this message names another. */
function switched(was: string | null, now: string | null): boolean {
  return was !== null && now !== null && was !== now
}

/**
 * The names already asked, against the family the message settled on.
 *
 * `asked` is what makes a second ask an escalation, and that guard is about one family's quote:
 * "I asked you this and you did not answer". Carried across a switch, the first honest question
 * about the new product is the second time `sides` was asked, and ADR 0011 ends the
 * conversation on the customer's second product.
 */
function askedFor(state: TurnState, resolved: Resolved): string[] {
  return switched(state.family, resolved.family ?? state.family) ? [] : state.asked
}

function settle(resolution: Resolution, asked: string[]): Resolution {
  if (resolution.kind !== 'ask') return resolution
  if (!resolution.missing.some((name) => asked.includes(name))) return resolution

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
  asked: string[],
): TurnState {
  return {
    ...state,
    attributes: resolved.attributes,
    family: resolved.family ?? state.family,
    introduced: true,
    escalated: resolution.kind === 'escalate',
    asked: resolution.kind === 'ask' ? [...new Set([...asked, ...resolution.missing])] : asked,
  }
}

/**
 * The writer's rules, plus an introduction on the first message of a conversation and never
 * after it. Which introduction is the role's: the owner is not at the counter, and ADR 0026
 * covered only the sentences he reads instead of an escalation. A price question from him on
 * message one comes through here.
 */
function writingSystem(state: TurnState, role: Role): string {
  if (state.introduced) return WRITING_SYSTEM

  return `${WRITING_SYSTEM}\n\n${role === 'admin' ? ADMIN_INTRODUCTION_PROMPT : INTRODUCTION}`
}

function writingUser(deps: TurnDeps, fenced: string, answer: string): string {
  return [factsBlock(deps.facts), fenced, fence(answer, 'respuesta')].join('\n\n')
}

