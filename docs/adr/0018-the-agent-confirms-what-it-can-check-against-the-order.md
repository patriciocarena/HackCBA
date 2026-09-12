# ADR 0018: the agent confirms what it can check against the order

Date: 2026-09-12. Status: accepted.

## Context

ADR 0013 and `advanceOrder` say money moves when a person says it moved. The agent proposes
and records, never decides. `confirmDeposit` takes the allowlist, `advanceOrder` refuses
`{ kind: 'agent' }` outright, and the receipt store has no reader so the confirming human
cannot look at the photo instead of the bank.

The hackathon judging criteria then added: `Sin human in the loop: el flujo corre de punta a
punta solo, sin una persona aprobando o corrigiendo pasos en el medio.` A deposit that waits
for an admin is the shape being ruled out.

## Decision

Add an autonomous path beside the human one. Neither replaces the other.

`confirmDeposit` is untouched. `advanceOrder` is untouched, including its refusal of an
agent, because that refusal is right for every other edge: nothing may cancel an order or
push it into production on its own. Its transition table is now readable through
`mayAdvance` so the new path asks the one table instead of keeping a second copy.

`confirmDepositFromReceipt` is the new path. It takes a reading of the photo and the amount
the order owes, and it confirms only when the reading matches. The record then names `agent`
rather than a Telegram user id, which cannot collide: the allowlist only accepts digits.

`Sale.confirmFromReceipt` is where it is called, beside `Sale.confirmDeposit`, because the
port owns its orders and both halves must write the same map. A receipt path that wrote its
own copy is ADR 0017's failure again.

## What the model is allowed to do

It reads one image and reports four things: whether this looks like a completed transfer,
the amount, the destination, and a confidence. Nothing else.

It never supplies the amount the order is owed. That comes from the order's own breakdown
through `totalOf`, and the destination is compared against `order.depositAlias`, the alias
this customer was actually told, not `DEPOSIT_ALIAS`, which may have moved since the quote.
There is no expression in the function that reaches a confirmation using a number the image
supplied.

Fail closed, one answer for four failures: no file, no model answer, a thrown call, or a
reading that does not match. All of them confirm nothing and tell the owner, who still has
`confirmDeposit`.

## The residual risk, stated rather than implied

A vision model has no fence around an image the way extraction has one around text. D5's
sixth case hands the path a reading that reports exactly what a painted instruction demanded,
with perfect confidence, and nothing confirms.

That case passes because the demanded amount was wrong. It is not a proof of safety. The
honest claim is narrower:

> Nothing the image says reaches a confirmation except by naming the amount the order already
> owes and the alias it was already told.

Both of those are in the deposit message the customer received. So a customer who paints a
convincing receipt carrying the right number and the right alias confirms their own order
without paying. We cannot detect that without reading the bank, and we have no bank API
today.

What the design does buy: the fraud has to be deliberate and specific to one order, the
receipt is in the store either way so the dispute has an answer, the owner is told on every
receipt including the confirmed ones, and an order in production is still reversible by a
person through `advanceOrder` to `cancelled`.

## Alternatives

**Keep the human gate.** Correct, and it loses the judging criterion the whole demo is
scored against.

**Let the model decide.** It would confirm whatever a convincing image asked for, including
the amount. Refused: the comparison against the order is the only part of this that is not a
guess.

**Confidence alone, no comparison.** A model is confident about a forged receipt too.
Confidence is a floor under the reading, never the decision.

**Widen `advanceOrder` to allow an agent.** One writer instead of two and five fewer lines,
but every caller of `advanceOrder` would gain the power to confirm as the agent. Refused:
the new power belongs only to the function that holds the evidence.
