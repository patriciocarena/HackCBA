# 7. The webhook claims an update before it answers

Date: 2026-09-12

## Status

Accepted.

## Context

Telegram retries a webhook delivery whenever the response is not 2xx, and it retries on a
timeout it decided on its own. The same `update_id` therefore arrives more than once, and
two deliveries of one message can be in flight at the same time. A4's whole criterion is
that the second one is silent.

The channel also decides who is speaking. `docs/amenazas.md` threat 2 is somebody sending
"subí las tarjetas un 20%" from a number that is not the owner's, and PLAN.md section 5
answers it: an unknown sender asking for a price increase is a customer, not a command.
Role cannot come from a command the sender picks, because the sender picks it.

Three of the pieces this route needs belong to other lanes that are writing them right
now: the admin allowlist is D2, the untrusted fence is D1, and the table behind seen
updates is A3. The turn itself is A5. None of them exists on this branch.

## Decision

The route is `POST /telegram/webhook`, registered through `server.apiRoutes` on the Mastra
server that already answers `/health/db`. ADR 0001 made that server the HTTP server, and a
second listener would need its own port, its own process and its own health check.

A delivery is handled in this order, and the order is the decision:

1. Compare the `X-Telegram-Bot-Api-Secret-Token` header against the configured secret with
   a constant time comparison. A mismatch is 401 with an empty body, before any parsing.
2. Parse the update. Anything without a sender and without text or media is acknowledged
   with 200 and goes no further. There is no id to place a role against, and a retry would
   not produce one.
3. Claim the `update_id`. `seen(updateId)` reports whether the id was already claimed and
   claims it in the same call. A claimed id returns 200 and runs nothing.
4. Resolve the role from the sender's Telegram user id through the allowlist, build the
   `ConversationId` from channel, chat and role, record the inbound message, and await the
   turn.

Claiming before the turn rather than after is at most once, not at least once. If the turn
throws after the claim, that message is lost, because the retry is deduped into a no-op.
That is the trade the criterion asks for: a repeated update must not fire two replies, and
claiming afterwards leaves a window where two concurrent deliveries both find the id free.

Exceptions from the turn are not caught. Telegram sees 500 and retries, the retry is
deduped, and the error stays in the log instead of being swallowed into a 200.

Every dependency this route does not own is an injected function with a type declared here
and a default that fails closed: `IsAdmin` denies everyone, `Turn` says nothing, the fence
brands after neutralising its own delimiters, and the inbound log and the claim set are in
memory. The orchestrator swaps each default for the lane that owns it. This branch imports
nothing from `src/domain/` except the `UntrustedText` and `ConversationId` types.

## Consequences

A restart empties the in-memory claim set, so an update delivered before the restart and
retried after it replies twice. A3's table closes that, and the seam is already the shape
the table fills. The in-memory set is bounded and evicts its oldest entry, so a process
that stays up does not grow without limit.

The role lives inside the `ConversationId`, so an admin turn and a customer turn from the
same person are two conversations by construction, and D6's memory isolation has a key to
work against rather than a rule to remember.

`update_id` is the key on its own. It is unique per bot, and PLAN.md section 2 leaves
multi tenancy out, so nothing else needs to be mixed into it.
