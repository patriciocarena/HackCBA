import { ars, scaleArs, type Ars } from '../domain/money'
import type { CatalogRow } from '../domain/price-for'
import type {
  EscalationReason,
  FamilyContract,
  PriceEditLine,
  PriceEditOperation,
  PriceEditProposal,
} from '../domain/types'
import type { PriceChange, PriceEditIntent } from './price-edit-intent'

export type SavePriceEdit = (proposal: PriceEditProposal) => Promise<void>

// ponytail: in memory, A3's price_edits table once a proposal has to outlive the process
export function inMemoryPriceEdits(): { proposals: PriceEditProposal[]; save: SavePriceEdit } {
  const proposals: PriceEditProposal[] = []

  return { proposals, save: async (proposal) => void proposals.push(proposal) }
}

export type Review = { reason: EscalationReason; detail: string }

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

  if (intent.kind === 'review') return { ok: false, review: { reason: intent.reason, detail: intent.detail } }

  if (!names(intent.target, family)) {
    return { ok: false, review: { reason: 'no_match', detail: `${intent.target} is not a family in the list` } }
  }

  const operation = operationOf(intent.change)
  if (operation === null) {
    return { ok: false, review: { reason: 'ambiguous', detail: 'the amount is not a whole number of pesos' } }
  }

  const lines = rows.filter((row) => row.kind === 'sale').map((row) => lineOf(row, operation))
  if (lines.length === 0) {
    return { ok: false, review: { reason: 'no_match', detail: `${intent.target} has no price to change` } }
  }

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

// ponytail: one family in the list, so a shared word is enough to say the owner meant it.
// Row level targeting, "subi las de 100", when the list has a second family.
function names(target: string, family: FamilyContract): boolean {
  const label = words(family.label)

  return words(target).some((word) => label.includes(word))
}

const WORD = /[a-z0-9]+/g
const SHORTEST_WORD = 4

function words(text: string): string[] {
  const plain = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

  return (plain.match(WORD) ?? []).filter((word) => word.length >= SHORTEST_WORD)
}

function operationOf(change: PriceChange): PriceEditOperation | null {
  if (change.kind === 'percent') {
    return { op: 'percent', direction: change.direction, rate: change.value / 100 }
  }

  if (!Number.isSafeInteger(change.amount) || change.amount < 0) return null

  return { op: 'absolute', amount: ars(change.amount) }
}

function lineOf(row: CatalogRow, operation: PriceEditOperation): PriceEditLine {
  return { slug: row.slug, label: row.label, oldPrice: row.price, newPrice: newPriceOf(row.price, operation) }
}

function newPriceOf(oldPrice: Ars, operation: PriceEditOperation): Ars {
  if (operation.op === 'absolute') return operation.amount

  return scaleArs(oldPrice, operation.direction === 'raise' ? 1 + operation.rate : 1 - operation.rate)
}
