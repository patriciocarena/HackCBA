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

Missing: his confirmation.

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

Assumption: 21% rate in config, rounded to the peso, and the number Dante writes is always
the final one with VAT. Any question about whether VAT is mandatory escalates.

This is already settled in ADR 0003 in the client repo. It is not a hackathon assumption. It
sits here so nobody reopens it at three in the morning.

## 8. Tone and name

The agent is called Dante. Neutral rioplatense voseo, not a fake Tucumán accent. The owner
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
