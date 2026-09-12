import { confirmPriceEdit, type LoadProposal, type SaveProposal } from '../catalog/confirm-price-edit'
import type { LiveCatalog } from '../catalog/live-catalog'
import type { PriceVersion } from '../catalog/apply-edit'
import type { IsAdmin } from '../security/allowlist'
import type { OnCallback } from './callback'

export type RecordVersion = (version: PriceVersion) => Promise<void>

export type ConfirmCallbackDeps = {
  load: LoadProposal
  save: SaveProposal
  catalog: LiveCatalog
  record: RecordVersion
  isAdmin: IsAdmin
  versionId: () => string
  now: () => string
}

/**
 * The owner's yes, turned into a repriced catalog. The callback carries two opaque strings and
 * everything else is read here: the proposal from the store, the rows from the live catalog.
 * A price sent through the button would reopen exactly what confirmPriceEdit closes, and a
 * caller-supplied row set would let a fabricated oldPrice make a stale edit apply.
 */
export function confirmCallback(deps: ConfirmCallbackDeps): OnCallback {
  const { load, save, catalog, record, isAdmin, versionId, now } = deps

  // ponytail: in memory, and A3's table is where this belongs. confirmPriceEdit reads the
  // proposal and writes it back with no compare-and-set, so two taps on one keyboard both read
  // `proposed` and both succeed. Two update ids means seenUpdates cannot see it. Claiming the
  // id before the read is what makes one proposal settle once; the table makes it a transaction.
  const settling = new Set<string>()

  return async (callback) => {
    if (settling.has(callback.proposalId)) return
    settling.add(callback.proposalId)

    const outcome = await confirmPriceEdit(
      {
        proposalId: callback.proposalId,
        versionId: versionId(),
        senderId: callback.senderId,
        accepted: callback.accepted,
        now: now(),
      },
      { load, save, rows: catalog.rows(), isAdmin },
    )

    // A refusal settles nothing, so the claim is given back. Leaving it would let one tap from
    // someone outside the allowlist lock the owner out of his own proposal.
    if (!outcome.ok) {
      settling.delete(callback.proposalId)
      return
    }

    if (outcome.decision === 'rejected') return

    catalog.swap(outcome.applied.rows)
    await record(outcome.applied.version)
  }
}
