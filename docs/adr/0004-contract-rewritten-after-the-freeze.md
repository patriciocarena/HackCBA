# 4. The contract was rewritten after the H+2 freeze

Date: 2026-09-12

## Status

Accepted.

## Context

`PLAN.md` froze the contracts at H+2 with a rule: after that you add optional fields, you do
not rename. The frozen draft was never compiled against anything. By midnight two branches
had built on it and it could not express the demo.

`itemId: number` against string slugs in the seed. One item id for a quote that has a base
row, add-ons and a discount. No variant for asking a question, so the first missing attribute
escalated to a human and demo step one ended with nobody answering. No way to say a price
edit is a percentage over a set of rows, which is the audio in demo step five. An open
`Record<string, string | number>` for attributes, which `priceFor` had already started
grepping for the word "iva".

Renaming cost two branches a rebase at midnight. Keeping the draft cost three lanes a Saturday
spent working around a contract that cannot say what the product does.

## Decision

A2 landed as the authority. B4, B5 and C4 rebase onto it. `PLAN.md` section 4 was rewritten
in the same commit so the frozen block stays true, because C4's test parses it and fails on
drift.

The freeze rule now reads: adding an optional field is free at any hour, renaming needs a
message to the other three.

## Consequences

The rule was written to stop churn at 3am, and it did its job by forcing this to be one
deliberate rewrite instead of four quiet ones. The cost is real: work landed against the old
shape and has to move.

Lane B keeps its own numbers. Rebasing someone onto a new contract and changing his expected
amounts in the same commit makes the conflict unreviewable.
