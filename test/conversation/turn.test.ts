import { describe, expect, test } from 'bun:test'
import { turn, type TurnDeps } from '@/conversation/turn'
import { conversationId, type Role, type TurnState, type UntrustedText } from '@/domain/types'
import type { InboundMessage } from '@/telegram/inbound'
import { baseConfig, catalogRows, OFFSET_1000, priceOf } from '@test/support/catalog'
import { totalOf } from '@/domain/breakdown'
import { pesos } from '@/domain/quote-text'
import { INTRODUCTION } from '@/conversation/prompt'
import { priceFor } from '@/domain/price-for'
import type { Resolution } from '@/domain/types'

function message(text: string, role: Role = 'customer'): InboundMessage {
  return {
    updateId: 1,
    conversationId: conversationId('telegram', '42', role),
    role,
    chatId: '42',
    senderId: '42',
    text: text as UntrustedText,
    mediaId: null,
    receivedAt: '2026-09-12T14:00:00.000Z',
  }
}

function state(overrides: Partial<TurnState> = {}): TurnState {
  return {
    conversationId: conversationId('telegram', '42', 'customer'),
    asked: [],
    escalated: false,
    introduced: true,
    ...overrides,
  }
}

function deps(overrides: Partial<TurnDeps> = {}): TurnDeps {
  return {
    rows: catalogRows,
    config: baseConfig,
    facts: [],
    extract: async () => ({ kind: 'other' }),
    write: async () => 'una respuesta',
    ...overrides,
  }
}

function priced(addOns: string[] = []): Extract<Resolution, { kind: 'price' }> {
  const resolution = priceFor(
    { kind: 'quote', family: 'business_cards', attributes: OFFSET_1000, size: null, addOns },
    catalogRows,
    baseConfig,
  )
  if (resolution.kind !== 'price') throw new Error(`the seed no longer prices 1000 offset cards: ${resolution.kind}`)

  return resolution
}

describe('an escalated conversation is over', () => {
  test('a new customer message produces no reply and calls no model', async () => {
    let calls = 0
    const result = await turn(
      deps({ extract: async () => { calls += 1; return { kind: 'other' } } }),
      message('hola, seguís ahí?'),
      state({ escalated: true }),
    )

    expect(result.reply).toBeNull()
    expect(result.state.escalated).toBe(true)
    expect(calls).toBe(0)
  })
})

describe('the writing model receives the computed amount', () => {
  const quote = {
    kind: 'quote',
    family: 'business_cards',
    attributes: OFFSET_1000,
    size: null,
    addOns: [],
    factKey: null,
  }

  const total = pesos(totalOf(priced().breakdown))

  test('the amount reaches the writer already formatted, and the reply carries it', async () => {
    let user = ''
    const result = await turn(
      deps({
        extract: async () => quote,
        write: async (request) => { user = request.user; return `Te cotizo ${total} final con IVA incluido.` },
      }),
      message('hola, cuánto 1000 tarjetas ilustración 350 4/1'),
      state(),
    )

    expect(user).toContain(total)
    expect(result.reply).toBe(`Te cotizo ${total} final con IVA incluido.`)
  })

  test('the writer sees the total, never the row prices it was built from', async () => {
    const withCut = { ...quote, addOns: ['extra_cut'] }
    const cut = priced(['extra_cut'])
    let user = ''

    await turn(
      deps({ extract: async () => withCut, write: async (request) => { user = request.user; return `Son ${pesos(totalOf(cut.breakdown))}.` } }),
      message('cuánto 1000 tarjetas con corte extra'),
      state(),
    )

    expect(user).toContain(pesos(totalOf(cut.breakdown)))
    expect(user).not.toContain(pesos(priceOf('bc_offset_1000_4_1')))
    expect(user).not.toContain(pesos(priceOf('bc_addon_extra_cut')))
    expect(user).not.toContain(String(baseConfig.family.vatRate))
  })

  test('a writer that states a different amount fails the turn and sends nothing', async () => {
    const result = await turn(
      deps({ extract: async () => quote, write: async () => 'Te cotizo $1.000 final con IVA incluido.' }),
      message('cuánto 1000 tarjetas'),
      state(),
    )

    expect(result.reply).toBeNull()
    expect(result.state.escalated).toBe(true)
  })

  test('a writer that adds a second amount next to the right one fails the turn', async () => {
    const result = await turn(
      deps({ extract: async () => quote, write: async () => `Te cotizo ${total}, o $9.000 sin IVA.` }),
      message('cuánto 1000 tarjetas'),
      state(),
    )

    expect(result.reply).toBeNull()
    expect(result.state.escalated).toBe(true)
  })

  test('a writer that drops the amount fails the turn', async () => {
    const result = await turn(
      deps({ extract: async () => quote, write: async () => 'Te paso el precio por privado.' }),
      message('cuánto 1000 tarjetas'),
      state(),
    )

    expect(result.reply).toBeNull()
    expect(result.state.escalated).toBe(true)
  })
})

describe('it introduces itself once', () => {
  async function systemOf(introduced: boolean): Promise<string> {
    let system = ''
    await turn(
      deps({ write: async (request) => { system = request.system; return 'te delego con un humano' } }),
      message('hola'),
      state({ introduced }),
    )

    return system
  }

  test('the first reply of a conversation is told to introduce itself', async () => {
    expect(await systemOf(false)).toContain(INTRODUCTION)
  })

  test('every reply after it is not', async () => {
    expect(await systemOf(true)).not.toContain(INTRODUCTION)
  })

  test('a sent reply is what marks the conversation introduced', async () => {
    const result = await turn(deps({ write: async () => 'te delego con un humano' }), message('hola'), state({ introduced: false }))

    expect(result.reply).not.toBeNull()
    expect(result.state.introduced).toBe(true)
  })

  test('a reply that was never sent leaves the conversation unintroduced', async () => {
    const result = await turn(deps({ write: async () => { throw new Error('openrouter 503') } }), message('hola'), state({ introduced: false }))

    expect(result.reply).toBeNull()
    expect(result.state.introduced).toBe(false)
  })
})
