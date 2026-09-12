import { describe, expect, test } from 'bun:test'
import { turn, type TurnDeps } from '@/conversation/turn'
import { conversationId, type Role, type TurnState, type UntrustedText } from '@/domain/types'
import type { InboundMessage } from '@/telegram/inbound'
import { baseConfig, catalogRows } from '@test/support/catalog'

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
