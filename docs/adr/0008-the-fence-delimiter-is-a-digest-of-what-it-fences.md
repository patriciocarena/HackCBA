# 8. The fence delimiter is a digest of the text it fences

Date: 2026-09-12

## Status

Accepted.

## Context

PLAN.md section 5 says every outside text is fenced as untrusted and is never an
instruction. Two lanes had already written a fence of their own before this one landed,
and both are breakable.

C4 wraps a transcript in `<transcript>` and deletes every `<` and `>` from the payload.
The tag is a constant in the file, so anyone who reads the repo can write it. Deleting
the character class does hold the fence, and it pays by corrupting the message: a
customer who writes "8 < 10" is quoted something they did not say.

B7 wraps the facts block in `<facts>` and deletes the literal `<facts>` and `</facts>`
substrings from each value. That one does not hold. Deleting a substring can splice a new
one out of the halves on either side: `<<facts>facts>` has its inner `<facts>` removed and
becomes `<facts>`. The sanitiser manufactures the delimiter it exists to remove.

Both failures have the same root. A delimiter fixed in the source is a delimiter the
attacker knows, and once they know it the only defence left is editing their text, which
is where the splice lives.

## Decision

`fence(text, label)` in `src/security/fence.ts` builds the delimiter from a SHA-256
digest of the label and the text, truncated to sixteen hex characters.

```
<message:5f2b9c1a4d8e7f03>
cien tarjetas
</message:5f2b9c1a4d8e7f03>
```

The text is passed through byte for byte. Nothing is stripped, escaped or normalised,
because there is nothing left to strip: a message cannot contain the delimiter this fence
will choose for it without containing its own digest, and a message that contains its own
digest is a SHA-256 fixed point.

That one property answers every spelling of the attack at once. A guessed delimiter, a
forged pair nested inside the block, the delimiter written in fullwidth homoglyphs, the
delimiter split by a zero width space, and a block replayed from an earlier turn all fail
for the same reason, which is that the attacker is writing the message the nonce is
derived from and cannot know the nonce until they stop writing.

The label is required and must be a slug. A5's turn injects a facts block and a customer
message into one prompt and the model has to tell them apart, and requiring the label
makes every call site name what it is fencing. A label that is not a slug is a mistake in
our own code, so it throws.

The label is part of the digest, so the same text fences under a different nonce in a
different block.

## Consequences

The fence is deterministic, which is the second Done when line. `fence(text, label)` is a
pure function of its two arguments, so the same message always produces the same block and
a test can assert the whole block rather than a shape.

We accept a cryptographic argument rather than a structural one. The guarantee is that
finding a message containing its own digest costs about 2^64 attempts, not that such a
message is impossible. An earlier draft re-hashed the nonce until the body no longer
contained it, which would have made the invariant structural. It was dropped: no test can
reach a branch that needs a SHA-256 preimage to enter, and unreachable code in the one
function the adversarial suite attacks is worse than a stated assumption.

The fence delimits and does nothing else. The sentence that tells the model the block is
data and never an instruction is prompt, and the prompt belongs to A5.

C4 and B7 keep their own fences until someone owning those files swaps them. This lane
owns `src/security/fence.ts` alone and reaching into `src/voice/` or `src/domain/` would
conflict with two sibling lanes. B7's splice is real and is filed in the PR.

The third Done when line, that no path through the turn passes outside text unfenced,
cannot be closed here. The turn is A5 and is not written yet, and a test that walks every
call site in `src/` would fail on each sibling lane's merge.
