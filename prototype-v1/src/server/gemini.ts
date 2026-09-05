import { z } from "zod";

// Fixed Google origin: keys cannot be redirected through a client-supplied URL.
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const GEMINI_TIMEOUT_MS = 30_000;
export type GeminiInput = { type: "text"; text: string } | { type: "audio"; data: string; mime_type: string };
const configuredModel = () => (process.env.GEMINI_MODEL?.trim() ?? "").replace(/^models\//, "");
export const geminiConfigured = () => Boolean(process.env.GEMINI_API_KEY?.trim()
  && /^gemini-[a-zA-Z0-9._-]+$/.test(configuredModel()));

export type GeminiFailure = "auth" | "quota" | "unavailable" | "request" | "network" | "invalid_response" | "not_configured";
const messages: Record<GeminiFailure, string> = {
  auth:"智慧功能目前無法驗證連線權限，請聯絡管理員。", quota:"智慧功能目前忙碌中，請稍後重試。",
  unavailable:"智慧功能暫時無法使用，請稍後重試。", request:"智慧功能的服務設定不相容，請改用自行設定條件。",
  network:"目前無法連線至智慧功能，請稍後重試。", invalid_response:"智慧功能的回應格式不正確，請重試或自行設定條件。",
  not_configured:"智慧功能尚未啟用，請自行設定條件。",
};
export class GeminiError extends Error {
  constructor(public kind: GeminiFailure = "invalid_response", public status = 0) {
    super("Gemini could not produce a valid structured response"); this.name = "GeminiError";
  }
  get publicMessage() { return messages[this.kind]; }
}

const textContent = z.object({ type: z.literal("text"), text: z.string() });
const interactionSchema = z.object({
  status: z.literal("completed"),
  steps: z.array(z.object({ type: z.string(), content: z.array(z.unknown()).optional() })),
  errors: z.array(z.unknown()).optional(),
});

// Use only documented constraints at the provider boundary. Keep the original
// Zod schema for local validation (lengths, date patterns/refinements, defaults).
function providerSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(providerSchema);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    if (["$schema", "default", "pattern", "minLength", "maxLength"].includes(key)) return [];
    // Property names are user/domain names, not schema keywords.
    if (["properties", "$defs", "definitions"].includes(key)) return [[key,
      Object.fromEntries(Object.entries(child as Record<string, unknown>).map(([name, schema]) => [name, providerSchema(schema)])),
    ]];
    return [[key, providerSchema(child)]];
  }));
}

export async function generateStructured<T>({ system, input, schema, signal }: {
  system: string; input: GeminiInput[]; schema: z.ZodType<T>; signal?: AbortSignal;
}): Promise<T> {
  if (!geminiConfigured()) throw new GeminiError("not_configured");
  const requestSignal = AbortSignal.any([AbortSignal.timeout(GEMINI_TIMEOUT_MS), ...(signal ? [signal] : [])]);
  requestSignal.throwIfAborted();
  const jsonSchema = providerSchema(z.toJSONSchema(schema));
  let received = false;
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY!.trim() },
      body: JSON.stringify({
        model: configuredModel(),
        system_instruction: system,
        input,
        response_format: { type: "text", mime_type: "application/json", schema: jsonSchema },
        generation_config: { max_output_tokens: 8192 },
        stream: false,
        background: false,
        // No persistent interaction/session and no Files API uploads.
        store: false,
      }),
      signal: requestSignal,
    });
    received = true;
    if (!response.ok) {
      await response.body?.cancel();
      const kind = response.status === 401 || response.status === 403 ? "auth" : response.status === 429 ? "quota" : response.status >= 500 ? "unavailable" : "request";
      throw new GeminiError(kind, response.status);
    }
    const interaction = interactionSchema.parse(await response.json());
    if (interaction.errors?.length) throw new GeminiError();
    const outputs = interaction.steps.filter(step => step.type === "model_output");
    if (outputs.length !== 1 || !outputs[0]?.content?.length) throw new GeminiError();
    // Never parse thoughts, tool calls, or partial/blocked answers as user requirements.
    const text = outputs[0].content.map(part => textContent.parse(part).text).join("");
    return schema.parse(JSON.parse(text));
  } catch (error) {
    if (requestSignal.aborted) throw requestSignal.reason;
    if (error instanceof DOMException && error.name === "TimeoutError") throw new DOMException("Gemini timed out", "TimeoutError");
    // Do not propagate provider messages, request bodies, audio, or keys to UI/logs.
    if (error instanceof GeminiError) throw error;
    throw new GeminiError(received ? "invalid_response" : "network");
  }
}
