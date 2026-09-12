# Tickets

Twenty seven tickets, scheduled. The window is Friday 2026-09-11 21:00 to Saturday 21:00, and
nobody works between 00:00 and 08:00, so there are sixteen working hours, not twenty four.

`blocked_by` is what you wait for. `blocks` is who you leave stranded if you stall.
The critical chain is A1 → A2 → A3 → A4 → C4 → E1 → E4. Everything else has slack.

## Lane A. Chassis & channel. Fede

| ID | Title | Who | Blocked by | Blocks | h | Window | Done when |
|---|---|---|---|---|---|---|---|
| A1 | Service chassis | Fede | - | A4, D4 | 2 | Fri 21:00 → 23:00 | fly deploy finishes and GET /health returns 200 |
| A2 | Domain contracts | Fede | - | A3, A5, B4, D1 | 1 | Fri 23:00 → 00:00 | All four lanes import from this file and compile |
| A3 | Schema and storage seam | Fede | A2 | A7, B7, D2 | 1.5 | Sat 08:00 → 09:30 | The DDL runs twice in a row without error |
| A4 | Telegram bot with two roles | Fede | A1 | C4 | 2 | Sat 09:30 → 11:30 | A repeated Telegram update does not fire two replies |
| A5 | Three phase conversation turn | Fede | A2, B4, D1 | A6, A9, D5, D6, E1 | 2 | Sat 11:30 → 13:30 | The writing model receives the computed amount and cannot alter it |
| A7 | Orders with a copied amount | Juan Bautista | A3 | A8 | 1.5 | Sat 11:30 → 13:00 | A test edits the list after quoting and the order keeps the old amount |
| A8 | Deposit by alias with human confirmation | Talisman | A7 | - | 1.0 | Sat 13:00 → 14:00 | The receipt is stored and never shown to whoever confirms |
| A6 | Dante persona and caps | Fede | A5 | - | 1.0 | Sat 18:00 → 19:00 | Introduces itself as automated in one line in the first message of every new conversation and never again in that conversation |
| A9 | Escalation to a person | Talisman | A5 | - | 1 | Sat 18:00 → 19:00 | After escalating, a new customer message produces no agent reply |

## Lane B. Catalog & engine. Juan Bautista

| ID | Title | Who | Blocked by | Blocks | h | Window | Done when |
|---|---|---|---|---|---|---|---|
| B3 | Seed the business cards family | Juan Bautista | - | B8 | 1.5 | Fri 21:00 → 22:30 | Card rows are in items with their unit and tier |
| B4 | priceFor, a pure function | Juan Bautista | A2 | A5, B5, B6, D5, E1 | 2 | Sat 08:00 → 10:00 | It is a pure function with no network and no clock access |
| B5 | Module math | Juan Bautista | B4 | B8 | 1.5 | Sat 10:00 → 11:30 | Card 15x5 gives 2 modules, large card 10x15 gives 4, A4 flyer gives 5 |
| B7 | Facts and their fenced injection | Juan Bautista | A3, D1 | - | 1.5 | Sat 13:00 → 14:30 | A question about an unloaded fact returns escalate, not a plausible answer |
| B8 | Ten business card pricing cases | Juan Bautista | B3, B5 | - | 1.5 | Sat 14:30 → 16:00 | bun test green |
| B6 | VAT included, one final number | Juan Bautista | B4 | - | 0.5 | Sat 18:00 → 18:30 | No amount leaves the engine without VAT, with a test |

## Lane C. Voice. Pato, then Fede

| ID | Title | Who | Blocked by | Blocks | h | Window | Done when |
|---|---|---|---|---|---|---|---|
| C2 | Transcription behind a seam | Pato | - | C4 | 2 | Fri 21:00 → 23:00 | A test audio transcribes and the text is stored next to the media |
| C4 | Admin audio into a typed PriceEdit | Fede | C2, D2, A4 | C7, E1 | 2 | Sat 13:30 → 15:30 | Raise cards 20% lands in price_edits and no price changed |
| C7 | Apply the edit and version it | Talisman | C4 | - | 1.0 | Sat 19:00 → 20:00 | price_versions stores who, when and the media id that caused it |

## Lane D. Security. Talisman

| ID | Title | Who | Blocked by | Blocks | h | Window | Done when |
|---|---|---|---|---|---|---|---|
| D7 | One page threat model | Talisman | - | - | 1 | Fri 21:00 → 22:00 | One page, no more |
| D4 | Secrets and gitleaks | Talisman | A1 | - | 1 | Fri 23:00 → 00:00 | The hook stops a commit carrying a key |
| D1 | Deterministic fencing of untrusted text | Talisman | A2 | A5, B7, E1 | 1.5 | Sat 08:00 → 09:30 | A message containing the fence delimiters does not break the fence, with a test |
| D2 | Admin allowlist, fail closed | Talisman | A3 | C4 | 1 | Sat 09:30 → 10:30 | An empty or misconfigured list denies everyone, never allows everyone |
| D5 | Adversarial suite | Talisman | A5, B4 | - | 1.5 | Sat 14:00 → 15:30 | All twenty attacks run in CI |
| D6 | Telegram memory isolation | Talisman | A5 | - | 1.0 | Sat 20:00 → 21:00 | Something told on Telegram never appears in a customer reply, with a test |

## Lane E. Shared. All four

| ID | Title | Who | Blocked by | Blocks | h | Window | Done when |
|---|---|---|---|---|---|---|---|
| E5 | Ask the client for the missing data | Fede | - | - | 0.5 | Sat 15:30 → 16:00 | Asked in a single message, not one at a time |
| E1 | Wire the full vertical | Fede+Juan Bautista+Talisman | A5, B4, C4, D1 | E4 | 2 | Sat 16:00 → 18:00 | A text message crosses extraction, resolution and writing and comes back with a VAT inclusive price |
| E4 | Demo script and video | Fede+Juan Bautista | E1 | - | 2 | Sat 19:00 → 21:00 | Three minutes recorded |

## Cut

Twelve tickets removed to fit sixteen hours. Each one buys back time somewhere else.

| ID | Why it went |
|---|---|
| B1 | Price list parser. For one family you hand-type 20 rows. The parser pays off at family five. |
| B2 | Parse diff. Nothing to diff once the parser is gone. |
| B9 | Escalation rate by family. One family, one rate. Read it off the logs. |
| C1 | Voice note storage. Folded into C4, which needs the media anyway. |
| C3 | Customer audio. The admin audio path proves the same pipeline. |
| C5 | Photo of the list by vision. Audio already shows that media never writes. |
| C6 | Diff page. Falls back to Telegram buttons, the plan’s own cutoff. |
| C8 | Dante answering by voice. It was a stretch before the night gap existed. |
| D3 | HMAC signed link. It only existed to protect the diff page. |
| D8 | Webhook hardening. Telegram authenticates by bot token; the proxy contract is phase two. |
| E2 | Separate evals. Merged into B8, same ten conversations. |
| E3 | Shadow mode. With no real customers, the demo is the shadow. |

## Load

| Who | Booked | Available |
|---|---|---|
| Fede | 16.0 h | 16 h |
| Juan Bautista | 14.0 h | 16 h |
| Talisman | 12.0 h | 16 h |
| Pato | 2 h | 3 h |

Fede is at the limit with no slack, because he absorbs the voice lane at midnight.
If anything slips, he is the one who falls.
