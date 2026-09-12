# Glossary, DAN-21

Terms this ticket decides. The central glossary is `CONTEXT.md` and it stays central.

**Proposal**:
A `PriceEditProposal` in state `proposed`: an operation, the lines it would change, the
media that caused it and who dictated it. It is the whole of what the audio path writes.
Nothing in it has been applied, and C7 is what applies it.
_Avoid_: Draft, pending edit, price change

**Line**:
One sale row inside a proposal, carrying its old price and its new price. The owner
confirms against these, not against the percentage, because a percentage he mishears
reads the same as one he meant.
_Avoid_: Diff row, delta, change

**Review**:
The outcome when the model answered and the answer was not actionable: a vague quantity, a
target the list does not carry, an amount that is not whole pesos. It is flagged on the
intent and stored nowhere. See `docs/adr/0015-an-ambiguous-amount-is-not-a-row.md`.
_Avoid_: Rejected, invalid, error

**Failure**:
The outcome when we never got an answer at all: no audio behind the file id, a transcriber
that returned nothing, a model that was down. Kept apart from a review, because an outage
is not the owner mumbling.
_Avoid_: Error, review, retry

**Target**:
What the owner named out loud, as free text: "las tarjetas". It is resolved to sale rows
by the family it names, and a target that names no family proposes nothing. The proposal
has no field for it, because the lines are the answer to which rows he meant.
_Avoid_: Scope, selector, filter

**Media id**:
Telegram's `file_id` for the voice note, kept on the proposal so C7 can prove which audio
caused which version. It locates a file, it is not the file: `telegramAudio` spends two
calls turning one into bytes.
_Avoid_: File, attachment, audio
