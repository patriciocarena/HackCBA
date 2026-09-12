# Lessons, the autonomous receipt path

## A security rule that the product reverses needs an ADR, not a quieter comment

`advanceOrder` refuses `{ kind: 'agent' }` and says why in a comment: money moves when a
person says it moved. The hackathon criteria then required the opposite for one edge. The
cheap move was to widen that guard and leave the comment stale.

What went in instead: `advanceOrder` untouched, its table exposed as `mayAdvance`, and the
new power in the one function that holds the evidence. Five more lines than widening the
guard, and no caller gains anything it did not have.

The general shape: when a documented rule has to bend, bend it in a new place with a new
name, so the old rule keeps meaning what it said and the reader finds the reversal rather
than a contradiction.

## Say what the test proves, not what you hope it proves

The D5 case hands the path a reading that reports exactly what a painted instruction
demanded. It passes. The tempting sentence is "prompt injection through a receipt image does
not work".

It is not true. It passes because the demanded amount was wrong. A customer who paints the
right amount and the right alias, both of which Dante put in the deposit message they
received, confirms their own order without paying. No test in this repo closes that and none
can without a bank API.

The claim in the ADR is the narrow one that actually holds. A test that proves something
narrower than the headline is still worth having, but only if the headline is corrected.

## `anyOf` for a nullable property, never a type array

A property written `type: ['string', 'null']` makes OpenRouter silently drop structured
output and return prose with HTTP 200. The feature is then off, the answer never parses, and
because the path fails closed the only symptom is nothing happening.

Written as `anyOf: [{ type: 'string' }, { type: 'null' }]` from the start, with a test that
asserts no type array survives anywhere in the schema, and a strict parse so prose reads as
nothing rather than as a partial answer.

Two existing schemas in this repo had the bug and neither test caught it, because both tests
fed the parser a well formed answer.

## Mutation testing, again, and this time on the guards

Four mutations went against `confirmDepositFromReceipt`: the amount comparison removed,
`owed` replaced by the image's own amount, the destination check removed, the confidence
floor removed. All four failed the suite, which is the only reason to believe the comparison
is load bearing rather than decorative.

Three more went against the route's new dependencies. Same reason. On the money path this is
now the default, not a flourish.
