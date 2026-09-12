# Pricing cases

What `priceFor` must do, case by case, agreed before the code exists. Amounts come from
`seed/business-cards.json` and are the amounts the owner typed, which are **list prices**: the
list is net. Every result below is the final price, the list amount with VAT applied once at
the end. See ADR 0020, which reversed ADR 0003's premise and kept its shape.

Quoted strings are what Dante says to a customer, so they are in Spanish. Everything else
here is English, per the rules of the day.

## Exact match

| # | Intent | Result |
|---|---|---|
| 1 | 1000 cards, illustration 350g, colour front and grayscale back | `bc_offset_1000_4_1`, lists 45.000, quotes **54.450**, valid 15 days |
| 2 | 100 cards, special paper, front only | `bc_special_100_front`, lists 12.100, quotes **14.641** |

## Quantities the list does not carry

| # | Intent | Result |
|---|---|---|
| 3 | 700 cards, illustration 350g, 4/1 | escalate `unsupported_quantity`. The list carries 100, 200, 500 and 1000 and nothing between them |
| 4 | 1500 cards | escalate `unsupported_quantity` |

Extraction parses a quantity against the values the loaded rows carry, so 700 never reaches
the engine at all. The engine still answers for itself, because it is called by more than one
thing and a rule enforced in one place only is a rule waiting to be skipped.

## Missing attributes

The family declares `ask_order`: quantity, paper, sides, finish.

| # | Intent | Result |
|---|---|---|
| 5 | "cuánto 1000 tarjetas" | `ask` paper, sides and finish in one message, in `ask_order` |
| 6 | customer answers paper only | `ask` **only** sides and finish. Never re-ask the paper |
| 7 | the answer still does not resolve | `ask` again. The turn escalates `missing_attribute` once it has run out of turns, and the engine never does |

`priceFor` returns `{ kind: 'ask', missing }` and nothing else. Remembering what was already
asked, and deciding that an answer which still does not resolve has run out of turns, belongs
to the turn. Case 7 is the turn's escalation, not the engine's.

## Modules

A standard card is one module. A larger piece occupies several, price is module price times
module count, and the module discount applies after the multiplication. Percentages compound.

| # | Intent | Result |
|---|---|---|
| 8 | card 15 x 5 cm | 75 cm² / 42.5 = 1.76 → **2 modules**, no discount, the bracket starts at 3 |
| 9 | large card 10 x 15 cm, 1000 units, illustration 350g 4/1 | 150 / 42.5 = 3.53 → **4 modules** → 4 x 45.000 = 180.000, −10% = 162.000 net, quotes **196.020** |
| 10 | a piece of 13 modules or more | −25%, the last bracket |

Dante states the derivation: *"entra en 4 módulos"*. A human must be able to catch the error
by reading the reply.

**Open:** the seed declares the module size but no module price. These cases read the module
price as the matching standard row. Confirm before B5.

## Add-ons and discounts

An add-on is named by its group, not by its row. The list prints one Laminado column across
four sale rows, and three Puntas redondeadas rows keyed by quantity, so which row applies is
a function of the group and the job. `QuoteIntent.addOns` carries the groups the family
declares: `lamination`, `design`, `extra_cut`, `label_perforation`, `rounded_corners`,
`circular_cut`. A group with no row for this job escalates rather than picking the nearest.

| # | Intent | Result |
|---|---|---|
| 11 | 100 cards, special, front, with lamination | 12.100 + 5.100 = 17.200 net, quotes **20.812**. Not 14.641 + 6.171: VAT is applied once to the whole net, not per line |
| 12 | a finish the column shows as a dash | escalate `no_match`. A dash means the finish is not offered, there is no row |
| 13a | 100 cards, illustration 300g, 4/0 | lists 10.300, quotes **12.463**. The two plain-illustration discount rows are NOT applied: the column price reads as already discounted |
| 13b | the same, with the named flag on | the discount rows come off. One flag, and both sides have a test |
| 14 | "¿me hacés precio si llevo varias?" | escalate `commercial_discount`. Extraction's call, never the engine's: it returns a `fact` or `other` intent, never a quote. Tested in A5, not here. See ADR 0012 |

## Sizes without a unit

The family declares its module in centimetres, so a bare size reads as centimetres. An
explicit unit that contradicts the family is asked about, never guessed.

That question is extraction's, like cases 14 and 17, and never the engine's. `Size` is
`{ widthCm, heightCm }` and carries no unit, so by the time `priceFor` sees a size there is
no contradicting unit left to read: extraction either resolved it or never built the `Size`.

## Everything else

| # | Intent | Result |
|---|---|---|
| 15 | a family with no rows loaded | escalate `out_of_catalog`: *"eso no lo tengo cargado, te delego con un humano"* |
| 16 | an intent matching two rows | escalate `ambiguous`. The engine never picks one |
| 17 | "el IVA es obligatorio?" | escalate `vat_question`. Also extraction's call: `priceFor` takes a `QuoteIntent` and never reads a customer's words. Tested in A5, not here. See ADR 0012 |
| 18 | two products in one message | quote each separately. The turn calls the engine once per product |
| 19 | anything priced by the metre | escalate. No such family is loaded, and the roll width is still missing |
| 20 | a piece of 500 x 300 cm | escalate. It works out to 3530 modules, which is a billboard, not a card. The ceiling is 50 modules and lives in config |

## Invariants

Every quote is a whole number of final pesos and carries its 15 day validity. The list is
net, so a quote off a single row is the amount the owner typed plus 21%. The engine assembles
the whole net first, on modules, add-ons and list discounts, then applies VAT once and rounds
once, at the very end. So the final price of a job with an add-on is not the sum of two grossed
amounts, and case 11 is the example worth reading twice.

`vatIncluded` stays on the family, and it is what made ADR 0020 a data change rather than an
engine change. `parsePriceList` reads it off the list's own header and throws rather than
default, so no family loaded from that file can arrive with the flag guessed by a person. That
is the actual lesson of ADR 0020: the premise a source in hand can check is not a premise to
argue.

## The ten cases the ticket asks for

`test/domain/business-cards-cases.test.ts` is ticket B8: ten cases for the loaded family.

The ticket asks each case to name the real conversation it came from. The shop's WhatsApp
history is not in this repo, so no case claims one. Each names the source it actually has —
the owner's worked examples, the demo script, the rules written into the list, or the ADR
that settled it. If the history arrives, what it would change is how a customer phrases a
request, never what an amount should be: those come from the list.

