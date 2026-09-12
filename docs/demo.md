# Demo runbook

Three minutes, six steps, the order in PLAN.md section 10. That order is the authority.

Every amount in this file came out of the engine, not out of arithmetic done by hand:
`$45.000` and `$162.000` are pinned by `test/catalog/prices.test.ts` and
`test/domain/order.test.ts`, so a seed edit that moves them breaks a test before it breaks
the recording.

## What does not work yet

Checked against `main` at `c0ab720` and against every open branch. Nothing here is fixed by
this ticket; it is what the person holding the phone needs to know before 20:00.

| # | What | Where |
|---|---|---|
| 1 | Nothing replies on Telegram. The webhook logs the message and calls a turn that does nothing, and no `sendMessage` exists on any branch. | `src/telegram/webhook.ts:34` |
| 2 | An order is never born from a conversation. The turn returns a `Resolution` and never calls `quoteFrom`. `acceptQuote`, `requestDeposit` and `confirmDeposit` have no caller in `src/` on any branch. | `src/conversation/turn.ts:64` (PR #14), `src/domain/order.ts:85`, `src/domain/deposit.ts:20` (PR #16) |
| 3 | A price edit has no diff message and no confirm command. The proposal carries `oldPrice` and `newPrice` per row and nothing renders them; `applyPriceEdit` has no caller in `src/`. | `src/voice/price-edit-proposal.ts:80` (PR #17), `src/catalog/apply-edit.ts:29` (PR #18) |
| 4 | No fact is loaded anywhere. `answerFromFacts` has no caller and `seed/` holds only the catalog, so every fact question escalates, including the hours `docs/assumptions.md` section 4 says are confirmed. | `src/domain/facts.ts:25` |
| 5 | `DEPOSIT_ALIAS` is read by no code. `docs/assumptions.md` section 3 names it; nothing calls `requireEnv` for it. | `docs/assumptions.md` section 3 |
| 6 | An escalation is terminal and nothing clears it, by decision, not by accident. Steps 3 and 4 each end their conversation, so the six steps cannot run in one chat. Step staging below. | `src/conversation/turn.ts:47,170` (PR #14), ADR 0011 |
| 7 | A file attachment is not read. The update reader takes `voice` and `photo` and nothing else, so an `.opus` dragged in as a document never reaches the turn. Send audio as a voice note. | `src/telegram/update.ts:36` |
| 8 | A photo is not a price edit. PLAN.md section 1 says audio or photo; the admin path returns null for anything that is not `voice`. Section 10 step 5 only needs audio, so this is out of the demo, not in its way. | `src/voice/admin-audio.ts:29` (PR #17) |
| 9 | The extraction schema shows the model attribute slugs, never the Spanish labels or the `4/1` shorthand the seed carries. A customer saying `4/1`, which is what a print customer says, has no path to `front_color_back_grayscale`. Every paste text below spells the attributes out. | `src/conversation/prompt.ts:74` (PR #14) |

Rows 1, 2 and 3 are E1's work and the middle three beats of step 5 and all of step 6 belong
to nobody's ticket yet. Read that before promising the full six.

