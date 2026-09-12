# 12. The receipt store has no reader, so confirmation cannot be shown a receipt

Date: 2026-09-12

## Status

Accepted.

## Context

A customer accepts a quote, Dante sends the transfer alias, the customer sends a receipt, and
a person confirms the deposit. `TICKETS.md` A8 gives the done-when as one clause: the receipt
is stored and is never shown to whoever confirms.

The bot this replaces is not the threat here. A forged receipt is. `docs/amenazas.md` is about
someone arriving from a number that is not the owner's, and a photo is the cheapest thing in
this flow to fake: a screenshot with the right alias, the right amount and the right date
costs nothing and is indistinguishable from a real one at the size Telegram renders it.

The failure is not that the system believes the photo. It is that a person does. Put a receipt
next to a confirm button and it gets looked at, and looking at it is the one check that does
not work. The only account of a transfer that cannot be forged is the bank's.

So the receipt has to be kept, because a dispute weeks later needs an answer, and it has to be
unavailable to the person confirming, because availability is what invites the wrong check.

## Decision

`ReceiptStore` has one member and it writes:

```ts
export type ReceiptStore = {
  record(receipt: Receipt): Promise<void>
}
```

`confirmDeposit` does not take a store. Not an empty one, not a restricted one, none. With no
reader on the port and no store in the signature, there is no expression a confirmation path
can write that reaches a receipt. The property holds because of what the types make
impossible, not because a later lane remembers a rule.

The only thing `src/domain/deposit.ts` ever emits about a receipt is one sentence naming the
order and sending the reader to the bank. The receipt is not in it.

Confirmation is not gated on a receipt having arrived. Gating would require the store to
answer a question, even a boolean one, and a port that answers one question is a port that can
be asked to answer a second. A transfer that lands with no photo is a real transfer, and the
admin confirming it is reading the bank either way, so the gate would buy nothing and cost the
guarantee.

Recording a receipt changes no state. Evidence is not a transition. The order waits in
`deposit_pending` until a person moves it, which is `advanceOrder`'s decision and stays there.

## Consequences

Nobody can build a confirmation screen that previews the receipt without first widening
`ReceiptStore`, which is a visible change to a type whose comment says why it is narrow. A
test asserts the absence with `@ts-expect-error`, so adding any reader fails `bun run
typecheck` rather than passing review quietly.

A receipt for an order that is not awaiting a deposit is refused and not written. Nothing is
lost: A4's inbound log already keeps every message with its media id, so the evidence survives
in the transport record even when the domain declines it.

Reading receipts back, when an operator genuinely needs one for a dispute, is a separate path
with its own audit trail and its own ticket. It is deliberately not this module, and it is not
the screen used to confirm.

`by.id` reaches the allowlist unchanged. Normalising a channel prefix inside an admin check
would be a rule invented at a trust boundary; a wiring mistake that denies everyone fails in
the direction we want.

The store is in memory behind the port, which A3's table replaces without touching any caller.
