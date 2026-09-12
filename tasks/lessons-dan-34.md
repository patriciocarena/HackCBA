# Lessons, DAN-34

## A vertical test that wires the seam itself proves the module, not the wiring

The first end to end test built the composition by hand: webhook, `receiptTurn`,
`customerTurn`, and `findOrder: sale.orderFor`. It went quote, accept, photo, confirm and
reached `deposit_confirmed`, and it was green. It also could not fail for the reason the
ticket was about, because the test is the thing that decided `findOrder` points at the sale
port. A `route.ts` that built a second `inMemorySale` would have kept it green.

The fix was a second test that wires nothing and drives `telegramWebhookRoute` with a fetch
stub. Mutating `route.ts` three ways then fails it.

The general shape: when the risk is a wiring mistake, the test has to read the wiring rather
than supply it. A test that passes the dependency under test is a unit test wearing an end
to end costume.

## Mutation testing found the assertion that had no teeth

Three mutations went against the first vertical test. An empty parallel store failed it. A
copy of the order with a different id failed it. A copy pinned to `deposit_pending` passed,
because every assertion in the test was about ids and the recorded count, and a stale state
copy gets both right.

That third one is a real defect: it is scope item 3, an order not awaiting a deposit writes
nothing, and it survived a test suite I would otherwise have called done. The leg that kills
it is a second photo after the confirmation.

Green plus a reason to believe is not the same as green plus a mutation that fails. This is
the same house rule A8 arrived at from the other direction: agreement between reviews is not
evidence.

## Four rebases in one ticket is the cost of reading main once

`inMemoryReceipts` existed on A8's branch and did not survive its merge, so the wiring had
nothing to hand the path and I found out at typecheck. `TurnDeps.rows` had become a getter,
`WebhookDeps.onCallback` had become required, `Sale` had appeared, and by the time the
wiring was written C11 had replaced the route's second argument with a `Wiring` and added
role dispatch.

None of that was avoidable by planning. All of it was cheap to absorb because the module
came first and the wiring last, which is what the brief asked for. The habit worth keeping
is `git fetch` immediately before touching a shared file, not at the start of the ticket.

## `bun test | tail` reports tail's exit code, not the suite's

`bun test 2>&1 | tail -3 && echo GREEN` printed GREEN over a failing suite and a typecheck
error. A pipeline's status is its last command. Redirect to a file and echo `$?`, or run the
gate bare.
