# 20. The list is net, and the seed still says it is final

Date: 2026-09-12

## Status

Accepted and applied, on 2026-09-12, after the demo. Supersedes the premise of ADR 0003, not
its shape.

The Decision below reads as future tense because it was written before the flip. It describes
what was done. The one estimate in it that was wrong is the size: thirty two test expectations
turned out to be twenty eight, in twelve files, because `totalOf` grosses up once on the whole
net rather than per line, so nothing that asserts a row price or an add-on line moved.

## Context

ADR 0003 flipped `seed/business-cards.json` to `vat_included: true` and argued from a general
fact about the country: "in Argentina a shop does not publish a price without tax". It closed
by saying it needed one confirmation from Javier, "which does not change the shape".

That confirmation exists. It is in the price list itself, in the version he closed on
2026-09-10, and it says the opposite. `lista-precios.html` carries it twice:

> **Los precios no incluyen IVA.** Se cotiza siempre como precio más IVA.

and again in the second round of clarifications, as item (a):

> IVA. Los precios son sin IVA. Se agregó al encabezado.

So the general fact is true about most shops and false about this one. The list is net.

The cost is a quote 21% under what the shop charges, in every conversation. The 1000 card
offset row leaves the engine at $45.000 against a job Multimpresos bills at $54.450. It is
the same class of failure as the bot this replaces, smaller, and pointed the other way: the
old one quoted over and embarrassed the shop, this one quotes under and the shop eats it or
argues with a customer holding a screenshot.

Rule 4 is not what is wrong here. "Prices include VAT. One final number. Never plus VAT" is
about what Dante says, and it survives either flag: Dante still states one gross number and
never "más IVA". What changes is only which number that is.

## Decision

`vat_included` flips to `false` for business cards, after the hackathon demo and before phase
one ships on 2026-09-16.

Not before the demo, and this is the whole reason the ADR exists rather than a commit. The
amount is load bearing in twenty two files: thirty two test expectations, `docs/pricing-cases.md`,
both demo documents, the run sheet's every paste, and `fixtures/receipt.jpg`, which the vision
path confirms on an exact match against what the order owes. Every one of those is mechanical
and the suite catches all of them, and none of that is worth doing to a rehearsed demo with
hours left on the clock. A judge cannot detect the flag. Javier can, and Javier is not in the
room on Saturday.

No engine change. `breakdown.ts:13` already grosses up when the flag is false, which is exactly
the affordance ADR 0003 kept for this case:

> `vatIncluded` stays on the family, so a family whose list is net can still be loaded, and
> `totalOf` grosses up only that family.

ADR 0003 was right about the shape and wrong about this shop. The shape is what saves it.

## Consequences

The work, when it happens, is data and expectations: flip the seed, move thirty two expected
amounts, regenerate the fixture with `bun scripts/make-receipt.ts 54450` and move its default,
update `docs/pricing-cases.md` and the two demo documents, then `bun run eval:demo`.

Every family loaded from `lista-precios.html` from now on is net, because the header governs
the whole list and not one section. `scripts/parse-price-list.ts` reads that header rather than
taking it from a human, so family two cannot arrive with the flag guessed.

Until the flip lands, `$45.000` in the repo means a net amount wearing a gross label, and the
demo documents say `final con IVA incluido` about a number that is neither. That is the state
this ADR is here to make legible rather than quiet.

The lesson underneath it: ADR 0003 reasoned from what is usually true about Argentine print
shops while the document that settles it sat in the client repo, already answered and already
closed by the client. A premise that a source in hand can check is not a premise to argue.
