# 15. A proposal is the whole of what audio writes, and an ambiguous amount is not one

Date: 2026-09-12

## Status

Accepted.

## Context

DAN-21 says "an ambiguous dictated amount is not filled in: the PriceEdit is flagged for
review". Read as a state, that asks for a fourth value in `PRICE_EDIT_STATES`, which is
`proposed`, `applied`, `rejected` and frozen. Read as a row, it asks for a `price_edits`
entry describing an edit nobody can apply, because the amount it would apply is the one
thing that was never said.

Speech to text is the reason the criterion exists. `src/voice/price-edit-intent.ts` already
refuses a vague quantity, refuses a percent above its ceiling, and returns a `review` arm
carrying the reason. The signal exists before storage is reached.

There is a second, quieter case. A provider outage also produces no proposal. `C2`'s README
is explicit that the two must not be collapsed: a review is worth asking the owner to repeat
himself, a failure is not his fault.

## Decision

An ambiguous amount is flagged on the intent and stored nowhere. `proposePriceEdit` returns
either a proposal or a review, and only a proposal is saved. `price_edits` holds edits that
could be applied, so every row in it has an amount and a set of lines.

`readAdminAudio` reports three outcomes and keeps them apart: `proposed`, `review` and
`failed`. It is not a `Turn`, because a `Turn` returns nothing and the outcome is the point;
E1 wires the reply that reads it.

A proposal carries the old and the new price of every sale row it covers. The owner confirms
against numbers, not against a percentage, and C7 has the diff it versions.

## Consequences

Nothing records that the owner was once vague. An escalation rate by audio would need the
inbound log, which already keeps the media id, joined against what followed it. `B9` was cut
for the same reason on the text side, so this is consistent rather than a gap.

`PriceEditExtractionPort.extract` takes a plain `string`, not `UntrustedText`, so the audio
path has the fence enforced by one adapter's own code rather than by the type system. The text
path does have it. A second adapter would be unfenced with no compile error. Narrowing the port
is the fix and it is not this ticket.

The ceiling and the floor on a dictated amount are enforced twice on purpose: in the OpenRouter
parser, which is one producer, and in `operationOf`, which is the funnel every producer passes
and the last place before an amount becomes pesos. `absolute 0` passes `isArs`, and a free price
confirmed at the bottom of a long diff is the money path failing quietly.

A fourth state stays available if the owner ever needs to see his own failed dictations in
the same list as his edits. Adding it later costs a migration and this decision; adding it
now costs a row that means "no edit", which every reader of the table then has to exclude.
