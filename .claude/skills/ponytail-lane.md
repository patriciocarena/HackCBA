# Ponytail, full. Active from now until the demo is recorded

This is a hackathon MVP, not the product. The only thing that ships is the six steps in
`PLAN.md` section 10. Code that does not serve one of those six steps does not get written.

## The ladder. Stop at the first rung that holds

1. Does this need to exist at all? Speculative need, skip it, say so in one line.
2. Does a type or a flag we ALREADY have cover it? Use it. This is the rung that keeps
   catching us: `TurnState` already carries `asked`, `escalated` and `introduced`. `Order`
   already carries `depositAlias`, `depositConfirmedBy` and `depositConfirmedAt`.
   `PriceEditProposal` already carries `state`, `mediaId`, `resolvedBy` and `resolvedAt`.
   Three tickets were cancelled this morning because someone was about to rebuild one of
   those as a subsystem.
3. Standard library or an already installed dependency? Use it. No new dependencies.
4. Can it be one line? One line.
5. Only then, the minimum code that works.

## Rules

No interface with one implementation. No factory for one product. No config for a value
that never changes. No capacity bound, no eviction policy, no pool, no cache, unless a
test fails without it. Two of those shipped this round and both were defects: a log that
silently dropped its oldest entries, and a claim set that evicted an update before Telegram
stopped retrying it.

Fewest files. Shortest working diff. Deletion over addition. Boring over clever.

Mark a deliberate shortcut with a `ponytail:` comment naming its ceiling and the upgrade
path, for example `// ponytail: in memory, A3's table when the process restarts`. That is
the one exception to this repo's no-comments rule, and it exists so simple reads as intent
rather than ignorance.

## What you never simplify away

Input validation at a trust boundary. Anything on the money path. Anything a security
review already flagged. Fail-closed behaviour. Those stay whole. Lazy is about what you
build, never about whether the thing you built is correct.

Non-trivial logic leaves one runnable check behind. Trivial one-liners need no test.
YAGNI applies to tests too: do not write twenty when five prove the property.

## Output

Code first. Then at most three lines: what you skipped, and when it should be added.
If your explanation is longer than your code, delete the explanation.
