import { type CatalogRow } from '../domain/price-for'
import type { FamilyContract, PriceEditProposal } from '../domain/types'
import type { FetchAudio } from '../telegram/audio-file'
import type { InboundMessage } from '../telegram/inbound'
import type { PriceEditExtractionPort } from './price-edit-intent'
import { proposePriceEdit, type Review, type SavePriceEdit } from './price-edit-proposal'
import type { TranscriptionPort } from './transcription'

export type AdminAudioDeps = {
  // A getter, for the reason ADR 0017 gives. A proposal prices oldPrice against the catalog,
  // and applyPriceEdit refuses a line whose oldPrice no longer matches. Capturing the rows
  // here means the owner's second edit of the night is minted stale and refused on his press.
  rows: () => CatalogRow[]
  family: FamilyContract
  transcription: TranscriptionPort
  extraction: PriceEditExtractionPort
  fetchAudio: FetchAudio
  save: SavePriceEdit
}

export type AudioRead =
  | { kind: 'proposed'; proposal: PriceEditProposal }
  | { kind: 'review'; review: Review }
  | { kind: 'failed'; reason: string }
  // Null said both "not the owner" and "the owner, but not a voice note", so the owner's text
  // was dropped with the same silence as a stranger's. They are different messages: one is
  // nobody's business here, the other is a person waiting for an answer.
  | { kind: 'not_voice' }

export function readAdminAudio(
  deps: AdminAudioDeps,
): (message: InboundMessage) => Promise<AudioRead | null> {
  const { rows, family, transcription, extraction, fetchAudio, save } = deps

  return async (message) => {
    if (message.role !== 'admin') return null
    if (message.media?.kind !== 'voice') return { kind: 'not_voice' }

    const audio = await fetchAudio(message.media.id)
    if (audio === null) return { kind: 'failed', reason: `no audio for ${message.media.id}` }

    const heard = await transcription.transcribe(audio)
    if (!heard.ok) return { kind: 'failed', reason: heard.reason }

    const extracted = await extraction.extract(heard.text)
    if (!extracted.ok) return { kind: 'failed', reason: extracted.reason }

    const proposal = proposePriceEdit({
      intent: extracted.intent,
      rows: rows(),
      family,
      media: message.media,
      proposedBy: message.senderId,
      proposedAt: message.receivedAt,
    })
    if (!proposal.ok) return { kind: 'review', review: proposal.review }

    await save(proposal.proposal)

    return { kind: 'proposed', proposal: proposal.proposal }
  }
}
