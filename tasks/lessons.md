# Lessons

## Verify a brief against the repo before building to it

2026-09-12, B10. The brief said the card rows were seeded in the database, then
corrected itself to say there was no seed at all. Both were wrong.
`seed/business-cards.json` was on main the whole time, and
`test/support/catalog.ts` was already mapping it into a `FamilyContract`. The
brief also filed the work under B9, which `TICKETS.md` lists as a cut ticket
about escalation rate.

Three wrong facts, and each one would have produced a second mapper on the money
path that drifts from the first. Read the paths the brief names, and the ticket
row it cites, before writing the first line.

## Check a claimed commit, and say what the check actually proves

Same lane. Three changes were reported as landed on main: a TICKETS.md row, a
Linear transition and a seed fix at b5d6117. `git cat-file -t b5d6117` said "Not
a valid object name" and origin/main had not moved, so I reported them missing.

They were real. I had fetched before the push landed, and all three were on main
minutes later. Checking rather than believing was still right, and it is what
caught three genuinely wrong facts earlier in the same lane. What was wrong was
the conclusion I drew from one fetch: absent from my clone means not visible yet,
not never pushed. Re-fetch before calling something missing, and report the
check, not the motive.

## A deleted file can hold two jobs

`test/support/catalog.ts` held the seed mapper and six test fixture builders.
Only the mapper belonged in `src/`. Splitting it that way kept `intent()` and
`withVat()` out of production code. Before moving a file wholesale, ask what
each export is for.

## A finding proved with the wrong gate is not proved

`bun test` does not typecheck. A green suite says nothing about whether the
code compiles, so any claim about a type — a field is unnecessary, a union can
be narrowed, a cast is redundant — needs `bun run typecheck` in the same run as
the evidence.

This is worse than an unproved claim, because the pass count reads as proof and
stops the reader asking. When a finding says "342 pass, 0 fail", check which gate
produced the number and whether that gate can see the thing being claimed.

## Expectations computed from the data are correct where the data is meant to move

A suite that derives its expected amounts from the seed cannot catch a change to
the seed, and that is the right trade where the seed is a price list a person
edits on purpose. Pinning the literal amounts instead would fail every legitimate
edit.

So a low mutation score on a data value is not automatically a coverage gap. Ask
what the value is for. The literals that must survive belong where the arithmetic
is hand-built and independent of the data, not where the data is read.

## Evidence that cannot separate a claim from its opposite is not weak, it is none

Git authorship in this repo records the identity the tooling commits under, not
who did the work: every lane runs as an agent in a worktree on a machine with one
configured identity. So "74 commits by one name, none by another" cannot show that
the second person wrote nothing. The same number cannot tell that person's commits
from the ones this session just made under the same name.

The test is not how much evidence there is. It is whether the measurement would
look different if the opposite were true. If it would not, more of it changes
nothing, and a precise count makes the hole harder to see rather than easier,
because the number invites checking the arithmetic instead of the premise.

Twice in one day: `bun test` counted passes and could not see types, and commit
counts counted commits and could not see people. Both arrived with real numbers.

## Read the prose around a table before editing the table

The same file already said it: "Juan Bautista left on 2026-09-12. PR #4 carries
B3, B4, B5, B6, B7, B8 and A7", sixty lines under the rows being rewritten. The
question being inferred from git was answered in the document being edited.

## A8, 2026-09-12. Two reviews agreeing is not evidence

Both the staff review and the ponytail review asked me to delete the same test as
redundant, with the same reasoning: the empty-receipt test proves only both-null is
refused, so any non-null combination passes. That does not follow. The empty test pins
(null, null) and the photo test pins (media, null); neither pins (null, text). A mutant
guard keeping only the mediaId clause refuses every typed transfer and stays green
except for the test they wanted cut.

Same shape as the D1 lesson: the property lived in the quantifier, and the test that
looked like a duplicate was the one holding the other half of an `&&`.

Rule: before deleting a test a reviewer calls redundant, mutate the line it covers and
run the suite. If nothing else goes red, it was not redundant. Two agents reaching the
same wrong conclusion is one wrong argument copied, not corroboration.

Corollary from the same review round: I nearly shipped prefix normalisation inside an
admin check, inferred from a single test fixture. Nothing in src/ constructed an Actor
at all. A convention seen only in test data is not a contract, and a security check is
the worst place to guess one.

## Resolve a ref against the authoritative remote, not against a working repo

A scratch clone taken from a local working copy inherits that copy's
remote-tracking refs. `origin/<branch>` inside it is as old as the last fetch the
source repo ran, which may be hours. Every command against it can be correct and
every one of them points at the wrong repository.

Clone from the authoritative remote, or fetch in the scratch copy before reading
anything. Then name the remote you checked inside the finding itself, so a reader
can tell which repository the claim is about. "Line 6 still reads localFence" is
not a fact until it says where line 6 was read.

## A defect that matches half of what the author described is a staleness signature

Tonight a branch was reported as missing a two part fix. Applying the described
fix to the reported tree left exactly one failure, and that failure was the second
half of the same description. A tree that is missing a change does not reproduce
half of it.

So when a report contradicts an author's account but lines up with part of it,
suspect the ref before the account. A wrong claim and a stale checkout look alike
from a distance; what separates them is that staleness reproduces the earlier
state exactly, including the parts nobody disputed.

## Read the commit, not a checkout

`git show <sha>:<path>` answers what a commit contains. A working tree answers
what a working tree contains, which is the commit plus whatever is uncommitted,
unpushed, or fetched at a different time. The second is what produced every
stale-ref mistake in this repo today, in both directions. See "Check a claimed
commit, and say what the check actually proves" above.

Cite the sha and the path. It is the cheaper check whoever turns out to be stale,
and it costs nothing when everyone is current.
## Two branches each doing the right thing can still be wrong together

2026-09-12, E1. A5's turn fenced the customer message. While it sat in review,
#15 landed on main and moved fencing to the webhook call site. Each branch was
green and each was correct alone. Merged, a customer message reached the writer
wrapped in two nonces, and no test on either branch could see it, because
neither ran both.

The integration ticket is the first place a pair like that is observable, so it
owns the decision about which side keeps the behaviour. Look for duplicated
responsibility at every seam the merge joins, not only for conflicts git
reports. Git had nothing to say about this one.

## Order the write after the effect it is supposed to record

Same lane. `customerTurn` stored the next conversation state and then sent the
reply. A Telegram refusal threw, so the reply was lost and the state had already
advanced: an escalation left `escalated: true` with the customer never told, and
the update id was claimed before the turn ran, so the retry was deduped and
dropped. Sending first costs nothing and leaves a refused reply recoverable on
the customer's next message.

## A wrong default is invisible in exactly the place it matters

Same lane, from the brief. `route.ts` defaulted `turn` to `silentTurn`, so
production acknowledged every customer and answered none. The repo had already
shipped this shape once, an identity-cast fence defaulting to a no-op. Tests
pass because tests always inject the real thing. Assert the default itself:
build the production seam with no arguments and prove it calls out.
