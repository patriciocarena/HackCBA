import { pesos } from '../domain/quote-text'
import type { PriceEditProposal } from '../domain/types'
import type { Turn } from '../telegram/inbound'
import type { AskToConfirm, Send } from '../telegram/send'
import type { AudioRead } from '../voice/admin-audio'

export type ReadAdminAudio = (message: Parameters<Turn>[0]) => Promise<AudioRead | null>

export type AdminTurnDeps = {
  read: ReadAdminAudio
  ask: AskToConfirm
  send: Send
  /** The customer turn. A role decides what the owner may change, not whether he is answered. */
  fallback: Turn
}

const NOT_HEARD = 'No pude escuchar ese audio. Mandámelo de nuevo.'

export const ONLY_AUDIO = 'Soy el canal de los precios. Mandame un audio con el cambio y te lo propongo.'

/**
 * The owner's voice note, turned into a proposal he can agree to. The inbound half of step 5:
 * nothing here applies anything, and the button it sends is the only way the edit lands.
 *
 * A message that is not the owner's produces nothing at all, which is what the customer path
 * did with it before this existed. The owner's own text is different: it goes to the customer
 * turn, so he is quoted like anybody else and a price change he types is pointed back at the
 * audio there. Media that is not a voice note is the one thing answered here, because the
 * customer turn would read it as something it cannot handle and escalate the owner.
 */
export function adminTurn(deps: AdminTurnDeps): Turn {
  const { read, ask, send, fallback } = deps

  return async (message) => {
    const heard = await read(message)
    if (heard === null) return

    if (heard.kind === 'not_voice') {
      await (message.text === null ? send(message.chatId, ONLY_AUDIO) : fallback(message))

      return
    }

    if (heard.kind === 'proposed') {
      await ask(message.chatId, proposalText(heard.proposal), heard.proposal.id)

      return
    }

    await send(message.chatId, heard.kind === 'review' ? heard.review.detail : NOT_HEARD)
  }
}

/**
 * Every line, with both prices written out. The owner is agreeing to a number, so a sentence
 * that says "subo un 20%" and hides the arithmetic is not something he can check.
 */
export function proposalText(proposal: PriceEditProposal): string {
  return [headline(proposal), ...proposal.lines.map(editLine), '¿Lo aplico?'].join('\n')
}

function headline(proposal: PriceEditProposal): string {
  const { operation } = proposal

  if (operation.op === 'absolute') return `Dejo estos precios en ${pesos(operation.amount)}:`

  const verb = operation.direction === 'raise' ? 'Subo' : 'Bajo'

  return `${verb} un ${percent(operation.rate)}:`
}

/** One line, both prices. Shared with the reply the owner gets after he presses. */
export function editLine(entry: PriceEditProposal['lines'][number]): string {
  return `${entry.label}: ${pesos(entry.oldPrice)} → ${pesos(entry.newPrice)}`
}

function percent(rate: number): string {
  const value = rate * 100

  return `${(Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, '')).replace('.', ',')}%`
}
