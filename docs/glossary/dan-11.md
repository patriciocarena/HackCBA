# Storage words, from DAN-11

Terms this lane decides. They belong in `CONTEXT.md`; they live here so four lanes do not
edit one file. See ADR 0006.

**Tier**:
Which of the three kinds of row an item is: a sale row, an add-on or a list discount. It is
the `tier` column because `kind` already names three other things in the contracts. The seed
calls it `kind` and the loader maps it.
_Avoid_: Kind, type, class

**Attribute bag**:
The attributes an item is priced by, as one JSON object: quantity, paper, sides, finish. A
sale row is identified by its family, its tier and its bag, and by nothing else.
_Avoid_: Spec, variant, options

**Canonical bag**:
An attribute bag with its keys sorted and its whitespace gone. Only a canonical bag is
written, because SQLite cannot sort JSON keys and two orders of the same bag would be two
identities for one row.
_Avoid_: Normalised attributes, sorted json

**Price version**:
One row recording what an item cost from a moment on, and the price edit that caused it. The
current price is the latest version. There is no other place a price is kept.
_Avoid_: Price history, audit row

**Catalog item**:
An item together with its current price, which is what the engine reads. An item with no
price version is not a catalog item, so it cannot be quoted.
_Avoid_: Priced item, row with price

**Claim**:
Writing an update id into `telegram_updates`. The insert is the claim, so the first delivery
of an update claims it and every retry reads it as already seen.
_Avoid_: Lock, dedupe key, idempotency token
