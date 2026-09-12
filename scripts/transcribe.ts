import { transcriptionFromEnv } from "../src/voice/transcription";

const path = process.argv[2];

if (!path) {
  console.error("usage: bun scripts/transcribe.ts <audio-file>");
  process.exit(2);
}

const file = Bun.file(path);

if (!(await file.exists())) {
  console.error(`no such file: ${path}`);
  process.exit(2);
}

const port = transcriptionFromEnv();

const audio = new Uint8Array(await file.arrayBuffer());
const result = await port.transcribe(audio, path.split("/").pop());

if (!result.ok) {
  console.error(`failed: ${result.reason}`);
  process.exit(1);
}

console.log(result.text);
