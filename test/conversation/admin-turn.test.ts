import { describe, expect, test } from 'bun:test'
import { adminTurn, ONLY_AUDIO, proposalText } from '@/conversation/admin-turn'
import type { ConfirmsPending } from '@/conversation/owner-confirm'
import type { Turn } from '@/telegram/inbound'
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
    familySlug: 'business_cards',
    operation: { op: 'percent', direction: 'raise', rate: 0.2 },
    lines: [
      { slug: 'bc_special_100_front', familySlug: 'business_cards', label: '100 tarjetas papel especial', oldPrice: ars(12100), newPrice: ars(14520) },
      { slug: 'bc_offset_1000_4_1', familySlug: 'business_cards', label: '1000 tarjetas ilustración', oldPrice: ars(45000), newPrice: ars(54000) },
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

function wired(heard: AudioRead | null, fallback: Turn = async () => {}, confirm?: ConfirmsPending) {
  const asked: { chatId: string; text: string; proposalId: string }[] = []
  const sent: { chatId: string; text: string }[] = []

  const turn = adminTurn({
    read: async () => heard,
    ask: async (chatId, text, proposalId) => void asked.push({ chatId, text, proposalId }),
    send: async (chatId, text) => void sent.push({ chatId, text }),
    fallback,
    ...(confirm === undefined ? {} : { confirm }),
  })

  return { turn, asked, sent }
}

function typed(text: string): InboundMessage {
  return { ...voiceNote(), text: fence(text, 'message'), media: null }
}

/**
 * The other half of ADR 0028. He types "confirmado" because there is nothing to press: a
 * deposit is agreed to against a bank statement Dante never sees, so there is no proposal to
 * read back and no button to mint from one.
 */
describe('the owner confirms a deposit by typing it', () => {
  test('a confirmation is answered here and never handed to the customer turn', async () => {
    let fellBack = 0
    const { turn, sent } = wired(
      { kind: 'not_voice' },
      async () => void (fellBack += 1),
      async () => 'Listo, confirmé la seña del pedido ord_1. Ya le avisé al cliente.',
    )

    await turn(typed('confirmado'))

    expect(fellBack).toBe(0)
    expect(sent).toEqual([{ chatId: OWNER, text: 'Listo, confirmé la seña del pedido ord_1. Ya le avisé al cliente.' }])
  })

  test('the order he names is the one passed on', async () => {
    const named: (string | undefined)[] = []
    const { turn } = wired({ kind: 'not_voice' }, async () => {}, async (_by, orderId) => {
      named.push(orderId)

      return 'ok'
    })

    await turn(typed('confirmado ord_7'))
    await turn(typed('confirmado'))

    expect(named).toEqual(['ord_7', undefined])
  })

  test('who pressed is who sent it, because the allowlist reads an id and not a word', async () => {
    const actors: unknown[] = []
    const { turn } = wired({ kind: 'not_voice' }, async () => {}, async (by) => {
      actors.push(by)

      return 'ok'
    })

    await turn(typed('confirmado'))

    expect(actors).toEqual([{ kind: 'person', id: OWNER }])
  })

  test('anything else he types is still the customer turn, so a price question is quoted', async () => {
    let fellBack = 0
    const { turn, sent } = wired({ kind: 'not_voice' }, async () => void (fellBack += 1), async () => 'never')

    await turn(typed('cuánto 1000 tarjetas?'))

    expect(fellBack).toBe(1)
    expect(sent).toEqual([])
  })

  test('with nothing wired to confirm, a confirmation is not swallowed', async () => {
    let fellBack = 0
    const { turn } = wired({ kind: 'not_voice' }, async () => void (fellBack += 1))

    await turn(typed('confirmado'))

    expect(fellBack).toBe(1)
  })
})

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

  test('hands the owner text to the customer turn, so asking a price answers him', async () => {
    const fell: string[] = []
    const wiring = wired({ kind: 'not_voice' }, async (message) => void fell.push(String(message.text)))
    const asking = { ...voiceNote(), media: null, text: fence('cuánto salen 1000 tarjetas?', 'message') }

    await wiring.turn(asking)

    expect(fell).toEqual([String(asking.text)])
    expect(wiring.sent).toBeEmpty()
    expect(wiring.asked).toBeEmpty()
  })

  test('asks for a voice note when the owner sends media it cannot transcribe', async () => {
    const fell: string[] = []
    const wiring = wired({ kind: 'not_voice' }, async (message) => void fell.push(String(message.text)))

    await wiring.turn({ ...voiceNote(), media: { kind: 'photo', id: 'photo-1' } })

    expect(wiring.sent).toMatchObject([{ chatId: OWNER, text: ONLY_AUDIO }])
    expect(fell).toBeEmpty()
  })

  test('says nothing at all about a message that is not an owner with a voice note', async () => {
    const wiring = wired(null)

    await wiring.turn({ ...voiceNote(), role: 'customer', media: null, text: fence('hola', 'message') })

    expect(wiring.asked).toBeEmpty()
    expect(wiring.sent).toBeEmpty()
  })
})
