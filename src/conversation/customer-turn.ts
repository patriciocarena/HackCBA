import type { ConversationId, TurnState } from '../domain/types'
import type { Turn } from '../telegram/inbound'
import type { Send } from '../telegram/send'
import { turn, type TurnDeps } from './turn'

/**
 * The three phases become one call the webhook can make. Everything the turn needs to decide
 * is an argument; the only thing kept here is the state the turn itself hands back.
 */
export function customerTurn(deps: TurnDeps, send: Send): Turn {
  // ponytail: in memory, A3's table when a conversation has to outlive the process. Two
  // messages for one conversation that overlap read the same state and the later write wins;
  // the table makes that one transaction, which is where the fix belongs.
  const states = new Map<ConversationId, TurnState>()

  return async (message) => {
    const result = await turn(deps, message, states.get(message.conversationId) ?? opening(message.conversationId))

    // Sending first is what makes a refused reply recoverable. The update id was claimed
    // before the turn ran, so Telegram's retry is dropped; leaving the state untouched is
    // what lets the customer's next message say the same thing again.
    if (result.reply !== null) await send(message.chatId, result.reply)

    states.set(message.conversationId, result.state)
  }
}

function opening(conversationId: ConversationId): TurnState {
  return { conversationId, asked: [], escalated: false, introduced: false }
}
