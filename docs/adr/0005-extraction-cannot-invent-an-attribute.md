# 5. Extraction returns a discriminated intent over a schema generated from the catalog

Date: 2026-09-12

## Status

Accepted.

## Context

The draft contract had one `Intent` shape with an open attribute bag: `family`, a
`Record<string, string | number>`, and a list of what was missing. Everything the product does
had to fit in it. A fact question, an owner dictating a price change, and a prompt injection
all arrived as a quote with a null family.

The bag was already leaking. `priceFor` detected a VAT question by searching attribute values
for the string "iva", and read the lamination add-on under three different spellings, because
nothing stopped the model from writing a key nobody declared.

An open record is exactly where an invented attribute enters the system with a type on it.

## Decision

`Intent` is a discriminated union over four kinds: quote, fact, admin_edit, other. The
resolution phase switches on the kind rather than guessing from the content.

The extraction schema is generated per family from the loaded catalog. `quoteIntentSchema`
closes the attribute object to the names the family declares and the values it lists, so an
attribute no family declares fails to parse. Size and add-ons are first class fields, because
the seed declares neither as an attribute and both are needed to price a job.

## Consequences

An unloaded family cannot produce an attribute, so the exact match rule is enforced before
the engine runs rather than inside it.

The schema is built at runtime, not written by hand, which keeps client values out of `.ts`
and satisfies merge gate 3.

The cost is that extraction needs the catalog loaded before it can parse. The turn resolves
the family first, then builds the schema for it. A message naming no family we carry never
reaches a quote schema at all, and escalates.
