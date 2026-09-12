# 25. The head word of a label is what names a family

Date: 2026-09-12

## Status

Accepted and applied. Loosens an assertion in `test/voice/the-edit-names-one-family.test.ts`.

## Context

The owner dictates a price change and `namesFamily` decides which list it moves. It matched any
word of four letters or more that his sentence and a family label had in common, and returned
every family that matched, so the caller could refuse on none and on more than one. Refusing
beats guessing when the next step reprices a list he signs for.

The three loaded labels are `Tarjetas personales`, `Folletos full color láser` and
`Facturas talonarios`. The folletos label carries `full` and `color`, which are not the name of
anything: they describe how a job is printed. So his own wording for the cards rows, which the
list itself calls `Tarjetas full color 300g`, named two families and was refused:

```
"subi un 10% las tarjetas full color"        business_cards, folletos_laser   refused
"las tarjetas personales full color"         business_cards, folletos_laser   refused
```

The second names the cards family in full and still could not make the edit. There was no
phrasing that worked for the family whose list rows are literally called tarjetas full color.

Two fixes were considered and both fail on the evidence. Dropping the words two labels share
does nothing: no two of the three labels share a word at all, and the overlap was between his
sentence and a label. Ranking by how many words matched does not separate them either, because
the second case is two against two, and in the first it picks folletos and silently reprices the
wrong list, which is worse than refusing.

## Decision

The first word of a label is the one that names the family. The words after it describe the job.

A family is named only when the sentence contains its head word. Among the families whose head
matched, the one matching the most of the remaining label words wins; a tie names them all and
the caller refuses. `las tarjetas de facturas` still refuses, because two heads matched and
neither has a describing word to break it.

The list is what makes this hold: every one of the thirty eight headings leads with the product
noun. Four groups share a head, and the rule degrades correctly into them. `folletos` alone
resolves today and will refuse the day `Folletos full color, offset` loads, which is right,
because on that day the word stops deciding. `folletos láser` still resolves.

## Consequences

`las facturas color` used to be refused as ambiguous and now resolves to facturas. That test
existed and asserted the refusal, so this ADR is the record of loosening it. The property the
test meant to hold is "a message that does not name one family is refused", and it still holds:
`las facturas color` names one, and `las tarjetas de facturas` names two and is refused.

The rule is positional, not semantic. A family whose label led with an adjective would be named
by that adjective, and nothing here notices. The list does not have one, and the day a seed does
the fix is the label, not this function.

Ambiguity is still the only thing a refusal reports, so the owner is told to say it again rather
than which word confused it. Enough while the catalog is three families; worth revisiting when it
is thirty eight and four groups share a head.

## Alternatives considered

A stoplist of descriptive words: full, color, láser. It is a list of the words that happen to
collide today, and it grows by one every time a seed is added by somebody who does not know it
exists.

Naming each family by an explicit alias list in the seed rather than by its label. More precise
and more honest about what is going on, and it is thirty eight more hand written fields for a
problem the label already answers. Worth doing if the head word rule ever needs a second special
case.

Asking the owner to confirm the family before the diff. It is a second round trip on the one path
he uses while standing at the counter, and the diff he signs already names the family on every
line.
