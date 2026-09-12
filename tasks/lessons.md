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
