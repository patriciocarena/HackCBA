# Assumptions

The client has had six open data points since 2026-09-11 at 13:14. The hackathon does not
wait for them. Each assumption here is a provisional decision, flagged in the demo, that a
data point changes later. None of them needs a refactor.

## 1. Catalog load order

Assumption: business cards first, and only business cards.

Missing: the query volume per family, which the three people answering WhatsApp know. The
plan bets that cards and large format banners take over half. Cards are enough for the
vertical because the family has a module, add-ons and discounts.

## 2. Module formula

Assumption: `modules = ceil(piece area / module area)`, and the card module is 8.5 x 5 cm,
that is 42.5 cm².

It fits the three examples the owner gave:

| Piece | Area | Module | Quotient | Modules |
|---|---|---|---|---|
| Card 15x5 | 75 cm² | 42.5 | 1.76 | 2 |
| Large card 10x15 | 150 cm² | 42.5 | 3.53 | 4 |
| A4 flyer | 623.7 cm² | 150 | 4.16 | 5 |

Missing: his confirmation, and one case his three examples do not reach.

Area is not imposition. A piece 42.5 x 1 cm is 42.5 cm², which is one module by area, and it
does not fit inside 8.5 x 5 at all. Counting how the piece lands on the sheet instead,
`ceil(width / module width) * ceil(height / module height)`, gives 6 for his own 10x15
example where he said 4. So his examples are area based and area is what ships. The question
for him is the narrow one: what happens to a piece wider than the module. Until he answers,
a long thin piece is quoted low.

The module discount is no longer missing. The list quantifies it, and `seed/business-cards.json`
carries it: 3 to 5 modules -10%, 6 to 8 -15%, 9 to 12 -20%, 13 or more -25%. The list also
fixes the order: multiply the module price by the module count, then apply the discount. When
more than one percentage applies they compound, they are not summed.

## 3. Mercado Pago alias

Assumption: `DEPOSIT_ALIAS` in `.env`, with a test value visible in the demo.

Missing: the real alias. When it arrives it does not go in the repo, it goes to
`fly secrets`.

## 4. Facts

Confirmed on 2026-09-10 and ready to load:

- Hours: Monday to Friday 9 to 18:30, Saturday 9 to 13.
- Payment methods: cash, transfer, QR, all cards, payment link and e-cheq.
- E-cheq at 10 days. Any other term escalates.

Missing: address, phone numbers, delivery times per family, and what the shop does not do.

Assumption: they get loaded as `pending data`, which escalates. That is the correct
behavior. An empty fact is never filled with something plausible.

## 5. Who can change prices

Assumption: the allowlist is the Telegram ids of the four of us.

Missing: the phone numbers of the owner and the three people who answer WhatsApp. The day
they arrive, one environment variable changes.

## 6. QR or WABA

Not applicable today. WhatsApp is out of scope, so the question of which number sits on
which channel blocks nothing.

## 7. VAT

Not an assumption. 21% rate in config, rounded to the peso once at the end of the whole
breakdown, and the number Dante writes is always the final one with VAT. Any question about
whether VAT is mandatory escalates.

The list is **net**: it says so twice in its own header, in the version Javier closed on
2026-09-10. ADR 0003 argued the opposite from a general fact about Argentine print shops while
the document that settles it sat in this repo. ADR 0020 reversed the premise, kept the shape,
and is applied. `parsePriceList` now reads the flag off the header and throws rather than
default, so no family can arrive with it guessed.

It sits here so nobody reopens it at three in the morning.

## 8. Tone and name

The agent is called Dante. Neutral rioplatense voseo, not a fake cordobés accent. The owner
picked the name on 2026-09-09 and it is his brand.

Everything Dante says to a customer is in Spanish. Everything else in this repo is in
English.

## 9. Business card rows that the list leaves open

The cards family is loaded in `seed/business-cards.json`, off `lista-precios.html`. Two rows
in it are a reading, not something the owner said.

Papel ilustración común 300g. The list gives it as two discount rows, 1.800 for 100 cards and
3.400 for 200, under a heading of its own. The legend says a discount row subtracts from the
product above it, and the product above is the two column table. The seed subtracts from the
ilustración 300g column, not from the special paper one, because común reads as the plain
version of that same paper. If that is backwards, four prices are wrong and nothing else moves.

350g against 300g. The offset heading says ilustración 350g, and the two 4/1 rows under it say
300g. The seed takes the paper from the heading and keeps the discrepancy in `source_note`. It
changes no amount.

Both go to Javier with the next batch of questions.

## 10. An add-on on a piece that takes several modules

Assumption: an add-on is charged once for the job, whatever the module count. Four modules of
1000 cards with an extra cut is four module prices plus one cut.

It is right for the ones priced per job, like Diseño. It is doubtful for the ones priced by
what they cover: Laminado on a six module piece laminates six times the area for the price of
one. The list prices lamination against a sale row and says nothing about size, because the
list was written for cards the size of cards.

`test/domain/review-fixes.test.ts` pins the current answer so changing it is a decision. The
question for him: does a finish that covers the piece scale with the modules.

## 11. Two ring-size ladders in one table

`Anillados` prints plastic and metal ring sizes as two independent ladders inside one HTML
table, and the metal ones carry a decimal comma: `Nº 9,5`. The parser reads that row as
`[2700, 95, 3500]`, where the 95 is a ring size sitting in a price position. `Nº 25` appears in
both ladders at different prices.

No assumption is made. Nothing loads this family, and deciding what two ladders in one table are
is a modelling question, not a parse. ADR 0022 records why it was left alone.

The question for Javier: are plastic and metal two families, or one family with a material
attribute? The prices say two, because the same number means a different ring.
