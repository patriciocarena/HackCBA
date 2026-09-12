# Voice lane, C2 handoff

Read this before building on it; it is shorter than the code.

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
bun test test/voice/transcription.test.ts     # 14 tests, no network, no key
bun scripts/transcribe.ts fixtures/<file>     # real call, needs the key
```

Environment, all three required, no defaults:

```
ELEVENLABS_API_KEY
ELEVENLABS_MODEL_ID=scribe_v2
TRANSCRIPTION_LANGUAGE=es
```

`transcriptionFromEnv` throws when any of them is missing, naming all of them at once. A
missing key is a deploy that should not have started, not a transcription outcome, so it
never reaches the Result type. The language is never assumed.

Every request carries `AbortSignal.timeout(30_000)`. Without it a hung provider hangs the
webhook turn with no upper bound while Telegram retries the update underneath it. The
timeout surfaces as an ordinary `{ ok: false }`, so callers need no extra branch.

## Decisions you may want to revisit

**The port stores nothing.** The ticket said "the text is stored next to the media", but
that criterion is orphaned: it belonged to C1, which was cut and folded into C4. There is
no schema on Friday night. Storage is your call in C4.

**The provider response is flattened to text alone.** Scribe returns word timestamps,
`language_probability`, speaker ids and audio duration. All of it is dropped at the seam,
on purpose: confidence scores are not comparable across providers, so exposing them would
make the port lie about being swappable.

That matters for C4's criterion "an ambiguous dictated amount is not filled in". The
ambiguity signal does not come from here: decide it downstream, from the text.

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

## Merge order

This branch has no `package.json` and no `tsconfig.json` of its own: A1 owns both, so A1
lands first or this merges as code nobody can run. Typecheck passes against A1's config
with `@types/bun`, verified out of tree; rerun it in place once A1 is in.

## Extraction, and which models it was verified against

`structuredOutput` goes through OpenRouter, and both `strict: true` and `response_format`
itself are honoured unevenly across providers. A provider that quietly ignores the schema
returns prose, `JSON.parse` throws, and the port reports `{ ok: false }`. That fails closed,
but the feature is off and the only symptom is an operator seeing extraction failures.

Verified end to end on real voice notes with:

| `OPENROUTER_MODEL` | Result |
|---|---|
| `openai/gpt-4o-mini` | schema honoured, both fixtures correct |

Anything else needs a run of `bun scripts/dictate.ts fixtures/raise-cards.opus` before being
trusted. Cheap to check, and the failure is silent otherwise.

`Extraction` is `{ ok: true, intent }` or `{ ok: false, reason }`. A review intent means the
model answered and the answer was not actionable; `ok: false` means we never got an answer.
Do not collapse them: the first is worth asking the owner to repeat himself, the second is
not his fault.
