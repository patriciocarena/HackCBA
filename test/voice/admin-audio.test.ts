import { describe, expect, it } from 'bun:test'
import { readAdminAudio, type AdminAudioDeps } from '@/voice/admin-audio'
import { conversationId, type UntrustedText } from '@/domain/types'
import type { InboundMessage } from '@/telegram/inbound'
import { inMemoryPriceEdits } from '@/voice/price-edit-proposal'
import type { Extraction, PriceEditExtractionPort, PriceEditIntent } from '@/voice/price-edit-intent'
import type { Transcription, TranscriptionPort } from '@/voice/transcription'
import { businessCards, catalogRows } from '@/catalog/business-cards'
import type { CatalogRow } from '@/domain/price-for'

const RAISE: PriceEditIntent = {
  kind: 'edit',
  target: 'las tarjetas',
  change: { kind: 'percent', direction: 'raise', value: 20 },
}

function message(fields: Partial<InboundMessage> = {}): InboundMessage {
  return {
    updateId: 70,
    conversationId: conversationId('telegram', '42', 'admin'),
    role: 'admin',
    chatId: '42',
    senderId: '7',
    text: null,
    media: { kind: 'voice', id: 'voice-1' },
    receivedAt: '2026-09-12T13:40:00.000Z',
    ...fields,
  }
}

function transcriber(result: Transcription = { ok: true, text: 'Subí las tarjetas un 20 %' }) {
  const heard: number[] = []
  const port: TranscriptionPort = { transcribe: async (audio) => (heard.push(audio.byteLength), result) }

  return { heard, port }
}

function extractor(result: Extraction = { ok: true, intent: RAISE }): PriceEditExtractionPort {
  return { extract: async () => result }
}

function readerWith(overrides: Partial<AdminAudioDeps> = {}) {
  const edits = inMemoryPriceEdits()
  const heard = transcriber()
  const read = readAdminAudio({
    rows: catalogRows,
    family: businessCards,
    transcription: heard.port,
    extraction: extractor(),
    fetchAudio: async () => new Uint8Array([1, 2, 3]) as Uint8Array<ArrayBuffer>,
    save: edits.save,
    ...overrides,
  })

  return { edits, heard, read }
}

describe('readAdminAudio, on an owner who dictated an edit', () => {
  it('lands one proposed edit carrying the audio that caused it', async () => {
    const { edits, read } = readerWith()

    const outcome = await read(message())

    expect(outcome).toMatchObject({ kind: 'proposed' })
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
})

function watched(rows: CatalogRow[]) {
  const writes: string[] = []
  const record = (_target: CatalogRow, key: string | symbol) => {
    writes.push(String(key))
    return true
  }

  return {
    writes,
    rows: rows.map(
      (row) => new Proxy(row, { set: record, deleteProperty: record, defineProperty: record }) as CatalogRow,
    ),
  }
}

describe('readAdminAudio, against the list it reads', () => {
  it('changes no price, on the path the ticket names', async () => {
    const guarded = watched(catalogRows)
    const before = structuredClone(catalogRows)
    const { edits, read } = readerWith({ rows: guarded.rows })

    const outcome = await read(message())

    expect(outcome).toMatchObject({ kind: 'proposed' })
    expect(edits.proposals).toHaveLength(1)
    expect(guarded.writes).toBeEmpty()
    expect(catalogRows).toEqual(before)
  })
})

describe('readAdminAudio, on a message that was never its business', () => {
  it('never lets a customer voice note reach the transcriber', async () => {
    const { edits, heard, read } = readerWith()

    const outcome = await read(message({ role: 'customer', conversationId: conversationId('telegram', '42', 'customer') }))

    expect(outcome).toBeNull()
    expect(heard.heard).toBeEmpty()
    expect(edits.proposals).toBeEmpty()
  })

  it('leaves text and photos alone, because only one kind of media can be transcribed', async () => {
    const { heard, read } = readerWith()

    const text = await read(message({ media: null, text: 'subí las tarjetas un 20%' as UntrustedText }))
    const photo = await read(message({ media: { kind: 'photo', id: 'photo-1' } }))

    expect([text, photo]).toEqual([null, null])
    expect(heard.heard).toBeEmpty()
  })
})

describe('readAdminAudio, on what it could not act on', () => {
  it('flags a vague amount for review, and writes nothing', async () => {
    const { edits, read } = readerWith({
      extraction: extractor({ ok: true, intent: { kind: 'review', reason: 'ambiguous', detail: 'un poco' } }),
    })

    expect(await read(message())).toMatchObject({ kind: 'review', review: { reason: 'ambiguous', detail: 'un poco' } })
    expect(edits.proposals).toBeEmpty()
  })

  it('keeps a provider outage apart from the owner being vague, and writes nothing for either', async () => {
    const silent = readerWith({ transcription: transcriber({ ok: false, reason: 'elevenlabs 401' }).port })
    const refused = readerWith({ extraction: extractor({ ok: false, reason: 'openrouter 503' }) })

    expect(await silent.read(message())).toMatchObject({ kind: 'failed', reason: 'elevenlabs 401' })
    expect(await refused.read(message())).toMatchObject({ kind: 'failed', reason: 'openrouter 503' })
    expect(silent.edits.proposals).toBeEmpty()
    expect(refused.edits.proposals).toBeEmpty()
  })

  it('asks the transcriber nothing when the audio never arrives', async () => {
    const { edits, heard, read } = readerWith({ fetchAudio: async () => null })

    expect(await read(message())).toMatchObject({ kind: 'failed' })
    expect(heard.heard).toBeEmpty()
    expect(edits.proposals).toBeEmpty()
  })
})
