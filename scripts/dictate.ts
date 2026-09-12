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

const extracted = await extractionFromEnv().extract(heard.text);

if (!extracted.ok) {
  console.error(`extraction failed: ${extracted.reason}`);
  console.error("\nthis is our fault, not the owner's. nothing to ask him to repeat.");
  process.exit(1);
}

const intent = extracted.intent;

if (intent.kind === "review") {
  console.log(`intent: REVIEW (${intent.reason}) — ${intent.detail}`);
  console.log("\nno price was changed, and none was guessed.");
  process.exit(0);
}

const change =
  intent.change.kind === "percent"
    ? `${intent.change.direction} by ${intent.change.value}%`
    : `set to $${intent.change.amount}`;

console.log(`intent: "${intent.target}" ${change}`);
console.log("\nthis is a proposal. a person still has to confirm it.");
