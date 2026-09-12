# 3. The price list is already final, and money is one branded integer

Date: 2026-09-12

## Status

Accepted. It needs one confirmation from Javier, which does not change the shape.

## Context

`seed/business-cards.json` was loaded with `vat_included: false`, so the engine grossed every
row up by 21%. A 100 card job left the engine at 14.641 against a list that says 12.100.

In Argentina a shop does not publish a price without tax. The list the owner typed is what he
charges. Grossing it up again quotes 21% over his own price, in every single conversation.
That is the same class of failure that got the previous bot switched off, and it fails in the
direction the customer notices at the counter.

The pull in the other direction is real: a print shop's list to businesses is often net plus
IVA, and twenty one families are still unloaded. Some of them may well be net.

## Decision

Prices are final. `vatIncluded` stays on the family, so a family whose list is net can still
be loaded, and `totalOf` grosses up only that family. `vatRate` stays beside it.

Money is one branded type, `Ars`, whole pesos, always final. There is no `NetArs`. A raw
number does not typecheck as money, and the only way to make one is `ars()`, which rejects
centavos and negatives.

## Consequences

`seed/business-cards.json` flips to `vat_included: true`, and every expected amount in
`docs/pricing-cases.md` drops by 21%. Lane B owns both.

Ticket B6 changes meaning. "No amount leaves the engine without VAT" becomes "no amount
leaves the engine that is not the final number", and its test is that `totalOf` returns the
list amount unchanged.

The one brand is the part that is hard to reverse. If a net family arrives, the amounts in
its rows are net and the brand no longer describes them. The flag is what saves it: rows stay
as the owner typed them, and only `totalOf` knows the difference.
