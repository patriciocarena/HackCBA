import { confirmPriceEdit, type LoadProposal, type SaveProposal } from '../catalog/confirm-price-edit'
import type { LiveCatalog } from '../catalog/live-catalog'
import type { PriceVersion } from '../catalog/apply-edit'
import type { IsAdmin } from '../security/allowlist'
import type { OnCallback } from './callback'
import { appliedText, REFUSED, REJECTED, SETTLED } from './confirm-reply'
import type { AnswerCallback, Send } from './send'

export type RecordVersion = (version: PriceVersion) => Promise<void>

export type ConfirmCallbackDeps = {
  load: LoadProposal
  save: SaveProposal
  catalog: LiveCatalog
  record: RecordVersion
  isAdmin: IsAdmin
  answer: AnswerCallback
  send: Send
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
  const { load, save, catalog, record, isAdmin, answer, send, versionId, now } = deps

  // ponytail: in memory, and A3's table is where this belongs. confirmPriceEdit reads the
  // proposal and writes it back with no compare-and-set, so two taps on one keyboard both read
  // `proposed` and both succeed. Two update ids means seenUpdates cannot see it. Claiming the
  // id before the read is what makes one proposal settle once; the table makes it a transaction.
  const settling = new Set<string>()

  return async (callback) => {
    // A second press of a proposal this process already settled clears its own spinner and
    // says so. It must not reach confirmPriceEdit and must not send a second 'applied' for
    // one edit.
    if (settling.has(callback.proposalId)) {
      await told(() => answer(callback.callbackId, SETTLED))

      return
    }

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
      await told(() => answer(callback.callbackId, REFUSED[outcome.reason]))

      // A stranger gets the spinner cleared and nothing in their chat. Writing to them would
      // say the bot acted on their press, which is the one thing the refusal withholds.
      if (outcome.reason !== 'not_an_admin') {
        await told(() => send(callback.chatId, REFUSED[outcome.reason]))
      }

      return
    }

    if (outcome.decision === 'rejected') {
      await told(() => answer(callback.callbackId, REJECTED))
      await told(() => send(callback.chatId, REJECTED))

      return
    }

    catalog.swap(outcome.applied.rows)
    await record(outcome.applied.version)

    // The edit is live from here on. Telling the owner comes after, and a telling that fails
    // does not unwind it: the catalog moved, the version is recorded, and re-running this on
    // Telegram's retry would be a second edit rather than a second message.
    await told(() => answer(callback.callbackId, 'Aplicado'))
    await told(() => send(callback.chatId, appliedText(outcome.applied.proposal)))
  }
}

/**
 * ponytail: a send that fails is swallowed, because the only alternatives are worse. Throwing
 * makes the route answer Telegram with a 500, and Telegram retries a press whose edit has
 * already applied and whose claim now drops it silently, so the owner still hears nothing and
 * the retries never stop. There is no logger wired into this module; when one is, this is
 * where the failure gets reported.
 */
async function told(sending: () => Promise<void>): Promise<void> {
  await sending().catch(() => {})
}
