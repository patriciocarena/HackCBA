# Tickets

Four parallel lanes plus a shared one. Each row is the ticket as is: id, title, what blocks
it, how many hours, and when it is done.

Critical path: A2 and A3 block the other three lanes. They ship first, before H+2.

## Lane A. Chassis and channel. Fede

| ID | Title | Blocked by | h | Done when |
|---|---|---|---|---|
| A1 | Chassis: bun, Mastra, Dockerfile, `fly.toml` with a volume, healthcheck | - | 2 | `fly deploy` returns 200 on `/health` |
| A2 | Contracts in `src/domain/types.ts` plus the helper that builds a CHECK from an `as const` array | - | 1 | All four lanes import from here and compile |
| A3 | Idempotent schema and the LibSQL storage seam | A2 | 1.5 | The six tables create twice without error |
| A4 | Telegram bot with two roles, customer and admin, with update dedupe | A1 | 2 | A repeated update does not fire two replies |
| A5 | Turn: extraction, resolution, writing, in that order | A2 B4 D1 | 2 | The model gets the amount as data and cannot alter it |
| A6 | Dante persona, inverted caps, disclosure once per conversation | A5 | 1.5 | Introduces itself as automated in the first message and never again |
| A7 | `orders` with states and a copied amount | A3 | 1.5 | Editing the list does not change an order already quoted. Test proves it |
| A8 | Deposit by alias, receipt attached, confirmation on the record | A7 | 2 | The receipt is stored and never shown to whoever confirms |
| A9 | Escalation: the conversation belongs to a human and the bot stops writing | A5 | 1 | After escalating, Dante never writes in that thread again |

## Lane B. Catalog and engine. Juan Bautista

| ID | Title | Blocked by | h | Done when |
|---|---|---|---|---|
| B1 | Parser from `lista-precios.html` to families and items, using `td.p` and `tr.mod` | A2 | 2 | Deterministic run, typed JSON out |
| B2 | Diff the parse against the list before loading | B1 | 1 | A person reads it row by row and signs off |
| B3 | Seed the business cards family | B2 A3 | 1 | Card rows are in `items` with their unit and tier |
| B4 | `priceFor(intent)`, pure: exact match or escalate | A2 | 2 | Zero, more than one, or a missing attribute returns escalate |
| B5 | Module math: `ceil(piece area / module area)` and the module discount | B4 | 1.5 | The owner's three examples give 2, 4 and 5, with tests |
| B6 | VAT: list plus 21%, one final number, rate in config | B4 | 0.5 | No amount leaves the engine without VAT. Test |
| B7 | `facts` and its fenced injection into the turn | A3 D1 | 1.5 | What is not in `facts` escalates |
| B8 | Ten card pricing cases, taken from real conversations | B3 B5 | 1.5 | `bun test` green and zero prices outside the catalog |
| B9 | Escalation rate by family | B4 | 1 | A command prints it. It will be high, and that is fine |

## Lane C. Voice. Pato

| ID | Title | Blocked by | h | Done when |
|---|---|---|---|---|
| C1 | Receive a Telegram voice note and store the media | A4 | 1 | The audio lands on disk with its own id and can be replayed |
| C2 | Transcription behind a provider seam | C1 | 2 | Swapping providers touches one file. A test audio transcribes |
| C3 | Customer audio into the same extraction pipeline as text | C2 A5 | 1 | An audio asking for a price quotes the same as the text |
| C4 | Admin audio into a typed `PriceEdit`, stored without applying | C2 D2 | 2 | "Raise cards 20%" lands in `price_edits` and nothing changed |
| C5 | Photo of the list into `PriceEdit`s by vision, several rows at once | C4 | 2 | One sheet yields N proposals, none applied |
| C6 | Read only diff page served by `apiRoutes` | C4 D3 | 2 | Old and new side by side. No signed link, no page |
| C7 | Apply the edit and version it with the media that caused it | C6 | 1.5 | `price_versions` stores who, when, and the audio or photo |
| C8 | Stretch: Dante answers by voice | C3 | 1 | Only if there is time left after H+18 |

## Lane D. Security. Talismán

| ID | Title | Blocked by | h | Done when |
|---|---|---|---|---|
| D1 | `untrusted.ts`: deterministic fencing of every outside text | A2 | 1.5 | A message carrying the delimiters does not break the fence. Test |
| D2 | Admin allowlist, fail closed | A3 | 1 | An unknown sender asking for a raise is treated as a customer |
| D3 | HMAC signed link with expiry and single use | A1 | 1.5 | Expired, reused or tampered links return 403 |
| D4 | Secrets: `fly secrets`, `gitleaks` on pre-commit, no `.env` in git | A1 | 1 | The hook stops a commit carrying a key |
| D5 | Adversarial suite: injection, invented price, exfiltration | A5 B4 | 2.5 | 20 attacks run in CI. Zero prices outside the catalog |
| D6 | Memory isolation: Telegram context never reaches a customer turn | A5 | 1.5 | Something told on Telegram never shows up in a customer reply. Test |
| D7 | One page threat model | - | 1 | Who attacks, what they gain, what stops them |
| D8 | Webhook hardening: header secret, dedupe, rate limit | A1 | 1.5 | A request without a valid secret never reaches the logic |

## Lane E. Shared

| ID | Title | Blocked by | h | Done when |
|---|---|---|---|---|
| E1 | Wire the full vertical, all four together | A5 B4 C4 D1 | 2 | A text message crosses everything and comes back with a price |
| E2 | Ten card evals against what the human answered | B8 | 1.5 | They run in CI |
| E3 | Shadow mode: Dante proposes on Telegram and sends nothing | A5 | 1.5 | A flag turns it on and off |
| E4 | Demo script and video, the six steps in `PLAN.md` section 10 | everything | 2 | Three minutes recorded |
| E5 | Ask the client for the six missing data points | - | 0.5 | Fede. As early as possible, does not block code |

## Hours per lane

| Lane | Hours |
|---|---|
| A. Fede | 14.5 |
| B. Juan Bautista | 12 |
| C. Pato | 12.5 |
| D. Talismán | 11.5 |
| E. Shared | 7.5 |

Hours are left over on purpose. Integration always costs more than the table says.
