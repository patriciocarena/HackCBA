# 22. A percentage is not an amount, and a family is a heading

Date: 2026-09-12

## Status

Accepted and applied. Both defects are fixed; the third one named below is not, on purpose.

## Context

`src/catalog/price-list.ts` exists because ADR 0020 happened: a person read the list, typed the
wrong answer about VAT into a seed, and every test stayed green because every test asserted the
number the seed declared. The parser is the machine that reads the list instead, so the seed can
be checked against it rather than against itself.

It had two defects of the same kind it was written to prevent. Neither was visible, because only
the cards family was loaded and neither defect touches the cards family.

**A percentage read as pesos.** `priceCell` stripped every non-digit, so `40%` returned the
number 40 and `-8%` returned 8. Eighteen cells in the list are percentages. `parse:list` printed
all of them as peso amounts, and `auditAgainstList` would have blessed a seed item carrying `$40`
as an amount the list states. The eighteen are Facturas' triplicado, cuadruplicado and papel
químico (twice each, and químico differs by format), Rifas' four puntillado and paper rows,
Imanes' `-8%` for unlaminated, Carpetas' `+70%`, Sobres' `+15%`, three `Impresión UV` rows at
`+25%`, and the XXL and XXXL garment surcharges.

What made it invisible is that every wrong reading was plausible. The list has genuine prices
under 100: a photocopy is $63. No sweep over the numbers could tell a mistaken rate from a real
amount.

**A family read as a section.** `family()` took the first `<h2>` of each `<section>` and dropped
the rest. The file has thirty eight headings in twenty sections, so nineteen families did not
exist and their rows were attributed to a sibling's label. `Folletos full color, láser` reported
fifteen sale rows: eight of its own and seven belonging to `Volantes papel obra`, which was not a
family at all. The families that vanished: Volantes, Rifas y entradas, Stickers con laca UV,
Stickers adhesivos, Stickers DTF UV, Sobres, Hojas membretadas, Patentes, Identificadores,
Cortes, Fotocopias e impresiones, Plastificados, Laminado OPP, Acrílico por detrás, Carteles
rígidos por metro, Letras polyfan, Plaquetas de cristal, Cuadro homenaje and Almanaques carpa.

This is the one that mattered most for the work in front of us. An attribute bag is written by a
person reading `parse:list` output, and a bag written against that output would have inherited
the wrong family for seven rows.

## Decision

`PriceCell` gains a rate arm, `{ rate: number }`, read off the `%` with its sign, because the
list writes a discount as `-8%` and a surcharge as `+10%` or as a bare `25%`. A rate and an
amount are two different types and neither is assignable to the other.

The audit follows. `SeedItem` is `{ id, price }` **or** `{ id, rate }`, and the multiset is keyed
by a tagged string rather than by the number, so `40` and `40%` are two separate things to claim
and neither can answer for the other. A seed rate is now checked against the list the way an
amount is: 0.4 mistyped as 0.04 quotes a surcharge at a tenth of what the shop charges, and it is
the same failure a lost digit is.

A family is an `h2` and everything until the next one. Same split `tablesOf` already does on
`h3`, one level up.

## Consequences

`parse:list` reports thirty eight families rather than nineteen, and prints a percentage as a
percentage.

Every amount in the list is now either claimable by a seed item or explicitly not: a dash means
the row is not offered and "a consultar" means a person prices it, and neither is something
anybody must claim. A rate is claimable.

`priceCell` checks for a percentage before it strips anything, so the order of those two
branches is load bearing. A row whose label contains a percentage is unaffected, because the
label is the first cell and never a price cell: the module discount lines still parse as
discounts carrying no price at all.

## The defect this does not fix

`Anillados` prints two independent ring-size ladders inside one HTML table, plastic and metal,
and the metal ones are numbered with a decimal comma: `Nº 9,5`. The parser reads that label's row
and returns `[2700, 95, 3500]`, where the 95 is a ring size sitting in a price position.

It is left alone deliberately. Fixing it means deciding what two ladders in one table are, which
is a modelling question about a family nobody is loading, and inventing an answer now is the
guessing this whole product forbids. It is recorded in `docs/assumptions.md` so that whoever
loads `Anillados` finds it before they write a bag against it, which is exactly the failure mode
this ADR is about.

## Alternatives considered

Returning a rate as a negative number for a discount and a positive one for a surcharge, with no
wrapper. It collapses back into the bug: a rate and an amount would again be the same type, and
`{ rate: 0.4 }` against `40` is precisely the distinction that was missing.

Keeping the parser as it was and forbidding percentage rows in a seed. It moves the defect into a
convention nobody can check, and six of the thirty eight families cannot be loaded without them.

Reading a rate as its resolved peso amount at parse time. The parser does not know which sale row
a modifier will apply to, and the list states `+70%` on papel químico for A4 and `+60%` for 1/2
oficio, so the amount is a function of the job and not of the cell.
