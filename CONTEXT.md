# Dante

The language of the catalog and the pricing engine. The long product glossary lives in the
client repo; this file holds only the terms lane B decides.

## Language

**Family**:
A group of products the shop prices as one table, such as business cards. A family declares
its unit, its module, and the ordered list of attributes a quote needs.
_Avoid_: Category, product type

**Item**:
One priced row of a family. Every amount Dante says traces back to exactly one item.
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
