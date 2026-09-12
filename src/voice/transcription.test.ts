import { describe, expect, test } from "bun:test";
import {
  elevenLabsTranscription,
  transcriptionFromEnv,
  type ElevenLabsConfig,
  type TranscriptionPort,
} from "./transcription";

const AUDIO = new Uint8Array([1, 2, 3, 4]);

const CONFIG: Omit<ElevenLabsConfig, "fetchImpl"> = {
  apiKey: "test-key",
  modelId: "scribe_v2",
  languageCode: "es",
};

function portReturning(response: Response | Error): TranscriptionPort {
  return elevenLabsTranscription({
    ...CONFIG,
    fetchImpl: async () => {
      if (response instanceof Error) throw response;
      return response;
    },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("elevenLabsTranscription", () => {
  test("a test audio transcribes and the text comes back", async () => {
    const port = portReturning(
      jsonResponse({
        text: "subí las tarjetas 20 por ciento",
        language_code: "es",
        language_probability: 0.99,
      }),
    );

    const result = await port.transcribe(AUDIO);

    expect(result).toEqual({ ok: true, text: "subí las tarjetas 20 por ciento" });
  });

  test("the rich provider response is flattened to text alone", async () => {
    const port = portReturning(
      jsonResponse({
        text: "hola",
        words: [{ text: "hola", start: 0, end: 0.4, speaker_id: "0" }],
        audio_duration_secs: 0.4,
      }),
    );

    const result = await port.transcribe(AUDIO);

    expect(Object.keys(result).sort()).toEqual(["ok", "text"]);
  });

  test("the language and model travel to the provider as sent", async () => {
    let sent: FormData | undefined;
    const port = elevenLabsTranscription({
      ...CONFIG,
      fetchImpl: async (_url, init) => {
        sent = init?.body as FormData;
        return jsonResponse({ text: "ok" });
      },
    });

    await port.transcribe(AUDIO);

    expect(sent?.get("model_id")).toBe("scribe_v2");
    expect(sent?.get("language_code")).toBe("es");
  });

  test("a rejected request records the reason and returns nothing else", async () => {
    const port = portReturning(new Response("unauthorized", { status: 401 }));

    const result = await port.transcribe(AUDIO);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("401");
  });

  test("a network failure records the reason", async () => {
    const port = portReturning(new Error("connection reset"));

    const result = await port.transcribe(AUDIO);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("connection reset");
  });

  test("a transcript with no speech in it fails instead of returning empty text", async () => {
    const port = portReturning(jsonResponse({ text: "   " }));

    const result = await port.transcribe(AUDIO);

    expect(result).toEqual({ ok: false, reason: "empty transcript" });
  });

  test("empty audio never reaches the provider", async () => {
    let called = false;
    const port = elevenLabsTranscription({
      ...CONFIG,
      fetchImpl: async () => {
        called = true;
        return jsonResponse({ text: "should not happen" });
      },
    });

    const result = await port.transcribe(new Uint8Array());

    expect(called).toBe(false);
    expect(result).toEqual({ ok: false, reason: "empty audio" });
  });
});

describe("configuration fails closed", () => {
  test("a missing key names what is missing", async () => {
    const port = transcriptionFromEnv({
      ELEVENLABS_MODEL_ID: "scribe_v2",
      TRANSCRIPTION_LANGUAGE: "es",
    });

    const result = await port.transcribe(AUDIO);

    expect(result).toEqual({ ok: false, reason: "missing ELEVENLABS_API_KEY" });
  });

  test("an unconfigured environment names every missing variable", async () => {
    const port = transcriptionFromEnv({});

    const result = await port.transcribe(AUDIO);

    expect(result).toEqual({
      ok: false,
      reason:
        "missing ELEVENLABS_API_KEY, ELEVENLABS_MODEL_ID, TRANSCRIPTION_LANGUAGE",
    });
  });

  test("the language is never assumed when it is not configured", async () => {
    const port = transcriptionFromEnv({
      ELEVENLABS_API_KEY: "k",
      ELEVENLABS_MODEL_ID: "scribe_v2",
    });

    const result = await port.transcribe(AUDIO);

    expect(result).toEqual({
      ok: false,
      reason: "missing TRANSCRIPTION_LANGUAGE",
    });
  });
});

describe("the port contract holds for any implementation", () => {
  const fake: TranscriptionPort = {
    async transcribe() {
      return { ok: true, text: "from another provider" };
    },
  };

  test("a caller depends on the port, never on ElevenLabs", async () => {
    const result = await fake.transcribe(AUDIO);

    expect(result).toEqual({ ok: true, text: "from another provider" });
  });
});
