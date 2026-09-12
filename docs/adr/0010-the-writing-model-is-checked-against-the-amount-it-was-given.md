# 10. The writing model is checked against the amount it was given

Date: 2026-09-12

## Status

Accepted.

## Context

The turn has three phases and only the middle one is trustworthy. Extraction reads a message
into an `Intent`, resolution runs `priceFor` and `totalOf`, which are pure and tested, and
writing turns a `Resolution` into Spanish. Writing is a model, and PLAN.md section 5 says the
bot only says a number that comes out of a pure function over data the owner typed.

Two ways to hold that line were open.

Substitute. Hand the writer a placeholder, replace it after the model answers. The number we
handed over is then unalterable by construction. It says nothing about a second number the
model writes beside it, and "te cotizo $47.000, unos $40.000 sin IVA" passes.

Check. Hand the writer the formatted amount, tell it to copy it, and refuse the reply if what
came back does not carry exactly that amount and nothing else.

## Decision

Check, and check totally. `amountsIn(reply)` collects every pesos-shaped run in the reply and
the turn requires that set to equal what the resolution allows: one amount for a price, none
for an ask, a fact or an escalation. A reply that fails escalates and is never sent.

The writer receives `pesos(totalOf(breakdown))` as a string. It never sees the base row, the
module factor, the module discount rates or the VAT rate, so there is nothing in its context
to do arithmetic on.

## Consequences

One guard covers four branches. The branch with no amount is the one that was easiest to get
wrong, because nothing in the prompt stops a model from inventing a price while it explains
that it cannot give a price, and the empty allowed set catches it.

A model that will not copy a number costs an escalation, not a wrong quote. That is the
intended trade: an escalation is the correct outcome, per CONTEXT.md, and a wrong amount is
the failure the whole product exists to prevent.

The guard reads the reply, which means it is a string test on formatted output. The format is
`quote-text.ts`'s `pesos`, thousands separated by dots, and the two must not drift apart. They
are in different lanes' files, so the turn formats with its own copy of the rule and a test
pins the shape.
