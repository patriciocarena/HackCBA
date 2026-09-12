# 16. Only `fence()` builds an `UntrustedText`, and nothing makes that stay true

Date: 2026-09-12

## Status

Accepted, and the gap it records is open on purpose.

## Context

PLAN.md section 5 says every outside text is fenced and is never an instruction. ADR 0008
carries that into the type system: `fence()` returns `UntrustedText`, and any parameter typed
`UntrustedText` is asking for text that has been through the fence. The rule the codebase
relies on is that only `fence()` builds one.

That rule holds right now, and tsc enforces the useful half of it. `src/security/fence.ts:16`
is the only cast to the brand anywhere in `src/`. `factsBlock` in `src/domain/facts.ts` returns
the result of `fence()` rather than minting its own, so the one place that had a reason to
shortcut did not. Assigning a raw `string` to `InboundMessage.text` fails with TS2322, so no
unfenced value reaches a fenced field by accident.

The half tsc does not enforce is the one that matters. `UntrustedText` is a branded string, so
a cast produces one. Any file can write `as UntrustedText` and the compiler accepts it.
`test/domain/deposit.test.ts:77` already does, for a fair reason: a test needs a fenced value
without a fence secret. That file is inside `tsconfig`'s include, it typechecks, and nothing in
the repo noticed. So the escape is not a theory about a future contributor. It is one line, it
is already in the tree, and the only thing keeping it out of `src/` is that nobody has needed it
there yet.

The finding came from PR #11. That thread is closed, which is why it is written here.

## Decision

Keep the brand, keep the cast, and record what the guarantee actually rests on. As of this
ADR, the only fenced value in production code comes from `fence()`. That is a property of the
code as written, observed and checked, not a property of the type. Nothing stops the next
contributor writing one cast and un-enforcing it silently.

The alternative was rejected for the demo, not on principle. Closing the escape needs a class
with a private field, because that is the only construction TypeScript will not let a cast
reach. Three costs follow.

A fenced value stops being a string. `InboundMessage.text`, the deposit evidence text and the
facts block are all typed as one today, and they are contracts ADR 0004 froze. Reshaping them
is the deliberate act 0004 says to do with a rewrite, not a refactor done in passing.

Every `JSON.stringify` of a fenced value breaks. A4's inbound log, the receipt store and A3's
storage seam each write fenced text into a TEXT column by treating it as a string. A class
serialises to `{}` until every write site is taught a `toJSON`, and no read site can rebuild
the brand on the way back without the fence secret, which storage does not have.

The work is a lane of its own and there is no lane left.

## Consequences

Review is the gate, and the signature to look for is a new `as UntrustedText` in `src/`. There
is exactly one and it is in `fence.ts`. `grep -rn "as UntrustedText" src/` returning a single
line is the whole check, it costs nothing, and it is the only check there is.

A second cast in `src/` would not fail a test or a typecheck. It would produce a value that
claims a prompt boundary and carries no nonce, so ADR 0008's guarantee would stop covering that
path while every signature in it still said `UntrustedText`. The failure is quiet by
construction.

The #11 thread offered ADR 0010 as the home for this record. 0010 is taken by A5 and the offer
is stale. Anyone arriving from that comment should read this file instead of writing a second
0010.
