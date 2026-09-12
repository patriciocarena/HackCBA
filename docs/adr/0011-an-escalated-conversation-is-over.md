# 11. An escalated conversation is over, and the turn says so by returning nothing

Date: 2026-09-12

## Status

Accepted.

## Context

A9 was cancelled into A5 because `TurnState.escalated` already exists. What was left
undecided is what a turn does on the message after the escalation.

Three options. Reply with the same handoff line every time, which trains the customer that
the bot is still there and invites them to keep trying. Reply once more with something
softer, which is a second thing to write and a second thing to get wrong. Or say nothing.

## Decision

Say nothing. `if (state.escalated) return { reply: null, state }` is the first line of the
turn, and `escalated` is never set back to false.

The first escalation does reply, with the detail the resolution carries, and that reply is
what tells the customer a person is taking over.

## Consequences

A human has the conversation from then on, and the transport sees `null` and sends nothing.
The turn does not need to know whether a person has answered yet; there is no state for that
and there is no ticket that adds one.

Nothing un-escalates a conversation inside the product. Clearing the flag is an operator
action against whatever store E1 wires the state into, and that is the right place for it:
handing the conversation back to a bot is a decision a person makes.

Because the flag is read before the message is looked at, an escalated conversation costs no
model call at all. That is not why the order was chosen, but it is the reason not to move it.
