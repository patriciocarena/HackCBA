import { editLine } from '../conversation/admin-turn'
import type { ConfirmRefusal } from '../catalog/confirm-price-edit'
import type { PriceEditProposal } from '../domain/types'

/**
 * What the owner reads after he presses. Every refusal is named here rather than collapsed
 * into one apology, because the owner's next move differs: a stale proposal needs a new
 * audio, an already resolved one needs nothing at all.
 *
 * `not_an_admin` is the exception and is deliberately empty of information. C9 refuses a
 * stranger before it loads anything, so the refusal cannot know whether the proposal exists,
 * and the answer a stranger gets must not be the place that tells them.
 */
export const REFUSED: Record<ConfirmRefusal, string> = {
  not_an_admin: 'No puedo procesar eso.',
  unknown_proposal: 'No encuentro esa propuesta.',
  not_proposed: 'Esa propuesta ya estaba resuelta. No cambié nada.',
  not_a_time: 'No pude fechar el cambio, así que no lo apliqué.',
  not_a_person: 'No pude confirmar quién lo aprobó, así que no lo apliqué.',
  stale: 'Los precios cambiaron desde que te la propuse, así que no la apliqué. Mandame el audio de nuevo.',
}

export const REJECTED = 'Listo, no cambié nada.'

export const SETTLED = 'Esa propuesta ya está resuelta.'

/** The lines that moved, and that they are live, because the owner is about to quote from them. */
export function appliedText(proposal: PriceEditProposal): string {
  return ['Aplicado, ya está en vigencia:', ...proposal.lines.map(editLine)].join('\n')
}
