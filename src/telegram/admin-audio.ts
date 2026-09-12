import type { CatalogRow } from '../domain/price-for'
import type { FamilyContract, PriceEditProposal } from '../domain/types'
import type { PriceEditExtractionPort } from '../voice/price-edit-intent'
import { proposePriceEdit, type Review, type SavePriceEdit } from '../voice/price-edit-proposal'
import type { FetchLike, TranscriptionPort } from '../voice/transcription'
import type { InboundMessage, Turn } from './inbound'

export type FetchAudio = (mediaId: string) => Promise<Uint8Array<ArrayBuffer> | null>

export type AdminAudioDeps = {
  rows: CatalogRow[]
  family: FamilyContract
  transcription: TranscriptionPort
  extraction: PriceEditExtractionPort
  fetchAudio?: FetchAudio
  save: SavePriceEdit
}

// A review is the owner being vague and is worth telling him about. A failure is the
// provider being down and is not his fault. Collapsing them would report an outage as him
// mumbling, so they stay apart all the way out of here.
export type AudioRead =
  | { kind: 'proposed'; proposal: PriceEditProposal }
  | { kind: 'review'; review: Review }
  | { kind: 'failed'; reason: string }

export const noAudio: FetchAudio = async () => null

export function readAdminAudio(
  deps: AdminAudioDeps,
): (message: InboundMessage) => Promise<AudioRead | null> {
  const { rows, family, transcription, extraction, fetchAudio = noAudio, save } = deps

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
      mediaId: message.media.id,
      proposedBy: message.senderId,
      proposedAt: message.receivedAt,
    })
    if (!proposal.ok) return { kind: 'review', review: proposal.review }

    await save(proposal.proposal)

    return { kind: 'proposed', proposal: proposal.proposal }
  }
}

export function adminAudioTurn(deps: AdminAudioDeps): Turn {
  const read = readAdminAudio(deps)

  return async (message) => void (await read(message))
}

const API = 'https://api.telegram.org'

// Telegram chooses the path and we paste it into a URL carrying the bot token, so it is
// outside text like any other: one segment of word characters, and never a climb.
const FILE_PATH = /^[\w.-]+(\/[\w.-]+)*$/

function readable(path: unknown): path is string {
  return typeof path === 'string' && FILE_PATH.test(path) && !path.split('/').includes('..')
}

export function telegramAudio(token: string, fetchImpl: FetchLike = fetch): FetchAudio {
  return async (mediaId) => {
    try {
      const located = await fetchImpl(`${API}/bot${token}/getFile?file_id=${encodeURIComponent(mediaId)}`)
      if (!located.ok) return null

      const body = (await located.json()) as { ok?: boolean; result?: { file_path?: unknown } }
      const path = body.result?.file_path
      if (body.ok !== true || !readable(path)) return null

      const download = await fetchImpl(`${API}/file/bot${token}/${path}`)
      if (!download.ok) return null

      return new Uint8Array(await download.arrayBuffer())
    } catch {
      return null
    }
  }
}
