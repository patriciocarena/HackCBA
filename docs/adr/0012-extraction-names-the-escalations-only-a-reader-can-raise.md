# 12. Extraction names the escalations only a reader of the message can raise

Date: 2026-09-12

## Status

Accepted. Amended once, below, when the catalog grew past one family.

## Context

Five of the thirteen `ESCALATION_REASONS` had a producer in `src/`. `priceFor` raises
`out_of_catalog`, `no_match`, `ambiguous` and `unsupported_quantity`; `facts.ts` raises
`unknown_fact`. The turn added `not_authorized` and `missing_attribute`.

`docs/pricing-cases.md` promises two more. Case 14, "¿me hacés precio si llevo varias?",
must escalate `commercial_discount`. Case 17, "el IVA es obligatorio?", must escalate
`vat_question`. Neither is reachable from the engine: `priceFor` takes a `QuoteIntent` and
never sees a customer's words, so by the time the engine runs, the question that made the
case has already been thrown away. Both rows assign the work to extraction, and both were
untested, with `commercial_discount` appearing nowhere in the repo but the enum and the doc.

The obvious move is to give `Intent` an arm for them. `Intent` is A2's contract, four lanes
switch on it, and adding an arm for this lane's escalations is a conflict with three of them.

## Decision

The extraction schema carries a nullable `reason` alongside `kind`, closed to the four
reasons a reader of the message can see and nothing else:

```
commercial_discount   vat_question   multiple_products   human_requested
```

A stated reason outranks the kind. Extraction naming one means it recognised something the
engine must not answer, so a quote the same answer also filled in is a quote nobody may be
given, and the turn escalates before `priceFor` runs.

The engine's own five reasons are not offered. A model reading a message cannot claim
`unsupported_quantity`, which is the list's fact about itself, and a value outside the four
is read as no reason at all.

`Intent` is untouched.

## Consequences

Every escalation produces the same handoff line, so the reason is audit metadata and not a
branch. That is what makes it safe to let a model choose one: the worst a wrong reason does
is mislabel a conversation a person was always going to take.

`multiple_products` escalates rather than quoting each product, which is not what case 18
eventually wants. Quoting two products is a turn that calls the engine twice and is not
built; escalating is the honest interim, and it is one enum value rather than a feature.

A quote whose attributes the loaded catalog cannot express now escalates
`unsupported_option` instead of being folded into `ambiguous`. `readIntent` returns null for
it, because a quote the catalog cannot express is not the same as no quote at all.

`needs_designer` is left with no producer. The seed carries a `design` add-on at a price the
owner typed, so a customer who wants the card designed is quotable, and an escalation that
fights a row in the list would be a worse answer than the list's own. It gets a producer when
a case exists that the add-on does not cover.

## Amendment, 2026-09-12: one reason both ends own

`out_of_catalog` is now offered to extraction as well, which this ADR's own decision said not
to do. What changed is that the catalog stopped being one family.

The `family` enum offers the families the shop loaded, three of the list's thirty eight, per
ADR 0005. So a message naming any of the other thirty five comes back `family: null`, which is
the identical answer a message that named no product at all comes back as. The turn cannot tell
them apart, and it asked "qué querés imprimir" to a customer who had just said "gigantografía",
reaching a person only on the turn after that.

Only a reader of the words can separate those two, which is this ADR's test, and it is the test
that decides rather than which end already had a producer. The engine keeps raising it for a
family it has no config for, and the turn maps the reason to the sentence for a thing the shop
does not have rather than the one for a thing it has to check.

The cost is a reason a model can raise about a product the shop does print but phrased in a way
it did not recognise: one quote escalated that the catalog could have answered. Per this ADR's
own consequence, the worst a wrong reason does is mislabel a conversation a person takes, and
the escalation rate is what measures it.
