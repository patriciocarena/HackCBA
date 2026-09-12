# 23. Every percentage compounds in one pass, and a breakdown line carries its rate

Date: 2026-09-12

## Status

Accepted and applied. Changes the shape of `PriceBreakdown`, which the rules of the day froze
at H+2.

## Context

Loading a second family meant loading Facturas, and Facturas prices its modifiers as
percentages: `Por triplicado, sumar 40%`, `Con papel químico, sumar 60%` under 1/2 oficio and
`70%` under A4. Six such rows, and the list never states the pesos, because the pesos are a
function of the job.

`PriceBreakdown` had one place for a percentage and it was called `moduleDiscountRates`. The
name claimed the arithmetic belonged to modules. `CONTEXT.md` said so too, under **Module
discount**: "Percentages compound when more than one applies; they are never summed."

The list says it once, at the top, about percentages in general:

> **Porcentajes.** Cuando se aplica más de uno, se aplican uno sobre otro, no se suman. (L72,
> repeated as item c at L110)

So the compounding law was filed under the one family that has modules, and it governs six
families that have none. Facturas has no module at all.

There was a second thing to settle. An add-on carrying a rate could have been resolved to pesos
at pricing time, producing an ordinary amount line and leaving `totalOf` untouched. That was the
plan. It is wrong for the reason `CONTEXT.md` gives about a **Breakdown**: it is the audit trail,
and "a human reading it can catch the error". A human catching the error on a facturas quote
needs to read `Por triplicado +40%`. A line that says only `$10.400` records the answer and not
the reason, and for a family whose every modifier is a percentage that is no audit trail at all.

## Decision

`moduleDiscountRates: number[]` becomes `rates: BreakdownRate[]`: one ordered list of every
percentage the list applies to this job, each signed, each naming its kind. A module discount is
one kind of entry in it, alongside a quantity discount and a surcharge.

`totalOf` makes one pass over that list, compounding on the running amount, then applies VAT
once and rounds once at the very end. A rate is signed, so a discount and a surcharge are the
same arithmetic and there is no branch on the kind. Amounts join afterwards at full price: the
percentages are about the job the base row prices, not about a finish someone added.

Multiplication commutes, so the order of the list never changes the total. The kind is there for
two readers: `moduleSentence` in `quote-text.ts` has to name the module discount and not a
surcharge, and the work order a person reads at the cutting table has to print `+40%`.

A rate add-on is an add-on. `CatalogRow` carries `price` or `rate`, exactly one, and
`addOnLines` sends a rate to the rate list rather than to the amount lines. `Item` in
`CONTEXT.md` widens to "one row of a family, carrying an amount or a rate", and `Add-on` to "an
item that adds to a sale row, by an amount or by a percentage of it".

The evidence for calling it an add-on rather than an attribute is Javier's own markup: he tags
`Por triplicado` with `adicional`, the same tag he puts on `Laminado`. And the arithmetic agrees.
As an attribute, Facturas would be 7 quantities × 2 formats × 2 inks × 3 copy counts = 84
combinations of which he stated 28, and the other 56 would have to be derived from a percentage.
That is interpolation, and rule 2 forbids it. As a rate add-on, every number in the seed is one
he typed.

Add-on groups are namespaced by family: `facturas:triplicate`, not `triplicate`. The list says
why, and Javier caught it before we did. At L93, on `Numerado simple o doble x 1000`:

> A consultar. Se descartó el precio propuesto de $ 40.300: no es el mismo trabajo que el
> numerado de rifas.

Same word, two families, two different jobs, and he threw out the price that assumed they were
one. `Corte circular de 4 a 12 cm` is the same story at $52.800 on cards and $39.500 on stickers.
The extraction schema offers add-on groups as a union enum across every loaded family, so an
unnamespaced group would collapse two different jobs into one token the model cannot tell apart.

## Consequences

`PriceBreakdown` changed shape rather than gaining a field, which the rules of the day forbid
after H+2. It is deliberate and it is why this is an ADR. The old field held the right arithmetic
under a wrong name, and keeping it beside a second rate list would have been two places for one
rule, which is the defect ADR 0020 came from.

Every order and quote already written carries the old shape. Nothing persists a breakdown across
a deploy today: orders live in an in-memory map, and `src/conversation/sale.ts` says so. Whoever
wires A3's table is the one who has to care, and the copy an order keeps is exactly why they
will: an order's breakdown is a historical record and must be readable as it was written.

`quote-text.ts` filters the rate list to module discounts for the customer sentence. A surcharge
is named by the add-on sentence instead, without its percentage, following the pattern add-ons
already had: a customer reads what is included, not a formula. The percentage is for the owner.

No interaction with the ADR 0010 amount guard, checked: `AMOUNT` requires a `$` and the bare
number floor is 1.000, so a rendered `40%` passes untouched.

`amountOf(row)` is the one place that reads a price off a row that must have one. A sale row
always does, because the list cannot state a base price as a percentage of nothing, so reaching
it with a rate row is a seed defect and throws loudly rather than quoting on `undefined`.

## Alternatives considered

Resolving a rate to pesos at pricing time and keeping the breakdown a list of amounts. Smallest
change, and it was the plan until the grilling session. It loses the percentage from the audit
trail, which is the breakdown's whole job.

A second field, `addOnRates`, beside `moduleDiscountRates`. Two lists obeying one compounding law
in two places, and the first edit that touches one and not the other is silent.

Keeping the rates unsigned and branching on the kind inside `totalOf`. It puts the discount and
the surcharge in different code paths for arithmetic that is identical, and it makes the kind
load bearing for the total, which it is not.

A global add-on vocabulary with a test asserting no two families reuse a group name. It catches
the collision instead of making it unrepresentable, and the thing it would catch is a seed a
person wrote by hand across thirty eight families.
