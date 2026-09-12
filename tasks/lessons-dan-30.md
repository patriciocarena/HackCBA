# Lessons, DAN-30

## A brief that says build X is still subject to the ladder

The brief said to record or synthesise an audio for step 5 and commit it under `demo/`.
`fixtures/raise-cards.opus` was already in the repo, a real Argentine voice note, already
verified against the live ElevenLabs API, already saying the sentence PLAN.md section 10
step 5 wants. Rung 2 of the ladder, does something we already have cover it, caught it
before anything was recorded.

The instruction was written by someone who did not know the fixture was there. Read the
repo before taking a brief literally. The cost of not doing it here was a second copy of a
binary to keep in sync with the first.

## Pin a runbook's numbers to a test that already exists

Two 1000 card rows could carry the demo. One quotes $49.000, and $176.400 at 10x15, and no
test mentions either amount. The other quotes $45.000 and $162.000, and
`test/catalog/prices.test.ts` and `test/domain/order.test.ts` already pin both.

Choosing the second cost nothing and meant the runbook cannot drift from the seed without a
test going red first. A runbook whose numbers nothing checks is a document that goes wrong
silently, and it goes wrong on camera.

The general shape: when a document asserts a value the code computes, prefer the value
something already asserts.

## The doc was the place to find the wiring gaps

Writing out what each of the six steps needs surfaced that `acceptQuote`, `requestDeposit`,
`confirmDeposit` and `applyPriceEdit` exist, are tested, and have no caller in `src/` on any
branch. Four lanes each shipped a correct pure function and nobody owns the wire between
them.

Nothing in a ticket asked anyone to check. Writing the runbook is what asked.
