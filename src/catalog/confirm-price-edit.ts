import type { Actor } from '../domain/order'
import type { CatalogRow } from '../domain/price-for'
import type { PriceEditProposal } from '../domain/types'
import type { IsAdmin } from '../security/allowlist'
import { applyPriceEdit, type Applied, type ApplyRefusal } from './apply-edit'

export type LoadProposal = (id: string) => Promise<PriceEditProposal | null>

export type SaveProposal = (proposal: PriceEditProposal) => Promise<void>

export type ConfirmDeps = {
  load: LoadProposal
  save: SaveProposal
  rows: CatalogRow[]
  isAdmin?: IsAdmin
}

export type ConfirmInput = {
  proposalId: string
  versionId: string
  senderId: string
  accepted: boolean
  now: string
}

export type ConfirmRefusal = 'not_an_admin' | 'unknown_proposal' | ApplyRefusal

export type ConfirmOutcome =
  | { ok: true; decision: 'applied'; applied: Applied }
  | { ok: true; decision: 'rejected'; rejected: PriceEditProposal }
  | { ok: false; reason: ConfirmRefusal }

export async function confirmPriceEdit(
  input: ConfirmInput,
  deps: ConfirmDeps,
): Promise<ConfirmOutcome> {
  const { load, save, rows, isAdmin = () => false } = deps

  if (!isAdmin(input.senderId)) return { ok: false, reason: 'not_an_admin' }

  const by: Actor = { kind: 'person', id: input.senderId }

  const proposal = await load(input.proposalId)
  if (proposal === null) return { ok: false, reason: 'unknown_proposal' }

  if (!input.accepted) {
    const rejected: PriceEditProposal = {
      ...proposal,
      state: 'rejected',
      resolvedBy: by.id,
      resolvedAt: input.now,
    }

    await save(rejected)

    return { ok: true, decision: 'rejected', rejected }
  }

  const applied = applyPriceEdit(proposal, rows, { id: input.versionId, by, now: input.now })
  if (!applied.ok) return applied

  await save(applied.applied.proposal)

  return { ok: true, decision: 'applied', applied: applied.applied }
}
