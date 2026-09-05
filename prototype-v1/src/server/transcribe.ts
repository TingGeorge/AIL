import { createOpenAI } from "@ai-sdk/openai";
import { transcribe } from "ai";

// ponytail: @ai-sdk/openai-compatible has no transcription model, so the STT
// side uses @ai-sdk/openai pointed at an OpenAI-format /audio/transcriptions.
const stt = () =>
  createOpenAI({ baseURL: process.env.STT_BASE_URL, apiKey: process.env.STT_API_KEY ?? "" });

export const sttConfigured = () => Boolean(process.env.STT_BASE_URL && process.env.STT_MODEL);

export async function transcribeAudio(audio: Uint8Array, signal?:AbortSignal): Promise<string> {
  const { text } = await transcribe({
    abortSignal: signal,
    model: stt().transcription(process.env.STT_MODEL ?? ""),
    audio,
    providerOptions: { openai: { language: "zh" } }, // OpenAI-format STT takes ISO-639-1; zh-TW is fixed by product, not by request
  });
  return text.trim();
}
