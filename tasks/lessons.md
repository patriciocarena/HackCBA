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

## A claimed commit is not a commit until it is pushed

Same lane. Three changes were reported as landed on main: a TICKETS.md row, a
Linear transition and a seed fix at b5d6117. `git cat-file -t b5d6117` said "Not
a valid object name" and origin/main had not moved. Check `git fetch` and the
object, never the claim.

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
