# Lessons, DAN-22

Corrections from this lane, kept out of `tasks/lessons.md` because that file is central and
four lanes editing one file is four conflicts.

## A guard reached down one branch is not a guard

`applyPriceEdit` already refused a proposal whose `state` was not `proposed`, so the accept
branch was covered and the question looked settled. The reject branch does not call
`applyPriceEdit`. It wrote `state: 'rejected'` straight onto whatever the store returned, so
an already-applied edit could be rejected afterwards and the second resolution overwrote the
first, `ok: true`.

The test that found it loops over both states and both answers. Four cases, one `it`. Writing
it as "the owner says no to a fresh proposal" would have passed forever.

When two branches resolve the same thing, the precondition belongs above the branch, not
inside whichever one happens to delegate.

## `bun test` is not a typecheck, and the gap is where unions rot

The outcome union started as `{ ok: true; applied } | { ok: true; rejected } | { ok: false;
reason }`. Six tests green. `bun run typecheck` then reported that `rejected` does not exist
on the first member: two members keyed only `ok: true` do not narrow, so TypeScript resolved
every success to the first one.

The tests passed because the runtime object really did carry `rejected`. Only tsc knew the
type could not be read. Both gates, every run, and a claim about a type is worth nothing until
tsc has seen it.

## An ADR that seems to forbid your ticket is usually narrower than it reads

ADR 0013 says a store has no reader, and says it in strong terms. This lane needs a reader on
a different store, which read as a contradiction until the two subjects were separated: a
receipt is evidence, and being able to look at it is the failure; a proposal is a pending
decision, and being able to read it back is the point.

Restating the earlier ADR's subject in the new one is cheaper than either quietly breaking it
or re-deciding it. Say which noun the old rule was about.

## A test with nothing to fail against is not a test

A test named "applies the stored proposal, not one handed to it" built a forged proposal,
never passed it anywhere, and asserted the stored numbers came out. It passed on the first
run and would pass against any implementation, because the signature takes an id and has no
parameter to forge through. It was deleted, and the property it claimed to cover is stated in
the ADR where the signature already guarantees it.
