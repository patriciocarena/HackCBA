import { type CatalogRow } from '../domain/price-for'
import type { FamilyContract, PriceEditProposal } from '../domain/types'
import type { FetchAudio } from '../telegram/audio-file'
import type { InboundMessage } from '../telegram/inbound'
import type { PriceEditExtractionPort } from './price-edit-intent'
import { proposePriceEdit, type Review, type SavePriceEdit } from './price-edit-proposal'
import type { TranscriptionPort } from './transcription'

export type AdminAudioDeps = {
  rows: CatalogRow[]
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

export function readAdminAudio(
  deps: AdminAudioDeps,
): (message: InboundMessage) => Promise<AudioRead | null> {
  const { rows, family, transcription, extraction, fetchAudio, save } = deps

  return async (message) => {
    if (message.role !== 'admin' || message.media?.kind !== 'voice') return null

    const audio = await fetchAudio(message.media.id)
    if (audio === null) return { kind: 'failed', reason: `no audio for ${message.media.id}` }

    const heard = await transcription.transcribe(audio)
    if (!heard.ok) return { kind: 'failed', reason: heard.reason }

    const extracted = await extraction.extract(heard.text)
    if (!extracted.ok) return { kind: 'failed', reason: extracted.reason }

    const proposal = proposePriceEdit({
      intent: extracted.intent,
      rows,
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
