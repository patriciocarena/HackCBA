import { pesos } from '../domain/quote-text'
import { claimsConfirmation, type ConfirmsPending } from './owner-confirm'
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
  /**
   * What "confirmado" does. Optional, and a wiring without it hands the word to the customer
   * turn rather than swallowing it: an owner who reads the fallback sentence has lost nothing,
   * and one whose confirmation is eaten by a path that cannot confirm has lost the money step.
   */
  confirm?: ConfirmsPending
}

const NOT_HEARD = 'No pude escuchar ese audio. Mandámelo de nuevo.'

export const ONLY_AUDIO = 'Soy el canal de los precios. Mandame un audio con el cambio y te lo propongo.'

/**
 * What the owner reads, and it is not what a customer reads.
 *
 * "Agente" is deliberate here and stays out of the customer's greeting, where ADR 0021 removed
 * it because Javier heard it on a customer's phone and objected: in rioplatense it is a
 * salesperson on commission. On his own channel the word means what he means by it, and he is
 * the one who asked for this sentence.
 */
export const ADMIN_INTRODUCTION =
  '¡Hola! ¿Cómo estás? Soy Dante, tu agente de administración del negocio y atención al cliente, estoy a tu servicio. ¿Qué necesitás?'

/**
 * What he reads after the introduction, and it is not the introduction's offer said again.
 *
 * He got "¿En qué te puedo servir?" twice, once inside the greeting and once on his next
 * message, and asked what Dante is for. The three clauses here are his channel: `readAdminAudio`
 * turns a voice note into a price proposal, the customer turn prices a family the list carries,
 * and `answerFromFacts` reads `seed/facts.json`. There is no fourth, and a sentence that offered
 * one would be the invention the rest of this repo refuses.
 */
export const WHAT_I_CAN_DO =
  'Te cambio un precio si me mandás un audio, te paso un precio de la lista y te doy los datos del local. ¿Qué necesitás?'

/**
 * Every other thing the engine cannot answer him, in one sentence, the way ADR 0012 gives the
 * customer one: the reason is audit metadata, not a branch.
 *
 * It tells him what a customer would have got, which is the coverage gap reported to the one
 * person who can close it. It does not say "cargámelo": facts come from `seed/facts.json` and
 * not from a message, and a sentence that offers what Dante cannot do is the invention this
 * whole repo is built against.
 */
export const NOT_LOADED = 'Eso no lo tengo cargado. Si lo pregunta un cliente, se lo paso al local.'

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
  const { read, ask, send, fallback, confirm } = deps

  return async (message) => {
    const heard = await read(message)
    if (heard === null) return

    if (heard.kind === 'not_voice') {
      if (message.text === null) {
        await send(message.chatId, ONLY_AUDIO)

        return
      }

      // Before the customer turn, because extraction reads "confirmado" as `other` and the
      // owner was answered with his own greeting while a customer waited on the seña.
      if (confirm !== undefined && claimsConfirmation(message.text)) {
        await send(message.chatId, await confirm({ kind: 'person', id: message.senderId }, orderIdIn(message.text)))

        return
      }

      await fallback(message)

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

/**
 * The order he named, when he named one, and nothing when he did not.
 *
 * Two shapes, because an order id is `crypto.randomUUID` in production and `ord_`-something in
 * the seed and the tests. Matching a shape rather than "the last word" is what keeps the fence
 * delimiter and the word "seña" from being read as an id: one that matches no pending order
 * confirms nothing, so a wrong guess costs a sentence and never a deposit.
 */
function orderIdIn(text: string): string | undefined {
  return text.match(ORDER_ID)?.[1]
}

const ORDER_ID = /\b(ord_[A-Za-z0-9_-]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i
