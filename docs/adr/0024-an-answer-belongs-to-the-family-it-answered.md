# 24. An answer belongs to the family it answered

Date: 2026-09-12

## Status

Accepted and applied. Adds a field to `TurnState`, which the rules of the day allow after H+2.

## Context

`TurnState.attributes` holds every attribute the customer has stated, merged across messages.
It exists because extraction only ever sees the message in front of it, per ADR 0019: the answer
to "¿qué terminación?" arrives as a quote carrying nothing but the finish, and without the merge
the engine asks again for the quantity, the paper and the caras it was already given. That loop
is what a conversation dies of.

With one family loaded there was no difference between "what this conversation has answered" and
"what answers this family". With three there is, and the two loaded alongside cards share the
keys that matter:

| Family | quantity | sides |
|---|---|---|
| `business_cards` | 100, 200, 500, 1000 | front, front_and_back, front_color_back_grayscale |
| `folletos_laser` | 500, 1000 | front, front_and_back |
| `facturas` | 1, 2, 4, 6, 8, 10, 20 | — |

So a conversation that moves from one to the other carries a full answer into a question nobody
asked. Driven through the real turn:

```
"1000 tarjetas ilustración 350 frente y dorso con OPP"   price
"y folletos láser?"                                      ask: ["coverage"]
"pleno"                                                  Te cotizo $298.265
```

The customer never said a thousand folletos and never said double sided folletos. `quantity` and
`sides` came from the tarjetas they were quoted two messages earlier, the engine found `missing`
empty, and `fl_1000_full_both` matched exactly. Rule 2 is "exact match or escalate", and this is
neither: it is interpolation one level above the row, where the rule was not looking.

The suite did not catch it. `test/conversation/many-families.test.ts` covered a follow up within
one family and a foreign value inside a single message, which the exact match rule handles. It
never switched families across two messages.

`CONTEXT.md` already had the answer, under **Attribute**: "a property of a quote the family
declares". A property the family declares is answered for that family. The code read **Ask**'s
"never re-asks one already answered" as a fact about the conversation instead.

## Decision

The attribute bag belongs to the family, and so does the record of what has been asked. A
message that names a family different from the one the conversation was about clears both.

Only a switch clears them. A conversation with no family yet is one that was asked which
product, and the quantity said in the same breath is still this job's: `"cuánto 1000"` then
`"tarjetas"` keeps the 1000. The condition is `was !== null && now !== null && was !== now`.

`asked` moves with the bag rather than staying conversation wide. `settle` turns a second ask
into `missing_attribute`, and ADR 0011 makes that escalation the end of the conversation. Kept
across a switch, the first honest question about the new product is the second time `sides` was
asked, and the customer's second product ends the chat.

A third thing was inside the bag and had to come out. The ADR 0010 guard lets a reply repeat a
bare number the customer stated themselves, because repeating their own word invents no price,
and it read that vocabulary off the bag. Clearing the bag took "1000" out of the writer's
vocabulary while Observational Memory still had it, so "Igual que las 1000 tarjetas, ahora en
folletos" was refused and the conversation went silent. `TurnState.stated` now holds every value
the customer has said, in any message and for any family, and nothing clears it. What the
customer said is a fact about the conversation; what prices the family is a fact about the quote.

## Consequences

A customer who means "the same thousand, but in folletos" is asked the quantity again. That is
one extra question, and it is the price of not quoting a number nobody said. There is no way to
tell the two customers apart from the message, and only one of the two mistakes is a wrong price
on a phone.

`stated` grows for the life of a conversation and is never pruned. It holds attribute values, so
it is bounded by how many things a person says about print jobs, and the state is already in
memory per conversation.

Widening the guard's vocabulary to the whole conversation is a loosening, and it is deliberate.
The set was already "this turn's answer, the customer's own message, and the amounts the engine
gave", and every value in `stated` was read under a closed enum from a fenced message. What it
does not widen is the pesos rule: a `$` amount still has to come from the engine.

## Alternatives considered

Keeping the bag and filtering it on a switch to the keys the new family does not declare. Same
outcome, because the engine ignores an undeclared key anyway, with a rule that reads as though it
does something.

Keying the bag by family, so switching back to tarjetas restores its answers. Better for a
customer who compares two products and returns to the first, and it is the shape to grow into.
Not now: it is more state for a case nobody has seen, and the wrong answer under it is the same
wrong price if the clearing rule is ever wrong.

Leaving the bag alone and having `priceFor` ignore attributes the family did not ask for in this
conversation. It puts conversation memory inside a pure function whose whole value is that it has
none.
