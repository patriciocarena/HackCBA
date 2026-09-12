import { ars, isArs, scaleArs, type Ars } from '../domain/money'
import { namesFamily, saleRows, type CatalogRow } from '../domain/price-for'
import type {
  EscalationReason,
  FamilyContract,
  PriceEditLine,
  PriceEditOperation,
  PriceEditProposal,
} from '../domain/types'
import { isActionable, type PriceChange, type PriceEditIntent } from './price-edit-intent'

export type SavePriceEdit = (proposal: PriceEditProposal) => Promise<void>

// ponytail: in memory, A3's price_edits table once a proposal has to outlive the process
export function inMemoryPriceEdits(): { proposals: PriceEditProposal[]; save: SavePriceEdit } {
  const proposals: PriceEditProposal[] = []

  return { proposals, save: async (proposal) => void proposals.push(proposal) }
}

export type Review = Extract<PriceEditIntent, { kind: 'review' }>

export type Proposal = { ok: true; proposal: PriceEditProposal } | { ok: false; review: Review }

export type ProposeInput = {
  intent: PriceEditIntent
  rows: CatalogRow[]
  family: FamilyContract
  mediaId: string | null
  proposedBy: string
  proposedAt: string
}

export function proposePriceEdit(input: ProposeInput): Proposal {
  const { intent, rows, family, mediaId, proposedBy, proposedAt } = input

  if (!isActionable(intent)) return { ok: false, review: intent }

  if (!namesFamily(intent.target, family)) {
    return reviewed('no_match', `${intent.target} is not a family in the list`)
  }

  const operation = operationOf(intent.change)
  if (operation === null) return reviewed('ambiguous', 'the amount is not a whole number of pesos')

  const lines = saleRows(rows).map((row) => lineOf(row, operation))
  if (lines.length === 0) return reviewed('no_match', `${intent.target} has no price to change`)

  return {
    ok: true,
    proposal: {
      id: crypto.randomUUID(),
      operation,
      lines,
      state: 'proposed',
      source: 'audio',
      mediaId,
      proposedBy,
      proposedAt,
      resolvedBy: null,
      resolvedAt: null,
    },
  }
}

function reviewed(reason: EscalationReason, detail: string): Proposal {
  return { ok: false, review: { kind: 'review', reason, detail } }
}

function operationOf(change: PriceChange): PriceEditOperation | null {
  if (change.kind === 'percent') {
    return { op: 'percent', direction: change.direction, rate: change.value / 100 }
  }

  if (!isArs(change.amount)) return null

  return { op: 'absolute', amount: ars(change.amount) }
}

function lineOf(row: CatalogRow, operation: PriceEditOperation): PriceEditLine {
  return { slug: row.slug, label: row.label, oldPrice: row.price, newPrice: newPriceOf(row.price, operation) }
}

function newPriceOf(oldPrice: Ars, operation: PriceEditOperation): Ars {
  if (operation.op === 'absolute') return operation.amount

  return scaleArs(oldPrice, operation.direction === 'raise' ? 1 + operation.rate : 1 - operation.rate)
}
