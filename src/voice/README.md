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

## The one thing that was not verified

Tested against a macOS-generated `.m4a` (AAC). Both paths confirmed against the live API:
a real transcript, and a 401 that fails closed.

**Telegram voice notes arrive as `.oga` with the Opus codec, which was never tested.** If
Scribe rejects Opus, that is where it breaks, and it will break inside C4. Test it with a
real Telegram voice note before you build on top of this. The port takes a filename
argument precisely so the provider sees the right extension:

```ts
await port.transcribe(bytes, "voice.oga");
```

## Not done

`bun run typecheck` was never run: it needs the `tsconfig.json` and `@types/bun` that come
with A1, and A1 did not exist yet on Friday night.
