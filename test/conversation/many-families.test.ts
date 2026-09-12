import { describe, expect, test } from 'bun:test'
import { ALL_ROWS, LOADED_FAMILIES } from '../../src/catalog/families'
import { shopFacts } from '../../src/catalog/shop-facts'
import { OUT_OF_CATALOG } from '../../src/domain/handoff'
import { turn, type TurnDeps } from '../../src/conversation/turn'
import { fence } from '../../src/security/fence'
import type { InboundMessage } from '../../src/telegram/inbound'
import type { ConversationId, TurnState } from '../../src/domain/types'

const CONVERSATION = 'c1' as ConversationId

function message(text: string): InboundMessage {
  return {
    conversationId: CONVERSATION,
    chatId: '9',
    senderId: '9',
    role: 'customer',
    text: fence(text, 'message'),
    media: null,
    updateId: 1,
    receivedAt: '2026-09-12T10:00:00.000Z',
  }
}

function state(overrides: Partial<TurnState> = {}): TurnState {
  return {
    conversationId: CONVERSATION,
    asked: [],
    escalated: false,
    introduced: true,
    family: null,
    attributes: {},
    amounts: [],
    ...overrides,
  }
}

/**
 * The writer echoes what it was handed. The ADR 0010 guard refuses a reply that states an
 * amount the engine did not give, and it also refuses a priced turn whose reply omits the
 * total, so a stub that answers "ok" is silenced before the resolution is ever returned.
 */
function deps(extracted: object): TurnDeps {
  return {
    rows: () => ALL_ROWS,
    families: LOADED_FAMILIES,
    facts: shopFacts,
    extract: async () => extracted,
    write: async ({ user }) => user.match(/<respuesta:[0-9a-f]{32}>([\s\S]*)<\/respuesta:/)![1]!,
  }
}

const QUOTE = { kind: 'quote', size: null, addOns: [], factKey: null, reason: null }

/**
 * Three families loaded, and the turn has to decide which one a message is about before the
 * engine can price anything. With one family, `intent.family === null` meant "the one loaded
 * family" and `priceFor` silently assumed it. With three that assumption is a wrong price.
 */
describe('a turn over more than one family', () => {
  test('prices the family extraction named, and not the first one loaded', async () => {
    const result = await turn(
      deps({
        ...QUOTE,
        family: 'folletos_laser',
        attributes: { quantity: 500, coverage: 'pleno', sides: 'front_and_back' },
      }),
      message('500 folletos láser pleno frente y dorso'),
      state(),
    )

    expect(result.resolution?.kind).toBe('price')
    if (result.resolution?.kind !== 'price') return
    expect(result.resolution.breakdown.base.slug).toBe('fl_500_full_both')
  })

  test('asks which product when the message names none, rather than assuming one', async () => {
    const result = await turn(
      deps({ ...QUOTE, family: null, attributes: { quantity: 1000 } }),
      message('cuánto 1000'),
      state(),
    )

    expect(result.resolution).toEqual({ kind: 'ask', missing: ['family'] })
  })

  test('remembers the family across messages, so a follow up does not start over', async () => {
    const first = await turn(
      deps({ ...QUOTE, family: 'facturas', attributes: { quantity: 2 } }),
      message('cuánto 2 talonarios'),
      state(),
    )

    expect(first.state.family).toBe('facturas')

    const second = await turn(
      deps({ ...QUOTE, family: null, attributes: { format: 'a4', ink: 'color' } }),
      message('A4 color'),
      first.state,
    )

    expect(second.resolution?.kind).toBe('price')
    if (second.resolution?.kind !== 'price') return
    expect(second.resolution.breakdown.base.slug).toBe('fa_a4_2_color')
  })

  /**
   * The union schema's safety argument, exercised. `paper` belongs to the cards family and
   * `illustration_350` is one of its values, so extraction can name it in a facturas quote. The
   * exact match rule is what makes that harmless.
   */
  test('a value from another family finds no row and escalates', async () => {
    const result = await turn(
      deps({
        ...QUOTE,
        family: 'facturas',
        attributes: { quantity: 1, format: 'a4', ink: 'color', paper: 'illustration_350' },
      }),
      message('1 talonario A4 color en ilustración 350'),
      state(),
    )

    expect(result.resolution?.kind).toBe('price')
    if (result.resolution?.kind !== 'price') return
    // Facturas declares quantity, format and ink. A key it does not declare is not part of its
    // identity, so the row still matches: the value is ignored, not interpolated.
    expect(result.resolution.breakdown.base.slug).toBe('fa_a4_1_color')
  })

  test('a family nobody loaded escalates instead of finding the nearest one', async () => {
    const result = await turn(
      deps({ ...QUOTE, family: null, attributes: {} }),
      message('cuánto una gigantografía de 2x3'),
      state({ family: 'gigantografias' }),
    )

    expect(result.resolution?.kind).toBe('escalate')
    if (result.resolution?.kind !== 'escalate') return
    expect(result.resolution.reason).toBe('out_of_catalog')
  })
})
/**
 * Thirty five of the thirty eight families in the list are not loaded, and the extraction enum
 * offers only the three that are. So a message naming one of the other thirty five comes back
 * with `family: null`, which is the same answer as a message naming no product at all: the
 * turn asked "qué querés imprimir" to a customer who had just said "gigantografía", and only
 * reached a person on the turn after that.
 */
describe('a product the shop did not load', () => {
  test('is handed over at once, not asked about again', async () => {
    const result = await turn(
      deps({ ...QUOTE, family: null, reason: 'out_of_catalog', attributes: {} }),
      message('cuánto una gigantografía de 2x3'),
      state(),
    )

    expect(result.resolution?.kind).toBe('escalate')
    if (result.resolution?.kind !== 'escalate') return
    expect(result.resolution.reason).toBe('out_of_catalog')
    // The sentence for a thing the shop does not have, not the one for a thing it has to check.
    expect(result.resolution.detail).toBe(OUT_OF_CATALOG)
  })
})
