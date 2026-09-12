# 6. The catalog schema: one canonical bag and a partial identity index

Date: 2026-09-12

## Status

Accepted. ADR 0001 stands unchanged.

## Context

A3 asks for idempotent DDL over LibSQL for families, items, facts, orders, price edits and
price versions.

Three things had to be settled before a column could be written.

An item is identified by its family, its attribute bag and its tier, and the bag is JSON. A
unique constraint over JSON needs a deterministic serialisation. Verified against the client
this repo pins: subqueries are prohibited in generated columns and in index expressions, so
no SQL expression can sort the keys of an object. `json()` minifies whitespace and preserves
key order.

The seed cannot carry a total uniqueness constraint over those three columns. Counted in
`seed/business-cards.json`: six add-on rows carry an empty bag, three carry `{quantity:1000}`,
and both list discount rows carry an empty bag. A sale row is identified by its bag. An add-on
is identified by the sale rows it applies to.

## Decision

`tier` is the column. `kind` already means three different things in `src/domain/types.ts`,
and the seed's `kind` maps to it on load. `ITEM_TIERS` lives in `src/catalog/tiers.ts` until
the orchestrator promotes it to the contract file.

`items.attributes` is written canonical, keys sorted, by `canonicalAttributes`. The virtual
generated column `attributes_key` is `json(attributes)`, and the unique index is
`(family_slug, tier, attributes_key) WHERE tier = 'sale'`. The writer supplies key order
because SQLite cannot; the column supplies everything else, so no formatting difference can
ever open a second identity for one row.

A price lives in `price_versions` and nowhere else. `items` has no price column. The
`catalog_items` view exposes the latest version of each item, so an item with no price is not
in the catalog at all and asking for it escalates.

`price_edit_lines` keeps `old_price` and `new_price` anyway. The proposal is a signed diff,
and the owner has to still see what he signed after the list moves, for the same reason an
order copies its breakdown.

A table holds a relationship between rows. JSON holds a value object read whole. So
`item_applications` and `price_edit_lines` are tables, and `families.attributes` and
`families.module_discounts` are columns.

`unit` is `NOT NULL` on `families` and nullable on `items`. A `CHECK (unit IN (...))` passes on
NULL, because `NULL IN (...)` is NULL and a CHECK only fails on false, so one helper builds
both the default and the override.

The journal opens in WAL. ADR 0001 said it already did; it opens in delete mode, and WAL is
what a second reader and any future replica need.

## Consequences

Reads go through `catalog_items`, not `items`. Selecting from `items` gets a row with no
price, which is a bug that looks like data.

The canonical bag is a writer's obligation the database cannot check. `canonicalAttributes` is
the one place it is met, and the seam is small enough to keep it that way.

The partial index means a duplicated add-on is caught by its slug, not by its identity. That
is a weaker guarantee than sale rows get, and it is the guarantee the loaded list allows.

Replication stays where ADR 0001 left it. Durability is the Fly volume and its snapshots, and
a replica is lane A1's deployment decision, not this schema's.

## Alternatives considered

A plain `attributes_key` column written by the loader. Nothing stops a writer putting a
non-canonical value in it, and it duplicates the bag it is derived from.

A total unique index with the applies-to set folded into the key. It turns a three column
identity into a four column one to hold rows whose identity is not their bag.

`price` on `items` with `price_versions` as an audit trail beside it. Two sources for one
number, and the first edit that writes one and not the other is silent.

