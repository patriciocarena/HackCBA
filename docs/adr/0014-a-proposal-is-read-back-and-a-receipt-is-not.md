# 14. A proposal is read back, and a receipt is not

Date: 2026-09-12

## Status

Accepted.

## Context

`PLAN.md` section 10 step 5 is one sentence: the owner sends an audio, Dante proposes, shows
the diff, the owner confirms, and the version is recorded with the audio that caused it.

Two lanes built the ends of that sentence and neither built its middle. C4 produces a
`PriceEditProposal` and writes it through `SavePriceEdit`. C7's `applyPriceEdit` takes a
proposal as an argument and returns the `PriceVersion`. Between the write and the argument
there was nothing: `inMemoryPriceEdits` had no reader, `applyPriceEdit` had no call site, and
no expression anywhere turned "the owner confirms" into a call.

The gap was not only mechanical. C4 decides who may propose by asking whether the inbound
message arrived with `role === 'admin'`, then records the proposer as a bare string. C7
decides who may apply by asking whether `input.by.kind === 'person'`. Nothing converted a
Telegram user id into an `Actor`, and C7's `person` check would have admitted any person at
all: by the time a proposal is in hand the allowlist is three modules behind it and was never
written down.

`docs/adr/0013-the-receipt-store-has-no-reader.md` decided the opposite shape one demo step
later, and decided it hard: a store with no reader, so that no confirmation path can be shown
a receipt. Read as a general rule about stores, 0013 forbids what this ticket needs.

## Decision

`confirmPriceEdit` takes a proposal **id** and reads the proposal back through a port:

```ts
export type LoadProposal = (id: string) => Promise<PriceEditProposal | null>
export type SaveProposal = (proposal: PriceEditProposal) => Promise<void>
```

This does not contradict 0013. A receipt is evidence, written once so a dispute weeks later
has an answer, and looking at it is the one check that does not work. A proposal is a pending
decision. It exists in order to be read back and answered, and a decision nobody can re-read
is a decision nobody can make. 0013's rule is about receipts, not about stores.

The order of operations is fixed and each step earns the next:

1. The allowlist answers first. `isAdmin` arrives injected and defaults to denying everyone,
   so a caller that forgets to wire it confirms nothing rather than confirming for anybody.
2. The `Actor` is minted here, from that answer. This is the only place the Telegram id is a
   fact. Minting does not make C7's `not_a_person` guard fire: it makes it unreachable from
   this entry point, which is the Consequences below. What it buys is that `by.id` is an
   allowlist-verified id rather than the bare `proposedBy` string C4 carried.
3. The proposal is loaded by id. Nothing in the message is trusted: 0013 already warned that
   callback data round-trips through the client and is attacker-controlled, and the prices in
   a proposal are the money path.
4. `applyPriceEdit` re-checks staleness against live rows and decides the rest.

The allowlist is consulted again even though `src/telegram/webhook.ts` already used it to set
`role` on the way in. Failing closed at the point of the privileged action costs one set
lookup; trusting a field that travelled costs the guarantee.

`rejected` becomes reachable, and only here. C4's refusal means the dictation could not be
understood, which is no price edit at all, not a rejected one. `rejected` is the owner being
asked and saying no, and nothing but a confirmation path can produce it. The state existed in
`PRICE_EDIT_STATES` from the freeze with no writer; this is its writer.

## Consequences

Both answers resolve the proposal, so every precondition on resolving one sits above the
branch, not inside it. Two were found the same way and both had the same shape. The state gate
lived inside `applyPriceEdit`, which the accept branch reaches and the reject branch does not,
so rejecting an already-applied edit wrote a second resolution over the first and returned
`ok`. The timestamp check lived in the same place, so a refusal could be stamped `ayer` and
stored. `applyPriceEdit` still makes both checks, for its own sake and for callers yet to be
written; this module no longer relies on it for either.

A guard reached down one of two branches is not a guard. Where two paths resolve the same
thing, the precondition belongs above the fork.

The outcome has three members, not two, because `applied` and `rejected` are both successes
and refusal is neither. It discriminates on `decision`, not on `ok`:

```ts
export type ConfirmOutcome =
  | { ok: true; decision: 'applied'; applied: Applied }
  | { ok: true; decision: 'rejected'; rejected: PriceEditProposal }
  | { ok: false; reason: ConfirmRefusal }
```

Two members keyed `ok: true` and nothing else do not narrow. `bun test` ran six green tests
against the version that could not narrow; `bun run typecheck` is what failed. Every claim
about a type in this repo needs tsc in the same run.

`ConfirmRefusal` widens `ApplyRefusal` rather than restating it, following `DepositRefusal`,
so a refusal from `applyPriceEdit` is returned whole instead of being re-wrapped. One member
of it is dead from this entry point: `not_a_person` cannot occur, because step 2 only ever
mints a person. It stays in the union because `applyPriceEdit` is public and its other callers
have not been written yet.

There is no default store and no `inMemoryPriceEdits` here. C4 owns that factory and shipping
a second one would give the repo two, so the ports are declared and the tests roll their own
double, the same way `0013`'s module does. After C4 merges, its store grows a `load` that
satisfies `LoadProposal` and its existing `save` already satisfies `SaveProposal`.

Nothing calls `confirmPriceEdit` yet. Wiring it to a Telegram reply is the next ticket, and
whoever writes it passes the raw `senderId` and the proposal id and nothing else. Passing a
price, an amount or a whole proposal through that boundary reintroduces exactly the hole this
ADR closes.
