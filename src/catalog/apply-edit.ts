import type { Actor } from '../domain/order'
import type { CatalogRow } from '../domain/price-for'
import type { PriceEditProposal } from '../domain/types'

export type PriceVersion = {
  id: string
  proposalId: string
  appliedBy: string
  appliedAt: string
  mediaId: string | null
}

export type Applied = {
  proposal: PriceEditProposal
  version: PriceVersion
  rows: CatalogRow[]
}

export type ApplyRefusal = 'not_a_person' | 'not_proposed' | 'not_a_time' | 'stale'

export type ApplyOutcome = { ok: true; applied: Applied } | { ok: false; reason: ApplyRefusal }

export type ApplyInput = {
  by: Actor
  now: string
}

export function applyPriceEdit(
  proposal: PriceEditProposal,
  rows: CatalogRow[],
  input: ApplyInput,
): ApplyOutcome {
  if (input.by.kind !== 'person') {
    return { ok: false, reason: 'not_a_person' }
  }

  return {
    ok: true,
    applied: {
      proposal: { ...proposal, state: 'applied', resolvedBy: input.by.id, resolvedAt: input.now },
      version: {
        id: crypto.randomUUID(),
        proposalId: proposal.id,
        appliedBy: input.by.id,
        appliedAt: input.now,
        mediaId: proposal.mediaId,
      },
      rows,
    },
  }
}
