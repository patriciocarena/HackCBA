# 17. A contract that rests on both sides remembering it

Date: 2026-09-12

## Status

Accepted.

## Context

Three times in one night, two modules each did one half of a contract that says a thing
happens exactly once, and the composition was wrong while neither half was.

The shape is always the same. Neither module is wrong on its own. Git reports no conflict,
because neither edits the other's lines. No unit test on either side can observe it, because
each side's test asserts its own half and both halves pass. The defect exists only in the
composition, and integration is the first place it is visible.

Three sightings, found from three directions by three sessions:

A5 fenced `message.text` inside the turn while #15 fenced at the webhook. Each fenced once.
Merged, a customer message reached the writer inside two nonces, and the prompt rule that
makes a pasted block visible then pointed at the shop's own fence. This one is in the repo's
history, so it is citable rather than hypothetical.

E1 captures `rows` once at boot and the turn reads that reference for the life of the process,
while `applyPriceEdit` returns a new array. Each side swaps once and the turn sees neither, so
the owner is told the edit applied, `price_versions` records it, and the bot goes on quoting
the old price. Demo step 5 succeeds on camera and step 1 contradicts it thirty seconds later.

`confirmPriceEdit` reads a proposal, checks `state === 'proposed'`, and writes it back. The
guard is right and the read-modify-write is not. Two taps on one inline keyboard arrive as two
update ids, so `seenUpdates` does not dedupe them, both reads see `proposed`, and both succeed.

The D5 lane arrived at the double fence independently, from a third direction, while looking
for something else. That is what makes this worth an ADR rather than a lesson: the hazard was
not found by the person who introduced it, in any of the three cases.

## Decision

Where a contract says exactly once and two modules can each satisfy it alone, remove the
second half rather than document it.

- The catalog is a getter. `liveCatalog(initial)` hands out `rows: () => CatalogRow[]` and
  `swap(next)`. A reader cannot capture an array, so there is no old reference to go stale.
  This is the shape `TurnDeps.rows` takes.
- One fence with one owner. The webhook fences on the way in and `UntrustedText` brands what
  it produced, so the turn trusts the brand instead of fencing again. Safe only because ADR
  0016 made `fence()` the sole producer.
- One claim before the read. The callback wiring claims a proposal id before `confirmPriceEdit`
  reads it, and gives the claim back only when the outcome refused. A refusal that kept the
  claim would let one press from outside the allowlist lock the owner out of his own proposal.

The rule generalises to a review question rather than a checklist: for any guarantee that
rests on both sides remembering the contract, ask what the type would have to be for the
second half to be unrepresentable.

## Consequences

A required port is worth its cost. `WebhookDeps.onCallback` is not defaulted, which costs
every construction one line. The last defaulted port in that file was `fence`, defaulting to
an identity cast that nothing ever replaced, and every Telegram message reached the turn
unfenced for as long as the seam existed. The default was the bug and the seam hid it. A
forgotten wire is a compile error, not a button that does nothing in a live demo.

Making staleness unrepresentable is not the shortest diff.
`rows.splice(0, rows.length, ...applied.rows)` also works, and it leaves a shared mutable
array behind that breaks the first time anyone copies it. The shorter diff was refused on
purpose.

The claim set is in memory and never evicted, so a proposal settles at most once per process.
That is correct for exactly-once and wrong for a restart, which is the same answer A3's table
gives everywhere else in this repo: the table is where the read and the write become one
transaction, and the claim set is what stands in until it lands.

A guarantee that rests on both sides remembering the contract holds until the two sides are
written by different people, which on this board is always.
