import { ars, isArs, scaleArs, type Ars } from '../domain/money'
import { amountOf, namesFamily, saleRows, type CatalogRow } from '../domain/price-for'
import type { Media } from '../telegram/update'
import type {
  EscalationReason,
  FamilyContract,
  PriceEditLine,
  PriceEditOperation,
  PriceEditProposal,
  PriceEditSource,
} from '../domain/types'
import { isActionable, MAX_PERCENT, type PriceChange, type PriceEditIntent } from './price-edit-intent'

export type SavePriceEdit = (proposal: PriceEditProposal) => Promise<void>

export type LoadPriceEdit = (id: string) => Promise<PriceEditProposal | null>

/** One store, so the end that mints a proposal and the end that reads it back share it. */
export type PriceEditStore = { save: SavePriceEdit; load: LoadPriceEdit }

// ponytail: in memory, A3's price_edits table once a proposal has to outlive the process.
// The table is also where the read and the write become one transaction; keyed on id here,
// a save replaces the proposal rather than appending a second row for the same edit.
export function inMemoryPriceEdits(): {
  proposals: PriceEditProposal[]
  save: SavePriceEdit
  load: LoadPriceEdit
} {
  const held = new Map<string, PriceEditProposal>()

  return {
    get proposals() {
      return [...held.values()]
    },
    save: async (proposal) => void held.set(proposal.id, proposal),
    load: async (id) => held.get(id) ?? null,
  }
}

export type Review = Extract<PriceEditIntent, { kind: 'review' }>

export type Proposal = { ok: true; proposal: PriceEditProposal } | { ok: false; review: Review }

type ProposeInput = {
  intent: PriceEditIntent
  rows: CatalogRow[]
  family: FamilyContract
  media: Media | null
  proposedBy: string
  proposedAt: string
}

export function proposePriceEdit(input: ProposeInput): Proposal {
  const { intent, rows, family, media, proposedBy, proposedAt } = input

  if (!isActionable(intent)) return { ok: false, review: intent }

  // C7 refuses not_a_time at apply time. Accepting here what it refuses there would store a
  // proposal nobody can ever apply.
  if (!Number.isFinite(new Date(proposedAt).getTime())) {
    return reviewed('ambiguous', `${proposedAt} is not a time`)
  }

  if (!namesFamily(intent.target, family)) {
    return reviewed('no_match', `${intent.target} is not a family in the list`)
  }

  const operation = operationOf(intent.change)
  if (operation === null) return reviewed('ambiguous', 'the amount is not a price this can propose')

  const lines = saleRows(rows).map((row) => lineOf(row, operation))
  if (lines.length === 0) return reviewed('no_match', `${intent.target} has no price to change`)

  return {
    ok: true,
    proposal: {
      id: crypto.randomUUID(),
      operation,
      lines,
      state: 'proposed',
      source: sourceOf(media),
      mediaId: media?.id ?? null,
      proposedBy,
      proposedAt,
      resolvedBy: null,
      resolvedAt: null,
    },
  }
}

// Media says how it arrived, PriceEditSource says what it is. A voice note is audio; the two
// vocabularies meet here and nowhere else.
function sourceOf(media: Media | null): PriceEditSource {
  if (media === null) return 'text'

  return media.kind === 'voice' ? 'audio' : 'photo'
}

function reviewed(reason: EscalationReason, detail: string): Proposal {
  return { ok: false, review: { kind: 'review', reason, detail } }
}

// The ceiling and the floor are also in the OpenRouter parser, which is one producer. This is
// the funnel every producer passes, and it is the last place before an amount becomes pesos.
function operationOf(change: PriceChange): PriceEditOperation | null {
  if (change.kind === 'percent') {
    if (change.value <= 0 || change.value > MAX_PERCENT) return null

    return { op: 'percent', direction: change.direction, rate: change.value / 100 }
  }

  if (!isArs(change.amount) || change.amount === 0) return null

  return { op: 'absolute', amount: ars(change.amount) }
}

function lineOf(row: CatalogRow, operation: PriceEditOperation): PriceEditLine {
  const oldPrice = amountOf(row)

  return { slug: row.slug, label: row.label, oldPrice, newPrice: newPriceOf(oldPrice, operation) }
}

function newPriceOf(oldPrice: Ars, operation: PriceEditOperation): Ars {
  if (operation.op === 'absolute') return operation.amount

  return scaleArs(oldPrice, operation.direction === 'raise' ? 1 + operation.rate : 1 - operation.rate)
}
