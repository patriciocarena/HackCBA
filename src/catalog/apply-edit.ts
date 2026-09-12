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
  id: string
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

  if (proposal.state !== 'proposed') {
    return { ok: false, reason: 'not_proposed' }
  }

  if (!Number.isFinite(new Date(input.now).getTime())) {
    return { ok: false, reason: 'not_a_time' }
  }

  const stale = proposal.lines.some((line) => {
    const row = rows.find((candidate) => candidate.slug === line.slug)

    return row === undefined || row.price !== line.oldPrice
  })

  if (stale) {
    return { ok: false, reason: 'stale' }
  }

  return {
    ok: true,
    applied: {
      proposal: { ...proposal, state: 'applied', resolvedBy: input.by.id, resolvedAt: input.now },
      version: {
        id: input.id,
        proposalId: proposal.id,
        appliedBy: input.by.id,
        appliedAt: input.now,
        mediaId: proposal.mediaId,
      },
      rows: rows.map((row) => repriced(row, proposal)),
    },
  }
}

function repriced(row: CatalogRow, proposal: PriceEditProposal): CatalogRow {
  const line = proposal.lines.find((candidate) => candidate.slug === row.slug)

  return line === undefined ? row : { ...row, price: line.newPrice }
}
