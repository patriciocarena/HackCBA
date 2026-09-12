import type { ConversationId, TurnState } from '../domain/types'
import type { Turn } from '../telegram/inbound'
import type { Send } from '../telegram/send'
import type { Notify } from './receipt-path'
import { turn, type TurnDeps } from './turn'

/**
 * The three phases become one call the webhook can make. Everything the turn needs to decide
 * is an argument; the only thing kept here is the state the turn itself hands back.
 *
 * `notify` is the owner's chat, and only `unsupported_media` reaches it. That escalation is the
 * one where a person has to go and listen to something the customer sent; every other one
 * leaves the customer's own words in the shop's Telegram, already readable. Notifying on all of
 * them would bury the owner, because the escalation rate is high while the catalog is thin.
 */
export function customerTurn(deps: TurnDeps, send: Send, notify?: Notify): Turn {
  // ponytail: in memory, A3's table when a conversation has to outlive the process. Two
  // messages for one conversation that overlap read the same state and the later write wins;
  // the table makes that one transaction, which is where the fix belongs.
  const states = new Map<ConversationId, TurnState>()

  return async (message) => {
    const { conversationId } = message
    const result = await turn(deps, message, states.get(conversationId) ?? opening(conversationId))

    // Sending first is what makes a refused reply recoverable. The update id was claimed
    // before the turn ran, so Telegram's retry is dropped; leaving the state untouched is
    // what lets the customer's next message say the same thing again.
    if (result.reply !== null) await send(message.chatId, result.reply)

    if (result.resolution?.kind === 'escalate' && result.resolution.reason === 'unsupported_media') {
      await notify?.(`Un cliente mandó algo que no puedo leer y le dije que lo atiende una persona. Chat ${message.chatId}.`)
    }

    states.set(conversationId, result.state)
  }
}

function opening(conversationId: ConversationId): TurnState {
  return { conversationId, asked: [], escalated: false, introduced: false, attributes: {} }
}
