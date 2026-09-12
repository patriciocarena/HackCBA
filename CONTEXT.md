# Dante

The language of Dante. The long product glossary lives in the client repo; this file holds
the terms this repo decides.

## Language

**Family**:
A group of products the shop prices as one table, such as business cards. A family declares the
ordered list of attributes a quote needs. It may declare a module, and most do not. A unit
belongs to the item rather than the family, because the list prices square metres, linear metres,
units and sets in one table; the contract carries it on the family today because every loaded
family happens to have one unit.
_Avoid_: Category, product type

**Format**:
A named size a family declares and the list prices as its own row, such as A4 or 1/2 oficio. It
is an attribute. Distinct from a measurement the customer states, which the engine turns into
modules.
_Avoid_: Size, measure, dimension

**Item**:
One row of a family, named by its slug, carrying an amount or a rate. Every amount Dante says
traces back to a breakdown whose every line names an item the owner typed.
_Avoid_: Product, SKU, row

**Sale row**:
An item that carries the base price of a job.
_Avoid_: Base item, main row

**Add-on**:
An item that adds to a sale row, by an amount such as lamination or by a percentage of it such
as a triplicate surcharge. What it charges belongs to the sale rows it applies to, not to the
family, because the same finish costs differently on different rows. Its group is named within
its family and never across families: two families both say "numerado" and mean different jobs.
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
The percentage the list takes off once a piece occupies several modules.
_Avoid_: Volume discount, bulk rate

**Percentage**:
A rate the list applies to a job rather than an amount: a module discount, a discount by
quantity, or a surcharge. When more than one applies they apply one on the other and are never
summed. The list states that law once, for percentages in general, and it governs families that
have no module at all.
_Avoid_: Multiplier, factor, markup

**Escalate**:
Hand the conversation to a person because the engine is not certain. It is the correct
outcome, not a failure, and its rate measures catalog coverage. The customer is told the shop
will answer, not that a bot stopped and a person started.
_Avoid_: Fail, fallback, error, handoff

**Fact**:
A piece of shop information Dante is allowed to state, such as opening hours. What is not
loaded as a fact, Dante does not know, and not knowing it escalates.
_Avoid_: Info, knowledge, context

**Quote**:
An amount Dante states to a customer. It is a final price, valid for a declared window.
A quote is not an order until the customer accepts.
_Avoid_: Estimate, budget, price

**Intent**:
What a message asked for, read by the extraction phase and nothing else. It is one of five
kinds: a quote, a fact question, a price edit dictated by the owner, an acceptance, or other.
Extraction reports what it heard. It never reports what a family requires.
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
What an amount is made of: the base item, the module factor, every percentage that applied, the
add-ons and the list discounts. It is the audit trail, and it is what a quote and an order store.
A human reading it can catch the error, so a percentage is recorded as a percentage and not only
as the pesos it came to.
_Avoid_: Calculation, detail, line items

**List price**:
An amount the owner typed into his price list. It is net of VAT and Dante never states one.
Every amount in `seed/` and every amount the owner signs in a price edit diff is a list price.
_Avoid_: Net, cost, base price

**Final price**:
An amount in whole pesos that the customer pays. VAT is the function from a list price to it,
applied once at the end of the whole breakdown rather than line by line. Every amount Dante
says is final.
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
