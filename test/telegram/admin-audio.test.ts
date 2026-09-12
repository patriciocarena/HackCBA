import { describe, expect, it } from 'bun:test'
import { adminAudioTurn, readAdminAudio } from '@/telegram/admin-audio'
import type { InboundMessage } from '@/telegram/inbound'
import { inMemoryPriceEdits } from '@/voice/price-edit-proposal'
import type { Extraction, PriceEditIntent } from '@/voice/price-edit-intent'
import type { Transcription } from '@/voice/transcription'
import type { UntrustedText } from '@/domain/types'
import { businessCards, catalogRows } from '@test/support/catalog'

const RAISE: PriceEditIntent = {
  kind: 'edit',
  target: 'las tarjetas',
  change: { kind: 'percent', direction: 'raise', value: 20 },
}

function message(fields: Partial<InboundMessage> = {}): InboundMessage {
  return {
    updateId: 70,
    conversationId: 'telegram:42:admin' as InboundMessage['conversationId'],
    role: 'admin',
    chatId: '42',
    senderId: '7',
    text: null,
    mediaId: 'voice-1',
    receivedAt: '2026-09-12T13:40:00.000Z',
    ...fields,
  }
}

function transcriber(result: Transcription = { ok: true, text: 'Subí las tarjetas un 20 %' }) {
  const heard: number[] = []

  return { heard, transcribe: async (audio: Uint8Array<ArrayBuffer>) => (heard.push(audio.byteLength), result) }
}

function extractor(result: Extraction = { ok: true, intent: RAISE }) {
  return { extract: async () => result }
}

function turnWith(overrides: Record<string, unknown> = {}) {
  const edits = inMemoryPriceEdits()
  const heard = transcriber()
  const deps = {
    rows: catalogRows,
    family: businessCards,
    transcription: heard,
    extraction: extractor(),
    fetchAudio: async () => new Uint8Array([1, 2, 3]) as Uint8Array<ArrayBuffer>,
    save: edits.save,
    ...overrides,
  }

  const typed = deps as Parameters<typeof adminAudioTurn>[0]

  return { edits, heard, turn: adminAudioTurn(typed), read: readAdminAudio(typed) }
}

describe('adminAudioTurn', () => {
  it('lands one proposed edit carrying the audio that caused it', async () => {
    const { edits, turn } = turnWith()

    await turn(message())

    expect(edits.proposals).toHaveLength(1)
    expect(edits.proposals[0]).toMatchObject({
      state: 'proposed',
      source: 'audio',
      mediaId: 'voice-1',
      proposedBy: '7',
      proposedAt: '2026-09-12T13:40:00.000Z',
    })
    expect(edits.proposals[0]?.lines[0]).toMatchObject({ oldPrice: 12100, newPrice: 14520 })
  })

  it('never lets a customer voice note reach the transcriber', async () => {
    const { edits, heard, turn } = turnWith()

    await turn(message({ role: 'customer', conversationId: 'telegram:42:customer' as InboundMessage['conversationId'] }))

    expect(heard.heard).toBeEmpty()
    expect(edits.proposals).toBeEmpty()
  })

  it('leaves a message with no audio alone, because this turn only reads audio', async () => {
    const { edits, heard, turn } = turnWith()

    await turn(message({ mediaId: null, text: 'subí las tarjetas un 20%' as UntrustedText }))

    expect(heard.heard).toBeEmpty()
    expect(edits.proposals).toBeEmpty()
  })

  it('writes nothing when the audio never arrives, and asks the transcriber nothing', async () => {
    const { edits, heard, turn } = turnWith({ fetchAudio: async () => null })

    await turn(message())

    expect(heard.heard).toBeEmpty()
    expect(edits.proposals).toBeEmpty()
  })

  it('writes nothing when transcription fails', async () => {
    const { edits, turn } = turnWith({ transcription: transcriber({ ok: false, reason: 'elevenlabs 401' }) })

    await turn(message())

    expect(edits.proposals).toBeEmpty()
  })

  it('writes nothing when the owner was vague, and nothing when the model never answered', async () => {
    const vague = turnWith({
      extraction: extractor({ ok: true, intent: { kind: 'review', reason: 'ambiguous', detail: 'un poco' } }),
    })
    const silent = turnWith({ extraction: extractor({ ok: false, reason: 'openrouter 503' }) })

    await vague.turn(message())
    await silent.turn(message())

    expect(vague.edits.proposals).toBeEmpty()
    expect(silent.edits.proposals).toBeEmpty()
  })
})

describe('readAdminAudio, on what it could not act on', () => {
  it('flags a vague amount for review, and says so rather than going quiet', async () => {
    const { read } = turnWith({
      extraction: extractor({ ok: true, intent: { kind: 'review', reason: 'ambiguous', detail: 'un poco' } }),
    })

    expect(await read(message())).toMatchObject({ kind: 'review', review: { reason: 'ambiguous', detail: 'un poco' } })
  })

  it('keeps a provider outage apart from the owner being vague', async () => {
    const { read } = turnWith({ transcription: transcriber({ ok: false, reason: 'elevenlabs 401' }) })

    expect(await read(message())).toMatchObject({ kind: 'failed', reason: 'elevenlabs 401' })
  })

  it('says nothing at all about a message that was never its business', async () => {
    const { read } = turnWith()

    expect(await read(message({ role: 'customer' }))).toBeNull()
  })
})
