# Dante

A sales agent for a print shop. It quotes over WhatsApp without inventing a price.

HackCBA, 24 hours, four people. The client is Multimpresos, a print shop in Tucumán.

## The problem

Three people answer WhatsApp all day. The price list runs about 40 pages, and every update
is done product by product, by hand. The owner stopped the old bot's development over it:
he could not find a way to keep it current.

Before us there was an AI attempt. It lasted four or five months. It invented store
addresses that do not exist, claimed there were branches in the north, and quoted a
1,500,000 job at 14,000. Customers walked into the shop holding a phone with the fake
quote on screen. Close to half the conversations ended badly.

That is the real problem. The bot did not fail at selling. It failed by speaking with
confidence about things it did not know. Whatever we build has to attack that head on.

## The idea

The engine computes the price. The model only writes it down.

Dante has no tools. A turn is three phases, and the middle one never sees a model:

```
customer message
  │
  ├─ 1. extraction   structuredOutput, no tools, over fenced text ─> Intent
  │
  ├─ 2. resolution   SQL against the catalog + priceFor(intent), a pure function ─> Resolution
  │
  └─ 3. writing      the model gets the amount as data it cannot alter
```

Determinism is a pure function with a test, not a hope about a sequence of tool calls.

## The rules

They are the product. Loosen them and we are back to the bot that invented prices.

1. Dante only says a number that comes out of a pure, tested function whose inputs are all
   data the owner typed.
2. Exact match or escalate. Zero rows, more than one, or a missing attribute we already
   asked for: hand the conversation to a person. No interpolation, no nearest neighbor, no
   "roughly".
3. What is not loaded as a fact, Dante does not know, and not knowing it means escalating.
   That is where the invented branches die.
4. Prices include VAT. One final number. Never "plus VAT".
5. Audio and photos never write. They propose, and a person confirms over a diff.
6. Every outside text is fenced as untrusted and is never an instruction.
7. Dante introduces itself as automated and never pretends to be a person.

Escalation rate is measured from the first turn. It will be high at the start, and it is
the honest signal of catalog coverage, not a failure.

## What we build in 24 hours

One thin vertical, end to end, over a single catalog family: business cards. All of it on
Telegram.

- Catalog parsed from the price list already versioned as HTML.
- Pricing engine with module math: a size that is not in the list does not escalate, it
  gets computed.
- Conversation with extraction, resolution and writing.
- Voice: the owner changes a price by audio, and the audio never writes on its own.
- Versioning that keeps the audio that caused each price change.
- Order with a deposit by alias and human confirmation, on the record.
- Adversarial suite against prompt injection and invented prices.

The full plan is in `PLAN.md`, the flowcharts and the run sheet in `SCHEDULE.md`.

## What we leave out, on purpose

WhatsApp and the LiveConnect proxy: it depends on credentials and on two unanswered
questions, and risking the shop's number during a hackathon is not worth it. Email,
billing, multi tenancy, and the other twenty one families. Because of the exact match rule,
an unloaded family escalates instead of guessing, so not loading them breaks nothing.

## Stack

Bun, TypeScript and Mastra. LibSQL on a Fly volume, with Litestream replicating from the
first deploy. Telegram as the channel. Idempotent inline DDL, and enums as SQLite CHECKs
generated from TypeScript `as const` arrays: one source for both the union type and the
constraint.

## Repo map

| File | What it holds |
|---|---|
| `PLAN.md` | Scope, frozen contracts, timeline, risks and their cutoff |
| `SCHEDULE.md` | The flowcharts: the turn, who blocks whom, and the run sheet |
| `TICKETS.md` | The 27 tickets as tables, by lane, with their window |
| `tasks.json` | The same tickets, scheduled, ready to import into a tracker |
| `linear-import.csv` | CSV import for Linear, no credentials needed |
| `scripts/create-linear-issues.ts` | Creates the issues and their blocking links over the Linear API |
| `docs/assumptions.md` | What we take as true because the client has not answered yet |

The long product plan, the domain glossary and the ADRs live in the client repo, not here.

## The four of us

| Who | Lane | Booked | Available |
|---|---|---|---|
| Fede | A, then C | 16 h | 16 h |
| Juan Bautista | B | 14 h | 16 h |
| Talisman | D | 12 h | 16 h |
| Pato | C | 2 h | 3 h |

Pato has three hours, Friday 21:00 to midnight, and hands the voice lane to Fede there. Fede
is booked to the limit with no slack because he absorbs it. Everyone else has room. If
anything slips, Fede is the one who falls.

Critical chain: A1, A2, A3, A4, C4, E1, E4. Everything else has slack.

## Rules for the day

1. Everything is in English: code, identifiers, docs, commits, tickets. The only Spanish is
   what a customer reads. Dante speaks rioplatense; the repo does not.
2. Contracts freeze at H+2. After that you add fields, you do not rename them.
3. Nobody merges to `main` without `bun test` and `bun run typecheck` green.
4. Zero client constants in the code. They go to `.env` or to the database.
5. Every loaded family ships with its pricing cases. A family without tests does not ship.
6. No skipped or pending tests. Fix them or delete them.
7. If a lane is stuck for over an hour, say so and cut scope.
8. Feature freeze when integration starts, Saturday 16:00. After that, bugs and the demo only.

## Getting started

The chassis is ticket A1 and does not exist yet. Once it does:

```
bun install
cp .env.example .env
bun run db:migrate
bun run seed
bun test
bun run dev
```

No secret goes in the repo. They go to `fly secrets`, and `gitleaks` runs on pre-commit.
