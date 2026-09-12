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

The same shape turned up a second time in the same file, found by the review pass rather than
by the tests: `applyPriceEdit` also refuses a `now` that is not a date, and the reject branch
also never reached that, so a refusal could be stamped `ayer` and stored.

When two branches resolve the same thing, the precondition belongs above the branch, not
inside whichever one happens to delegate. Finding it once is a fix; finding it twice in one
file means the delegation was the wrong place to keep it.

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

## Each half correct, the whole wrong: a hazard with three sightings

Two modules each correctly perform one half of a contract that says the thing happens exactly
once. Neither is wrong on its own. Git reports no conflict, because neither edits the other's
lines. No unit test on either side can observe it, because each side's test asserts its own
half and both halves pass. The defect exists only in the composition, and integration is the
first place it is visible.

Three sightings in one night, found from three directions by three sessions:

A5 fenced `message.text` inside the turn while #15 fenced at the webhook. Each fenced once.
Merged, a customer message reached the writer inside two nonces. This one is in the repo's
history, so it is citable rather than hypothetical.

E1 captures `rows` once at boot and `src/conversation/turn.ts` reads that reference for the
life of the process; `confirmPriceEdit` returns a new array from `applyPriceEdit`. Each side
swaps once and the turn sees neither, so the owner is told the edit applied, `price_versions`
records it, and the bot goes on quoting the old price. Step 5 succeeds on camera and step 1
contradicts it.

The D5 lane arrived at the double fence independently, from a third direction, while looking
for something else.

The fix is not to check more carefully at the seam. It is to make the second half impossible:
`rows: () => CatalogRow[]` rather than a captured array, one fence with one owner rather than
two correct ones. A guarantee that rests on both sides remembering the contract is a guarantee
that holds until the two sides are written by different people, which on this board is always.

Look for it wherever a contract says "exactly once" and two modules can each satisfy it alone.
Do not wait for a test to find it; no test at either end is looking.
