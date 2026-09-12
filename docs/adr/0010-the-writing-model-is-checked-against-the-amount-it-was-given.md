# 10. The writing model is checked against the amount it was given

Date: 2026-09-12

## Status

Superseded by ADR 0027, which drops the guard. The reasoning below is kept because it is the
argument for what was given up: a refused reply was answered with silence, and silence in front
of a customer is what got it dropped.

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

Check, and check every number. The turn refuses a reply unless all three hold:

- every pesos-shaped run in it is one the resolution allows, and
- every number in it of 1000 or more was either in the answer or in the customer's own
  message, and
- on the price branch, the formatted total appears verbatim.

The first two are subset tests, not equality: a reply may repeat a quantity the customer
asked for, and it may leave out an amount it was allowed. What it may not do is introduce
one. The third is what makes the price branch an equality in practice, because the amount the
resolution computed has to be there.

The allowed set is empty for an ask and for an escalation, so those branches permit no
pesos-shaped run at all. A reply that fails any of the three escalates and is never sent.

A pesos sign alone is not the test. `Sin IVA serían 37190 pesos` and `ARS 30.000` carry no
sign, and the only thing that stood against them was `no inventes importes` in the prompt,
which is an instruction and not a construction. The floor of 1000 is what keeps the number
rule from firing on `1000 tarjetas`, `350` gramos or `4/1`; the cheapest row in the catalog is
12100, so nothing a customer is charged hides under it.

The customer's message reaches the guard as the fenced block the webhook produced, and the
nonce in a delimiter is hex. Its digits are stripped before the numbers are read, or a reply
could stand on a number that came from the fence rather than from the customer.

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

A writer that never answered at all is a different failure and gets a different outcome. It
escalates like the rest, and the customer is sent the one sentence the turn can write without
a model, so an OpenRouter blip is a handover rather than silence. A writer that answered with
an amount it was not given is still told nothing back: anything sent after that would be a
second chance to state the wrong number.

The guard reads the reply, which means it is a string test on formatted output. The format is
`quote-text.ts`'s `pesos`, thousands separated by dots, and the two must not drift apart. They
are in different lanes' files, so the turn formats with its own copy of the rule and a test
pins the shape.
