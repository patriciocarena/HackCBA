# Lessons, DAN-17

A switch arm nothing can reach reads as a rule that is enforced. `readIntent` mapped an
`admin_edit` answer to `other`, so `resolve`'s `not_authorized` case was dead and a customer
telling the shop to raise its prices escalated as merely unclear. The test passed because it
asserted the escalation and not the reason. Assert the reason, or do not have one.

Two arguments that each carry the same identity need to be checked against each other. The
turn took a message and a `TurnState`, both carrying a `conversationId`, and nothing made
them agree. Structural isolation is structural only while every reader keys on the structure;
the unit that owns the rule is the unit that should refuse the mismatch.

A guard on the money path is cheaper when it is derived rather than declared. The reply may
carry exactly the amounts the deterministic answer carries. One line covers a price, an ask,
a fact whose owner-typed value contains a price, and an escalation, and the branch with no
amount is the one a prompt alone never holds.

`main` moved twice during this lane. `git diff main` against a stale local ref reported two
sibling lanes' changes as if they were mine. Fetch and rebase before reading your own diff.

TDD slipped once: the cycle for the introduction was written green because the previous
cycle's implementation had already covered it. The tests were checked by mutating the
implementation and watching them fail, which is the recovery, not the substitute.
