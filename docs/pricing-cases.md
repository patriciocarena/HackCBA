# Pricing cases

What `priceFor` must do, case by case, agreed before the code exists. Amounts come from
`seed/business-cards.json`. Net prices are grossed up at 21% and rounded to the peso.

Quoted strings are what Dante says to a customer, so they are in Spanish. Everything else
here is English, per the rules of the day.

## Exact match

| # | Intent | Result |
|---|---|---|
| 1 | 1000 cards, illustration 350g, colour front and grayscale back | `bc_offset_1000_4_1`, 45.000 net, **54.450** gross, valid 15 days |
| 2 | 100 cards, special paper, front only | `bc_special_100_front`, 12.100 net, **14.641** gross |

## Quantities the list does not carry

| # | Intent | Result |
|---|---|---|
| 3 | 700 cards, illustration 350g, 4/1 | escalate `no_match`. The list carries 100, 200, 500 and 1000 and nothing between them |
| 4 | 1500 cards | escalate `no_match` |

## Missing attributes

The family declares `ask_order`: quantity, paper, sides, finish.

| # | Intent | Result |
|---|---|---|
| 5 | "cuánto 1000 tarjetas" | ask paper, sides and finish in one message, in `ask_order` |
| 6 | customer answers paper only | ask **only** sides and finish. Never re-ask the paper |
| 7 | the answer still does not resolve | escalate `missing_attribute` |

Remembering what was already asked belongs to the turn, not to `priceFor`.

## Modules

A standard card is one module. A larger piece occupies several, price is module price times
module count, and the module discount applies after the multiplication. Percentages compound.

| # | Intent | Result |
|---|---|---|
| 8 | card 15 x 5 cm | 75 cm² / 42.5 = 1.76 → **2 modules**, no discount, the bracket starts at 3 |
| 9 | large card 10 x 15 cm, 1000 units, illustration 350g 4/1 | 150 / 42.5 = 3.53 → **4 modules** → 4 x 45.000 = 180.000, −10%, 162.000 net, **196.020** gross |
| 10 | a piece of 13 modules or more | −25%, the last bracket |

Dante states the derivation: *"entra en 4 módulos"*. A human must be able to catch the error
by reading the reply.

**Open:** the seed declares the module size but no module price. These cases read the module
price as the matching standard row. Confirm before B5.

## Add-ons and discounts

| # | Intent | Result |
|---|---|---|
| 11 | 100 cards, special, front, with lamination | 12.100 + 5.100 = 17.200 net, **20.812** gross |
| 12 | a finish the column shows as a dash | escalate `no_match`. A dash means the finish is not offered, there is no row |
| 13 | 100 cards, illustration 300g, 4/0 | 10.300 net, **12.463** gross. The two plain-illustration discount rows are NOT applied: the column price reads as already discounted. One named flag flips it, and both sides have a test |
| 14 | "¿me hacés precio si llevo varias?" | escalate. A commercial discount is never the engine's call |

## Sizes without a unit

The family declares its module in centimetres, so a bare size reads as centimetres. An
explicit unit that contradicts the family is asked about, never guessed.

## Everything else

| # | Intent | Result |
|---|---|---|
| 15 | a family with no rows loaded | escalate `out_of_catalog`: *"eso no lo tengo cargado, te delego con un humano"* |
| 16 | an intent matching two rows | escalate `ambiguous`. The engine never picks one |
| 17 | "el IVA es obligatorio?" | escalate `vat_question` |
| 18 | two products in one message | quote each separately. The turn calls the engine once per product |
| 19 | anything priced by the metre | escalate. No such family is loaded, and the roll width is still missing |
| 20 | a piece of 500 x 300 cm | escalate. It works out to 3530 modules, which is a billboard, not a card. The ceiling is 50 modules and lives in config |

## Invariants

Every quote is gross, rounded to the peso once after VAT, and carries its 15 day validity.
No amount ever leaves the engine net.
