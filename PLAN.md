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

## 4. Contracts, frozen at H+2

Fede writes them in `src/domain/types.ts` in the first hour. The other three lanes compile
against this. After H+2 you add optional fields, you do not rename.

```ts
export const UNITS = ['unit', 'linear_meter', 'square_meter', 'set'] as const
export type Unit = (typeof UNITS)[number]

export const ORDER_STATES = [
  'quoted', 'deposit_pending', 'deposit_confirmed', 'files_ok', 'in_production',
] as const
export type OrderState = (typeof ORDER_STATES)[number]

export type Intent = {
  family: string | null
  attributes: Record<string, string | number>
  missing: string[]
}

export type Resolution =
  | { kind: 'price'; amount: number; itemId: number; explanation: string }
  | { kind: 'escalate'; reason: EscalationReason; detail: string }

export const ESCALATION_REASONS = [
  'no_match', 'ambiguous', 'missing_attribute', 'out_of_catalog', 'vat_question', 'not_a_fact',
] as const
export type EscalationReason = (typeof ESCALATION_REASONS)[number]

export type PriceEdit = {
  itemId: number
  oldPrice: number
  newPrice: number
  source: 'audio' | 'photo' | 'text'
  mediaId: string
  proposedBy: string
}
```

Every `as const` array generates two things: the TypeScript union type and the SQLite CHECK.
One source. The helper that builds the CHECK ships with the chassis.

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
| A. Chassis and channel | Fede | Repo, types, schema, Telegram, turn, orders and deposit |
| B. Catalog and engine | Juan Bautista | List parser, `priceFor`, modules, VAT, facts |
| C. Voice | Pato | Transcription, price edit by audio, customer audio, diff |
| D. Security | Talismán | Fencing, allowlist, signed link, secrets, red team evals |

Lanes B, C and D do not touch each other. They all touch A, and A is stable at H+2.

## 7. Timeline

H+0 to H+2. Start. Fede stands up the chassis and the contracts. The other three read the
client plan, sections 4, 6, 7 and 9, plus the whole glossary, and set up their environment.
Nobody writes logic yet.

H+2. Milestone: contracts frozen. All four compile against the same types.

H+2 to H+8. Closed parallel work. Each lane works against fixtures, not against the others.
Juan Bautista delivers the business cards catalog loaded. Pato delivers an audio that turns
into a `PriceEdit`. Talismán delivers fencing and the allowlist.

H+8. Milestone: every lane green in isolation. `bun test` passes on all four branches.

H+8 to H+14. Integration. The full turn gets wired. The first real end to end message.

H+14. Milestone: the demo walks. A customer asks, Dante quotes, an order is born, the owner
edits a price by audio.

H+14 to H+18. Edges. Escalation, facts, deposit confirmation, modules, versioning.

H+18. Milestone: feature freeze.

H+18 to H+21. Evals. Ten business card cases plus Talismán's adversarial suite. The governing
metric is zero prices outside the catalog, not a hit rate.

H+21 to H+24. Shadow mode and demo. Dante proposes answers without sending them, the four of
us read them. We write the demo script and record it.

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
