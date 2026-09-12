import { describe, expect, test } from 'bun:test'
import { adminTurn, proposalText } from '@/conversation/admin-turn'
import { ars } from '@/domain/money'
import type { PriceEditProposal } from '@/domain/types'
import { conversationId } from '@/domain/types'
import { fence } from '@/security/fence'
import type { InboundMessage } from '@/telegram/inbound'
import type { AudioRead } from '@/voice/admin-audio'

const OWNER = '7'

function proposal(overrides: Partial<PriceEditProposal> = {}): PriceEditProposal {
  return {
    id: 'edit_1',
    operation: { op: 'percent', direction: 'raise', rate: 0.2 },
    lines: [
      { slug: 'bc_special_100_front', label: '100 tarjetas papel especial', oldPrice: ars(12100), newPrice: ars(14520) },
      { slug: 'bc_offset_1000_4_1', label: '1000 tarjetas ilustración', oldPrice: ars(45000), newPrice: ars(54000) },
    ],
    state: 'proposed',
    source: 'audio',
    mediaId: 'voice-1',
    proposedBy: OWNER,
    proposedAt: '2026-09-12T13:40:00.000Z',
    resolvedBy: null,
    resolvedAt: null,
    ...overrides,
  }
}

function voiceNote(): InboundMessage {
  return {
    updateId: 1,
    conversationId: conversationId('telegram', OWNER, 'admin'),
    role: 'admin',
    chatId: OWNER,
    senderId: OWNER,
    text: null,
    media: { kind: 'voice', id: 'voice-1' },
    receivedAt: '2026-09-12T13:40:00.000Z',
  }
}

function wired(heard: AudioRead | null) {
  const asked: { chatId: string; text: string; proposalId: string }[] = []
  const sent: { chatId: string; text: string }[] = []

  const turn = adminTurn({
    read: async () => heard,
    ask: async (chatId, text, proposalId) => void asked.push({ chatId, text, proposalId }),
    send: async (chatId, text) => void sent.push({ chatId, text }),
  })

  return { turn, asked, sent }
}

describe('the diff the owner is asked to agree to', () => {
  test('writes out the old and the new price of every line', () => {
    expect(proposalText(proposal())).toBe(
      [
        'Subo un 20%:',
        '100 tarjetas papel especial: $12.100 → $14.520',
        '1000 tarjetas ilustración: $45.000 → $54.000',
        '¿Lo aplico?',
      ].join('\n'),
    )
  })

  test('names the amount when the owner dictated one instead of a percentage', () => {
    const flat = proposal({ operation: { op: 'absolute', amount: ars(15000) } })

    expect(proposalText(flat)).toContain('Dejo estos precios en $15.000:')
  })

  test('carries every line, so a list the owner did not expect is visible before he agrees', () => {
    const text = proposalText(proposal())

    for (const entry of proposal().lines) {
      expect(text).toContain(entry.label)
    }
  })
})

describe('the admin turn', () => {
  test('asks the owner to confirm, carrying the id the button has to round-trip', async () => {
    const wiring = wired({ kind: 'proposed', proposal: proposal() })

    await wiring.turn(voiceNote())

    expect(wiring.asked).toHaveLength(1)
    expect(wiring.asked[0]).toMatchObject({ chatId: OWNER, proposalId: 'edit_1' })
    expect(wiring.asked[0]?.text).toContain('$12.100 → $14.520')
    expect(wiring.sent).toBeEmpty()
  })

  test('tells the owner why a note it could not act on produced nothing', async () => {
    const wiring = wired({ kind: 'review', review: { kind: 'review', reason: 'ambiguous', detail: 'no dijiste cuánto' } })

    await wiring.turn(voiceNote())

    expect(wiring.sent).toMatchObject([{ chatId: OWNER, text: 'no dijiste cuánto' }])
    expect(wiring.asked).toBeEmpty()
  })

  test('asks for the note again when the audio never arrived', async () => {
    const wiring = wired({ kind: 'failed', reason: 'no audio for voice-1' })

    await wiring.turn(voiceNote())

    expect(wiring.sent[0]?.text).toContain('Mandámelo de nuevo')
    expect(wiring.asked).toBeEmpty()
  })

  test('says nothing at all about a message that is not an owner with a voice note', async () => {
    const wiring = wired(null)

    await wiring.turn({ ...voiceNote(), role: 'customer', media: null, text: fence('hola', 'message') })

    expect(wiring.asked).toBeEmpty()
    expect(wiring.sent).toBeEmpty()
  })
})
