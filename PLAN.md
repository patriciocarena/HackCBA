# Hackathon plan, 24 hours

Date: 2026-09-11. Four people. One catalog family: business cards.

## 1. What we build

One thin vertical, end to end. A customer asks for a price by text or by audio, Dante
extracts the intent, the engine resolves the price against the catalog, Dante writes it with
VAT included, the customer accepts, an order is born, Dante asks for the deposit by alias and
a person confirms it. In parallel, the owner sends an audio or a photo, Dante proposes a
price edit, shows it in a signed diff, and only then applies and versions it.

Everything runs on Telegram. WhatsApp is not in scope today.

## 2. What we leave out, on purpose

- WhatsApp and the LiveConnect proxy. It depends on credentials we do not have and on two
  questions LiveConnect has not answered by mail.
- Email: the historical archive and the live inbox.
- Billing and vendor runway alerts. That is RailsPilot infrastructure, not product.
- The other twenty one catalog families. Because of the exact match rule, an unloaded family
  escalates instead of guessing, so not loading them breaks nothing.
- Multi tenancy. One client per instance.

## 3. Architecture of the vertical

```
Telegram (customer) ─┐
Telegram (admin)    ─┤
                     ├─> untrusted fencing ─> typed extraction ─> pure engine ─> writing
audio ─> transcription ┘                                              │
                                                                      v
                                                   LibSQL: families, items, facts,
                                                   orders, price_edits, price_versions
```

Three phases per turn, and the middle one never sees a model:

1. Extraction. `structuredOutput`, no tools, over already fenced text. Returns an `Intent`.
2. Resolution. SQL against the catalog plus `priceFor(intent)`, a pure tested function.
3. Writing. The model receives the amount as data it cannot alter.

The agent has no tools. Determinism is a pure function with a test, not a hope about a
sequence of tool calls.

## 4. Contracts

Fede writes them in `src/domain/`. The other three lanes compile against them. Adding an
optional field is allowed at any hour. Renaming needs a message to the other three.

```ts
export const UNITS = ['unit', 'linear_meter', 'square_meter', 'set'] as const
export const ROLES = ['customer', 'admin'] as const
export const ORDER_STATES = [
  'quoted', 'deposit_pending', 'deposit_confirmed', 'files_ok', 'in_production', 'cancelled',
] as const
export const ESCALATION_REASONS = [
  'no_match', 'ambiguous', 'missing_attribute', 'unsupported_quantity', 'unsupported_option',
  'out_of_catalog', 'multiple_products', 'vat_question', 'commercial_discount', 'unknown_fact',
  'needs_designer', 'not_authorized', 'human_requested',
] as const
export const INTENT_KINDS = ['quote', 'fact', 'admin_edit', 'other'] as const

export type Intent = QuoteIntent | FactIntent | AdminEditIntent | OtherIntent

export type QuoteIntent = {
  kind: 'quote'
  family: string | null
  attributes: Record<string, string | number>
  size: Size | null
  addOns: string[]
}

export type Resolution =
  | { kind: 'price'; breakdown: PriceBreakdown; validityDays: number }
  | { kind: 'ask'; missing: string[] }
  | { kind: 'fact'; key: string; value: string }
  | { kind: 'escalate'; reason: EscalationReason; detail: string }

export type PriceBreakdown = {
  base: BreakdownLine
  moduleFactor: number
  moduleDiscountRates: number[]
  addOns: BreakdownLine[]
  listDiscounts: BreakdownLine[]
  vatRate: number
  vatIncluded: boolean
}
```

Every `as const` array generates three things: the TypeScript union, the Zod enum the
extraction schema uses, and the SQLite CHECK. One source. The helper that builds the CHECK is
`src/storage/check.ts`.

Five rules the types carry, so nobody has to remember them:

1. `Ars` is a branded integer of final pesos. A raw number does not typecheck as money.
2. `UntrustedText` is a branded string. Only D1's `fence()` builds one, so unfenced text
   cannot reach extraction.
3. `quoteIntentSchema(family)` is generated from the loaded catalog. An attribute the family
   does not declare fails to parse, so extraction cannot invent one.
4. `ConversationId` carries the role. A customer turn cannot name admin state.
5. The order copies the breakdown. `totalOf` reads it, so editing the list never moves an
   amount already quoted.

The list the shop publishes is final, tax included. `vatIncluded` says so per family, and
`totalOf` grosses up only a family whose list is net. See ADR 0003.

## 5. Rules that are not up for negotiation

