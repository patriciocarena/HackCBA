# Dante

The language of Dante. The long product glossary lives in the client repo; this file holds
the terms this repo decides.

## Language

**Family**:
A group of products the shop prices as one table, such as business cards. A family declares
its unit, its module, and the ordered list of attributes a quote needs.
_Avoid_: Category, product type

**Item**:
One priced row of a family, named by its slug. Every amount Dante says traces back to a
breakdown whose every line names an item the owner typed.
_Avoid_: Product, SKU, row

**Sale row**:
An item that carries the base price of a job.
_Avoid_: Base item, main row

**Add-on**:
An item that adds to a sale row, such as lamination. Its price belongs to the sale rows it
applies to, not to the family, because the same finish costs differently on different rows.
_Avoid_: Extra, option, upsell

**List discount**:
An amount the price list itself subtracts from named sale rows. It is data the owner typed,
so the engine applies it.
_Avoid_: Promo, deal

**Commercial discount**:
A reduction that depends on who is asking or how they pay. It is not in the list, so the
engine never applies it and the conversation goes to a person.
_Avoid_: Negotiated price, special price

**Module**:
The physical unit the shop prints on, 8.5 x 5 cm for business cards. A piece larger than the
module occupies several modules and the excess is cut.
_Avoid_: Plate, sheet, tile

**Module discount**:
The percentage the list takes off once a piece occupies several modules. Percentages compound
when more than one applies; they are never summed.
_Avoid_: Volume discount, bulk rate

**Escalate**:
Hand the conversation to a person because the engine is not certain. It is the correct
outcome, not a failure, and its rate measures catalog coverage.
_Avoid_: Fail, fallback, error, handoff

**Fact**:
A piece of shop information Dante is allowed to state, such as opening hours. What is not
loaded as a fact, Dante does not know, and not knowing it escalates.
_Avoid_: Info, knowledge, context

**Quote**:
An amount Dante states to a customer. It is gross, final, and valid for a declared window.
A quote is not an order until the customer accepts.
_Avoid_: Estimate, budget, price

**Intent**:
What a message asked for, read by the extraction phase and nothing else. It is one of four
kinds: a quote, a fact question, a price edit dictated by the owner, or other. Extraction
reports what it heard. It never reports what a family requires.
_Avoid_: Request, query, command

**Attribute**:
A property of a quote the family declares, such as paper. The family also declares the
allowed values, so an attribute no family declares cannot be extracted at all.
_Avoid_: Field, parameter, option

**Ask**:
The outcome where the engine knows which attributes the family still needs. Dante asks for
all of them in one message, in the family's order, and never re-asks one already answered.
An attribute still missing after the ask escalates.
_Avoid_: Clarify, follow up, prompt

**Breakdown**:
The lines an amount is made of: the base item, the module factor, the module discounts, the
add-ons and the list discounts. It is the audit trail, and it is what a quote and an order
store. A human reading it can catch the error.
_Avoid_: Calculation, detail, line items

**Final price**:
An amount in whole pesos that the customer pays. Every amount in this repo is final. The
shop's list is already final, so there is nothing to add to it.
_Avoid_: Gross, net, subtotal, price plus VAT

**Order**:
An accepted quote, with its breakdown copied. The copy is why editing the list never moves an
amount already quoted.
_Avoid_: Sale, job, purchase

**Price edit proposal**:
A change to the list the owner dictated, resolved into the exact rows it touches with their
old and new prices, and waiting for him to confirm. It changes nothing until he does.
_Avoid_: Update, edit, change request

**Conversation**:
One chat with one person in one role. The same person writing as an admin and as a customer
holds two conversations, and neither can read the other.
_Avoid_: Thread, session, chat

**Turn**:
One customer message and Dante's reply to it. The turn remembers what was already asked and
whether the conversation escalated. The engine remembers nothing.
_Avoid_: Exchange, round, interaction

**Untrusted text**:
Anything written by someone outside the team: a message, a transcript, a caption. It is data
that Dante describes, never an instruction it follows.
_Avoid_: Input, user text, prompt
