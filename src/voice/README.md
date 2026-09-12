# Voice lane, C2 handoff

Pato built this Friday 21:00 to 23:00 and left at midnight. Fede picks up C4 on Saturday
at 13:30. Read this first; it is shorter than the code.

## What this is

A transcription port. Audio bytes in, text out. One implementation, ElevenLabs Scribe.
Swapping providers means writing another `TranscriptionPort` and changing nothing else.

```ts
import { transcriptionFromEnv } from "./src/voice/transcription";

const port = transcriptionFromEnv();
const result = await port.transcribe(bytes, "voice.oga");

if (!result.ok) {
  // result.reason says why. Nothing was written anywhere.
  return;
}
result.text; // "Subí las tarjetas personales 20%"
```

`Transcription` is `{ ok: true, text }` or `{ ok: false, reason }`. There is no third state.

## Run it cold

```
bun test src/voice/transcription.test.ts      # 11 tests, no network, no key
bun scripts/transcribe.ts fixtures/<file>     # real call, needs the key
```

Environment, all three required, no defaults:

```
ELEVENLABS_API_KEY
ELEVENLABS_MODEL_ID=scribe_v2
TRANSCRIPTION_LANGUAGE=es
```

Missing any of them fails closed and names which one. It never guesses the language.

## Decisions you may want to revisit

**The port stores nothing.** The ticket said "the text is stored next to the media", but
that criterion is orphaned: it belonged to C1, which was cut and folded into C4. There is
no schema on Friday night. Storage is your call in C4.

**The provider response is flattened to text alone.** Scribe returns word timestamps,
`language_probability`, speaker ids and audio duration. All of it is dropped at the seam,
on purpose: confidence scores are not comparable across providers, so exposing them would
make the port lie about being swappable.

That matters for your acceptance criterion "an ambiguous dictated amount is not filled in".
The ambiguity signal does not come from here. Decide it downstream in `structuredOutput`,
from the text, and flag the `PriceEdit` for review.

**`Transcription` is not in `src/domain/types.ts`.** It is a detail of the voice seam, not
business vocabulary like `Intent` or `PriceEdit`. Import it from here.

## Verified against the live API

Three ways, all on Friday night:

| Input | Result |
|---|---|
| `fixtures/raise-cards.opus`, a real WhatsApp voice note, Ogg/Opus 48 kHz mono | `Subí las tarjetas un 20 %` |
| `fixtures/raise-cards.m4a`, macOS speech synthesis, AAC | `Subí las tarjetas personales 20%` |
| A bogus key | `elevenlabs 401: ...`, fails closed, writes nothing |

The Opus case is the one that matters: Telegram and WhatsApp both send voice notes as Opus
in an Ogg container, so that codec path is confirmed working, with a real Argentine voice.

Pass the real filename so the provider sees the right extension:

```ts
await port.transcribe(bytes, "voice.oga");
```

**Do not regex the percent sign.** The two transcripts above normalise the same dictated
"veinte por ciento" differently: `20%` in one, `20 %` in the other. The spacing is not
stable across inputs, and neither is the wording around it. Let `structuredOutput` read the
amount out of the sentence; anything that pattern-matches a literal will pass Friday's
fixture and fail on the owner's next audio.

## Not done

`bun run typecheck` was never run: it needs the `tsconfig.json` and `@types/bun` that come
with A1, and A1 did not exist yet on Friday night.
