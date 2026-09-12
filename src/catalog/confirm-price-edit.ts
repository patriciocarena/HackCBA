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

export type ConfirmRefusal = 'not_an_admin'

export type ConfirmOutcome = { ok: false; reason: ConfirmRefusal }

export async function confirmPriceEdit(
  input: ConfirmInput,
  deps: ConfirmDeps,
): Promise<ConfirmOutcome> {
  const { isAdmin = () => false } = deps

  if (!isAdmin(input.senderId)) return { ok: false, reason: 'not_an_admin' }

  return { ok: false, reason: 'not_an_admin' }
}
