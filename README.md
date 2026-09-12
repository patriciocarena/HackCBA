# Dante

A sales agent for a print shop. It quotes over WhatsApp without inventing a price.

HackCBA, 24 hours, four people. The client is Multimpresos, a print shop in Córdoba capital.

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

Only the writing phase is a Mastra agent, and only it has a memory. Extraction reads one fenced
message under a strict schema, because an attribute is a price and a model's summary of an older
message must never be able to set one. ADR 0019 says why the line is drawn there.

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
7. Dante never pretends to be a person. It introduces itself by name and by what it
   does, and it does not deny being software. ADR 0021.

Escalating is the right outcome, not a failure. Its rate will be high while the catalog is
thin, and that is the honest signal of coverage. Nothing counts it yet: `inbound_messages`
stores the message and not the outcome, so the rate arrives with the table that holds a
turn's result.

## What we build in 24 hours

One thin vertical, end to end, over three of the list's thirty eight families: business
cards, folletos láser and facturas. All of it on Telegram.

- Catalog parsed from the price list already versioned as HTML. Three families are loaded,
  in `seed/`, behind a registry the rest are added to one at a time.
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
billing, multi tenancy, and the other thirty five families. Four of them are priced by the
square or linear metre and the engine refuses those outright, until someone decides area
pricing. Because of the exact match rule, an unloaded family escalates instead of guessing, so
not loading them breaks nothing.

## Stack

Bun, TypeScript and Mastra. LibSQL on a Fly volume, with Fly's scheduled snapshots as the
backup. Telegram as the channel. Models reach Claude through OpenRouter. Idempotent inline
DDL, and enums as SQLite CHECKs generated from TypeScript `as const` arrays: one source for
both the union type and the constraint.

The deployment shape and the model routing are written up in `docs/adr/`. Litestream was cut
from the first deploy; the reasoning is in ADR 0001.

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
| `docs/amenazas.md` | The threat model, ticket D7 |
| `docs/adr/` | The decisions this repo made and why |
| `seed/lista-precios.html` | The owner's price list, 38 families, net of VAT, the source every seed is typed from |
| `seed/business-cards.json` | The cards catalog: items, add-ons, discounts and the module table |
| `seed/folletos-laser.json` | Folletos láser: eight rows, no module, no add-ons |
| `seed/facturas.json` | Facturas: twenty eight rows, and every modifier a percentage |
| `src/catalog/families.ts` | The registry. Every family the process quotes from, keyed by slug |
| `seed/facts.json` | What the shop may say about itself. A row with no value escalates |
| `scripts/parse-price-list.ts` | Reads the list and audits a seed's amounts against it, `bun run parse:list` |
| `scripts/eval-flows.ts` | The three flows the shop sells on, driven through the real route with real models |
| `scripts/eval-families.ts` | The two newer families through the same route, `bun run eval:families` |

The long product plan and the domain glossary live in the client repo. The ADRs here cover
only this repo's own decisions.

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

1. Code, identifiers, commits and tickets are in English, and so is what a customer does not
   read. Dante speaks rioplatense; the repo does not. Docs are the one exception: write them
   in the language you think in, and we translate after the hackathon.
2. Contracts freeze at H+2. After that you add fields, you do not rename them.
3. Nobody merges to `main` without `bun test` and `bun run typecheck` green.
4. Zero client constants in the code. They go to `.env` or to the database.
5. Every loaded family ships with its pricing cases. A family without tests does not ship.
6. No skipped or pending tests. Fix them or delete them.
7. If a lane is stuck for over an hour, say so and cut scope.
8. Feature freeze when integration starts, Saturday 16:00. After that, bugs and the demo only.

## Getting started

```
mise trust
bun install
cp .env.example .env
bun test
bun run typecheck
bun run dev
```

`bun test` stubs every model, so it proves the wiring and nothing about what a model does with a
real sentence. `bun run eval` drives the real route with real models over three flows: a price
inquiry from a client and from the owner, a price update only the owner can make, and a
conversation that refers back to what it already said. `bun run eval:families` drives the other
two loaded families, the compounding percentages, and the three ways a message can fail to name
one family. `bun run eval:demo` is the live demo, action by action. They need the keys and they
spend money. Run them before a deploy that touches a prompt, an intent, a seed or the turn.

There is no migration step. Every store creates its own table with `CREATE TABLE IF NOT
EXISTS` the first time it is used, so the schema arrives with the code that needs it.

Deploy with `fly deploy`. Secrets are set once on Fly with `fly secrets set` and are never
imported from a laptop, so nobody's stale `.env` can unset someone else's key. `.env` holds
dev values only. No secret goes in the repo, and `gitleaks` runs on pre-commit.

The deployed app is `dante-multimpresos`. `GET /health` is Mastra's own liveness check and
always returns 200. `GET /health/db` is the one that means something: it opens the database on
the volume and returns a beat counter that keeps climbing across deploys.

## Branches

One branch per ticket, named by its id: `a1-service-chassis`. The author merges it once
`bun test` and `bun run typecheck` are green locally, without waiting for a review. CI runs
the same two commands on every push and pull request. Reviews are for the integration block
on Saturday at 16:00, not for each ticket.
