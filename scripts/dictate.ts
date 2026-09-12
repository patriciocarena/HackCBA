import { transcriptionFromEnv } from "../src/voice/transcription";
import { extractionFromEnv } from "../src/voice/price-edit-intent";

const path = process.argv[2];

if (!path) {
  console.error("usage: bun scripts/dictate.ts <audio-file>");
  process.exit(2);
}

const file = Bun.file(path);

if (!(await file.exists())) {
  console.error(`no such file: ${path}`);
  process.exit(2);
}

const audio = new Uint8Array(await file.arrayBuffer());
const heard = await transcriptionFromEnv().transcribe(
  audio,
  path.split("/").pop(),
);

if (!heard.ok) {
  console.error(`transcription failed: ${heard.reason}`);
  process.exit(1);
}

console.log(`heard:  ${heard.text}`);

const intent = await extractionFromEnv().extract(heard.text);

if (intent.kind === "review") {
  console.log(`intent: REVIEW (${intent.reason}) — ${intent.detail}`);
  console.log("\nno price was changed, and none was guessed.");
  process.exit(0);
}

const change =
  intent.change.kind === "percent"
    ? `${intent.change.value}%`
    : `$${intent.change.amount}`;

console.log(`intent: ${intent.direction} "${intent.target}" by ${change}`);
console.log("\nthis is a proposal. a person still has to confirm it.");
