export type Transcription =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export interface TranscriptionPort {
  transcribe(audio: Uint8Array, filename?: string): Promise<Transcription>;
}

export interface ElevenLabsConfig {
  apiKey: string;
  modelId: string;
  languageCode: string;
  fetchImpl?: typeof fetch;
}

const ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";

export function elevenLabsTranscription(
  config: ElevenLabsConfig,
): TranscriptionPort {
  const { apiKey, modelId, languageCode, fetchImpl = fetch } = config;

  return {
    async transcribe(audio, filename = "audio.ogg") {
      const missing = [
        !apiKey && "ELEVENLABS_API_KEY",
        !modelId && "ELEVENLABS_MODEL_ID",
        !languageCode && "TRANSCRIPTION_LANGUAGE",
      ].filter(Boolean);

      if (missing.length > 0) {
        return { ok: false, reason: `missing ${missing.join(", ")}` };
      }
      if (audio.byteLength === 0) {
        return { ok: false, reason: "empty audio" };
      }

      const form = new FormData();
      form.append("file", new Blob([audio]), filename);
      form.append("model_id", modelId);
      form.append("language_code", languageCode);

      let response: Response;
      try {
        response = await fetchImpl(ENDPOINT, {
          method: "POST",
          headers: { "xi-api-key": apiKey },
          body: form,
        });
      } catch (error) {
        return { ok: false, reason: `network: ${String(error)}` };
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          ok: false,
          reason: `elevenlabs ${response.status}: ${body.slice(0, 200)}`,
        };
      }

      let payload: { text?: unknown };
      try {
        payload = await response.json();
      } catch (error) {
        return { ok: false, reason: `malformed response: ${String(error)}` };
      }

      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (!text) {
        return { ok: false, reason: "empty transcript" };
      }

      return { ok: true, text };
    },
  };
}

export function transcriptionFromEnv(
  env: Record<string, string | undefined> = process.env,
): TranscriptionPort {
  return elevenLabsTranscription({
    apiKey: env.ELEVENLABS_API_KEY ?? "",
    modelId: env.ELEVENLABS_MODEL_ID ?? "",
    languageCode: env.TRANSCRIPTION_LANGUAGE ?? "",
  });
}