- The bot only says a number that comes out of a pure, tested function whose inputs are all
  data the owner typed.
- Exact match or escalate. Zero rows, more than one, or a missing attribute we already asked
  for: escalate. No interpolation, no nearest neighbor, no "roughly".
- Prices always include VAT, as one final number. Never "plus VAT". Any question about
  whether VAT is mandatory escalates to a person.
- What is not in `facts`, Dante does not know, and not knowing it means escalating.
- Audio and photos never write. They propose.
- Admins by allowlist, fail closed. An unknown sender asking for a price increase is a
  customer, not a command.
- Every outside text is fenced as untrusted and is never an instruction.
- Dante introduces itself as automated in the first message of every new conversation.
- The order copies the price, it does not point at it. Editing the list never changes what
  was already quoted.

## 6. Lanes and owners

| Lane | Owner | Delivers |
|---|---|---|
| A. Chassis and channel | Fede | Repo, types, schema, Telegram, turn, persona, escalation |
| B. Catalog and engine | Juan Bautista | Seed rows, `priceFor`, modules, VAT, facts, pricing cases, orders |
| C. Voice | Pato, then Fede | Transcription seam, price edit by audio, versioning |
| D. Security | Talisman | Fencing, allowlist, secrets, red team, memory isolation, deposit |

Pato has three hours, Friday 21:00 to midnight, and hands the lane to Fede there. That single
constraint reshapes the lane: the transcription seam comes first, because it needs an audio
file and not the Telegram bot, and it is the only piece of lane C that can start at hour zero.

Ownership crosses lanes where capacity demands it. Juan Bautista takes orders, Talisman takes
the deposit and escalation. Lane letters mark the subject, not the person.

## 7. Timeline

Friday 2026-09-11 21:00 to Saturday 21:00. Nobody works between 00:00 and 08:00, so the window
holds sixteen working hours, not twenty four. The full run sheet is in `SCHEDULE.md`.

Friday 21:00 to 00:00. Three hours, and almost every ticket is blocked at hour zero. The four
that are not: the chassis, the type contracts, the seed rows typed off the price list, and the
threat model. Anything else scheduled on Friday is someone watching a branch compile.

Saturday 00:00. Milestone: contracts frozen. Everyone sleeps on the same types. After this you
add optional fields, you do not rename.

Saturday 08:00 to 16:00. Closed parallel work. The pricing engine, the Telegram bot, the turn,
the allowlist, the fencing, the module math, the facts, the ten pricing cases, the adversarial
suite, and the price edit by audio.

Saturday 16:00 to 18:00. Milestone: integration, pinned. Three people, one vertical. This is a
fixed block, not a queue: left to the dependency graph it started at 20:00 and the demo never
got recorded.

Saturday 18:00 to 19:00. Edges. Persona and disclosure, escalation, VAT.

Saturday 19:00 to 21:00. Milestone: demo cut. Fede and Juan Bautista record the six steps while
Talisman closes versioning and memory isolation.

Saturday 21:00. Ship.

## 8. Risks, with their cutoff

| Risk | Signal | Cutoff |
|---|---|---|
| The list parser fights the HTML | H+6 with no cards loaded | Hand seed 20 card rows |
| Transcription misreads dictated amounts | H+8 with no `PriceEdit` | Edits come in as text, audio stays a demo |
| The diff page eats the clock | H+12 with no link | Telegram buttons for a single row |
| Integration finds a wrong contract | H+10 | Add an optional field, never rename |
| A client data point is missing | already happened | `docs/assumptions.md`, keep going, flag it in the demo |

## 9. Merge gates

1. `bun test` and `bun run typecheck` green.
2. Every loaded family ships with its `priceFor` cases, module math included.
3. No client constants in `.ts`.
4. No skipped or pending tests. Fix them or delete them.

## 10. What we demo at H+24

A three minute video, in this order:

1. A customer asks on a simulated WhatsApp: "hola, cuánto 1000 tarjetas". Dante introduces
   itself as automated, asks for every missing attribute in a single message, and quotes with
   VAT.
2. The same customer asks for a 10x15 card, which is not a row in the list. Dante computes it
   by modules and says how it got there.
3. A customer asks something that is not loaded. Dante escalates instead of inventing.
4. Someone tries a prompt injection. Dante does not move.
5. The owner sends an audio: "subí las tarjetas un 20%". Dante proposes, shows the diff, the
   owner confirms, and the version is recorded with the audio that caused it.
6. The customer accepts, the order is born, Dante asks for the deposit by alias, a person
   confirms it from Telegram, and the record says who did.
