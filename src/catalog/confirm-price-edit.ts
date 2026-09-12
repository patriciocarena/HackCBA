import type { CatalogRow } from '../domain/price-for'
import type { PriceEditProposal } from '../domain/types'
import type { IsAdmin } from '../security/allowlist'

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

export type ConfirmRefusal = 'not_an_admin' | 'unknown_proposal'

export type ConfirmOutcome = { ok: false; reason: ConfirmRefusal }

export async function confirmPriceEdit(
  input: ConfirmInput,
  deps: ConfirmDeps,
): Promise<ConfirmOutcome> {
  const { load, isAdmin = () => false } = deps

  if (!isAdmin(input.senderId)) return { ok: false, reason: 'not_an_admin' }

  const proposal = await load(input.proposalId)
  if (proposal === null) return { ok: false, reason: 'unknown_proposal' }

  return { ok: false, reason: 'unknown_proposal' }
}
