# Schedule

Friday 2026-09-11 21:00 to Saturday 21:00. Nobody works between 00:00 and 08:00, so the
window holds sixteen working hours, not twenty four. Twenty seven tickets, twelve cut.

## The turn

Three phases. The middle one never sees a model, which is the whole product.

```mermaid
flowchart LR
  IN["customer text or audio"] --> F["fence as untrusted"]
  F --> EX["1 Extraction<br/>structuredOutput, no tools<br/>returns Intent"]
  EX --> R["2 Resolution<br/>priceFor(intent)<br/>pure, tested, no model"]
  R -->|exact match| W["3 Writing<br/>the model gets the amount<br/>as data it cannot alter"]
  R -->|zero rows, two rows,<br/>or a missing attribute| ESC["a person takes it"]
  W --> OUT["reply with VAT included"]
  classDef engine stroke-width:3px
  class R engine
```

## Who blocks whom

Arrows point at the ticket that waits. The chain in bold decides whether the demo exists.

```mermaid
flowchart LR
  subgraph A["Lane A · Chassis and channel"]
    direction TB
    A1["A1 Service chassis"]
    A2["A2 Domain contracts"]
    A3["A3 Schema and storage seam"]
    A4["A4 Telegram bot with two roles"]
    A5["A5 Three phase conversation turn"]
    A7["A7 Orders with a copied amount"]
    A8["A8 Deposit by alias with human confirmation"]
    A6["A6 Dante persona and caps"]
    A9["A9 Escalation to a person"]
  end
  subgraph B["Lane B · Catalog and engine"]
    direction TB
    B3["B3 Seed the business cards family"]
    B4["B4 priceFor, a pure function"]
    B5["B5 Module math"]
    B7["B7 Facts and their fenced injection"]
    B8["B8 Ten business card pricing cases"]
    B6["B6 VAT included, one final number"]
  end
  subgraph C["Lane C · Voice"]
    direction TB
    C2["C2 Transcription behind a seam"]
    C4["C4 Admin audio into a typed PriceEdit"]
    C7["C7 Apply the edit and version it"]
  end
  subgraph D["Lane D · Security"]
    direction TB
    D7["D7 One page threat model"]
    D4["D4 Secrets and gitleaks"]
    D1["D1 Deterministic fencing of untrusted text"]
    D2["D2 Admin allowlist, fail closed"]
    D5["D5 Adversarial suite"]
    D6["D6 Telegram memory isolation"]
  end
  subgraph E["Lane E · Shared"]
    direction TB
    E5["E5 Ask the client for the missing data"]
    E1["E1 Wire the full vertical"]
    E4["E4 Demo script and video"]
  end
  A1 --> D4
  A2 --> A3
  A2 --> B4
  A2 --> D1
  A1 --> A4
  A3 --> D2
  B4 --> B5
  A2 --> A5
  B4 --> A5
  D1 --> A5
  A3 --> A7
  A7 --> A8
  A3 --> B7
  D1 --> B7
  C2 --> C4
  D2 --> C4
  A4 --> C4
  A5 --> D5
  B4 --> D5
  B3 --> B8
  B5 --> B8
  A5 --> E1
  B4 --> E1
  C4 --> E1
  D1 --> E1
  A5 --> A6
  A5 --> A9
  B4 --> B6
  C4 --> C7
  E1 --> E4
  A5 --> D6
  classDef chain stroke-width:3px
  class A1,A2,A3,A4,C4,E1,E4 chain
```

## Run sheet

```mermaid
gantt
    title Dante, 24 hours
    dateFormat YYYY-MM-DD HH:mm
    axisFormat %a %H:%M
    tickInterval 4hour
    section Fede
    A1 Service chassis :crit, a1f, 2026-09-11 21:00, 120m
    A2 Domain contracts :crit, a2f, 2026-09-11 23:00, 60m
    A3 Schema and storage seam :crit, a3f, 2026-09-12 08:00, 90m
    A4 Telegram bot with two roles :crit, a4f, 2026-09-12 09:30, 120m
    A5 Three phase conversation turn :a5f, 2026-09-12 11:30, 120m
    C4 Admin audio into a typed PriceEdit :crit, c4f, 2026-09-12 13:30, 120m
    E5 Ask the client for the missing dat :e5f, 2026-09-12 15:30, 30m
    E1 Wire the full vertical :crit, e1f, 2026-09-12 16:00, 120m
    A6 Dante persona and caps :a6f, 2026-09-12 18:00, 60m
    E4 Demo script and video :crit, e4f, 2026-09-12 19:00, 120m
    section Juan Bautista
    B3 Seed the business cards family :b3j, 2026-09-11 21:00, 90m
    B4 priceFor a pure function :b4j, 2026-09-12 08:00, 120m
    B5 Module math :b5j, 2026-09-12 10:00, 90m
    A7 Orders with a copied amount :a7j, 2026-09-12 11:30, 90m
    B7 Facts and their fenced injection :b7j, 2026-09-12 13:00, 90m
    B8 Ten business card pricing cases :b8j, 2026-09-12 14:30, 90m
    E1 Wire the full vertical :crit, e1j, 2026-09-12 16:00, 120m
    B6 VAT included one final number :b6j, 2026-09-12 18:00, 30m
    E4 Demo script and video :crit, e4j, 2026-09-12 19:00, 120m
    section Talisman
    D7 One page threat model :d7t, 2026-09-11 21:00, 60m
    D4 Secrets and gitleaks :d4t, 2026-09-11 23:00, 60m
    D1 Deterministic fencing of untrusted :d1t, 2026-09-12 08:00, 90m
    D2 Admin allowlist fail closed :d2t, 2026-09-12 09:30, 60m
    A8 Deposit by alias with human confir :a8t, 2026-09-12 13:00, 60m
    D5 Adversarial suite :d5t, 2026-09-12 14:00, 90m
    E1 Wire the full vertical :crit, e1t, 2026-09-12 16:00, 120m
    A9 Escalation to a person :a9t, 2026-09-12 18:00, 60m
    C7 Apply the edit and version it :c7t, 2026-09-12 19:00, 60m
    D6 Telegram memory isolation :d6t, 2026-09-12 20:00, 60m
    section Pato
    C2 Transcription behind a seam :c2p, 2026-09-11 21:00, 120m
    section Clock
    Contracts frozen :milestone, m1, 2026-09-12 00:00, 0m
    Night gap 00 to 08 :done, night, 2026-09-12 00:00, 480m
    Integration :milestone, m2, 2026-09-12 16:00, 0m
    Demo cut :milestone, m3, 2026-09-12 19:00, 0m
    Ship :milestone, m4, 2026-09-12 21:00, 0m
```

## What the schedule says

Pato's three hours were fully blocked. As written, storing a voice note needed the Telegram
bot, which needed the chassis: four hours of Fede's work before Pato could touch anything. The
transcription seam does not need Telegram, it needs a file, so C2 moved to the front of the
lane and Pato spends Friday night on it.

Friday night only fits work with no upstream. Twelve person-hours exist before midnight and
almost every ticket is blocked at hour zero. The four that are not: the chassis, the type
contracts, the seed rows typed off the price list, and the threat model. Anything else
scheduled on Friday is someone watching a branch compile.

Integration is pinned, not queued. Left to the dependency graph, wiring the vertical started
at 20:00 and the demo never got recorded. E1 is nailed to 16:00 and E4 to 19:00, and lane work
fills around them. That is the difference between a demo and a repo.

Fede is booked 16 hours out of 16, because he absorbs the voice lane at midnight. Everyone
else has slack. If anything slips, he is the one who falls.
