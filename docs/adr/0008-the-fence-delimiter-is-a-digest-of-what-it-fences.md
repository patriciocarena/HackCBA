# 8. The fence delimiter is a keyed digest of what it fences

Date: 2026-09-12

## Status

Accepted. The first draft of this ADR specified an unkeyed digest and was wrong; the
Decision below is the keyed version and the Context says what the unkeyed one missed.

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
one out of the halves on either side, so the sanitiser manufactures the delimiter it
exists to remove.

Both failures have the same root. A delimiter fixed in the source is a delimiter the
attacker knows, and once they know it the only defence left is editing their text, which
is where the splice lives.

Deriving the delimiter from a digest of the label and the text fixes that, and stops one
attack short of the one that matters. It makes a message unable to close the fence around
itself, because doing so needs a message containing its own digest. It does nothing about
a message carrying a valid block for a different label, which costs nothing at all: the
digest is over public inputs, so a customer computes `<facts:…>` for any text they like
and pastes it into their message. The fence emits it verbatim, and A5's prompt then holds
a facts block that is byte for byte what a real facts fence would have produced. Nothing
downstream can tell the two apart, and recomputing the digest accepts the forgery, because
it is the true digest of its own contents.

The prompt cannot fix that. Only the fence can make a delimiter unforgeable, and
unforgeability needs a secret.

## Decision

`fencer(secret)` in `src/security/fence.ts` returns a `fence(text, label)`. The delimiter
carries an HMAC-SHA256 of the label and the text under that secret, truncated to
thirty two hex characters.

```
<message:9b4a0c7d1e6f28035ca7d4b81f0e69a2>
cien tarjetas
</message:9b4a0c7d1e6f28035ca7d4b81f0e69a2>
```

The module exports a `fence` already bound to the process secret, which is `FENCE_SECRET`
when it is set and thirty two random bytes when it is not. A random fallback is stronger
than a fixed one, not weaker: an unset variable degrades to nonces that are unforgeable
but do not survive a restart, rather than to nonces everyone can compute. Tests build
their own fence with an explicit secret.

The text is passed through byte for byte. Nothing is stripped, escaped or normalised. That
is not a convenience, it is the point: sanitising is what both sibling fences got wrong,
and a fence that chooses a delimiter the attacker cannot write has nothing left to sanitise.

The seed is hashed as UTF-16 code units rather than through `update(string)`, which encodes
UTF-8 and folds a lone surrogate into U+FFFD. Under the UTF-8 default two distinct messages
shared a nonce. No escape followed from it, since each block still bounded its own text,
but the digest should be a function of the string and not of a lossy encoding of it.

The label is required and must be a slug. A5's turn injects a facts block and a customer
message into one prompt and the model has to tell them apart, and requiring the label makes
every call site name what it is fencing. A label that is not a slug is a mistake in our own
code, so it throws. The label is part of the seed, so the same text fences under a
different nonce in a different block.

## Consequences

The fence is deterministic where the ticket needs it. Inside one process a given text and
label always produce the same block, which is what "same input, same output" is for: A5
fences the same message twice in one turn and gets one block. What is gone is cross process
reproducibility, and nothing in the repo wants it. No caller caches a block, and a test that
pinned a literal nonce was pinning a value that only a keyless fence could promise.

An attacker can still write a block whose shape is perfect and whose nonce is wrong. That is
the intended outcome: a wrong nonce is a visible forgery, where a right one is not a forgery
at all.

Two things now depend on the secret. If `FENCE_SECRET` changes, blocks fenced before the
change no longer match ones fenced after, which matters only to anything that stores a block
rather than re-fencing its text, and nothing does. And the module reads the variable when it
is first imported, so on Fly, where the platform populates the environment, import order is
irrelevant, while a local run that expects `.env` must import `src/config/load-env` first or
silently take the random fallback.

`FENCE_SECRET` is not added to `.env.example`. It is optional by design, and that file is
central enough that four lanes editing it is four conflicts.

The fence delimits and does nothing else. The sentence that tells the model the block is
data and never an instruction is prompt, and the prompt belongs to A5.

C4 and B7 keep their own fences until someone owning those files swaps them. This lane owns
`src/security/fence.ts` alone and reaching into `src/voice/` or `src/domain/` would conflict
with two sibling lanes.

The third Done when line, that no path through the turn passes outside text unfenced, cannot
be closed here. The turn is A5 and is not written yet, and a test that walks every call site
in `src/` would fail on each sibling lane's merge.
