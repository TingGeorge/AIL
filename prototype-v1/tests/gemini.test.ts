import { afterEach, beforeEach, expect, test } from "bun:test";
import { z } from "zod";
import { generateStructured, geminiConfigured, GeminiError } from "../src/server/gemini.ts";
import { parseNeed } from "../src/server/parse.ts";
import { parseVoice, audioMime, audioEnvelopeMatches, NoSpeechError } from "../src/server/voice.ts";
import { EMPTY_NEED } from "../src/shared/need.ts";

const originalFetch = globalThis.fetch;
const keys = ["GEMINI_API_KEY", "GEMINI_MODEL"] as const;
let saved: (string | undefined)[];
beforeEach(() => {
  saved = keys.map(key => process.env[key]);
  process.env.GEMINI_API_KEY = "test-only-secret";
  process.env.GEMINI_MODEL = "gemini-test";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  keys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; });
});
const completed = (value: unknown) => ({ status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(value) }] }] });
const output = { transcript: "兩人晚餐三百元，不吃牛", need: { ...EMPTY_NEED, need: "晚餐", budget_total_twd: 300, people_or_servings: 2, exclude_tags: ["牛"] } };
function mockResponse(value: unknown, status = 200) {
  globalThis.fetch = (async () => Response.json(value, { status })) as unknown as typeof fetch;
}

test("Gemini requires an explicit key and model and rejects URL-like model settings", () => {
  expect(geminiConfigured()).toBe(true);
  process.env.GEMINI_MODEL = "https://attacker.test";
  expect(geminiConfigured()).toBe(false);
  process.env.GEMINI_MODEL = "gemini-test";
  process.env.GEMINI_API_KEY = " ";
  expect(geminiConfigured()).toBe(false);
});

test("audio produces transcript AND Need in exactly one native Gemini request, without persistent interaction storage", async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => { requests.push({ url: String(url), init: init! }); return Response.json(completed(output)); }) as unknown as typeof fetch;
  const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
  expect(await parseVoice({ audio, mimeType: "audio/webm", today: "2026-09-05" })).toEqual(output);
  expect(requests).toHaveLength(1);
  expect(requests[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
  expect(requests[0]!.url).not.toContain("test-only-secret");
  const init = requests[0]!.init;
  expect(new Headers(init.headers).get("x-goog-api-key")).toBe("test-only-secret");
  const body = JSON.parse(String(init.body));
  expect(body.model).toBe("gemini-test");
  expect(body.store).toBe(false);
  expect(body.background).toBe(false);
  expect(body.stream).toBe(false);
  expect(body).not.toHaveProperty("previous_interaction_id");
  expect(body).not.toHaveProperty("tools");
  expect(body.input[1]).toEqual({ type: "audio", mime_type: "audio/webm", data: Buffer.from(audio).toString("base64") });
  expect(JSON.parse(body.input[0].text)).toEqual({ today: "2026-09-05", current: null });
  expect(body.response_format.type).toBe("text");
  expect(body.response_format.mime_type).toBe("application/json");
  expect(body.response_format.schema.required).toEqual(["transcript", "need"]);
  expect(body.system_instruction).toContain("不確定");
  expect(init.signal).toBeInstanceOf(AbortSignal);
});

test("text corrections use the same Gemini provider and retain current need and Taipei date", async () => {
  let body: any;
  globalThis.fetch = (async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => { body = JSON.parse(String(init?.body)); return Response.json(completed(output.need)); }) as unknown as typeof fetch;
  expect(await parseNeed({ transcript: "改成兩人", current: { ...EMPTY_NEED, budget_total_twd: 300 }, today: "2026-09-05" })).toEqual(output.need);
  expect(body.input).toHaveLength(1);
  expect(body.input[0].type).toBe("text");
  expect(JSON.parse(body.input[0].text).current.budget_total_twd).toBe(300);
  expect(JSON.parse(body.input[0].text).today).toBe("2026-09-05");
});

test("rejects invalid JSON, incomplete/blocked output and schema violations", async () => {
  const invalid = [
    { status: "incomplete", steps: [] }, { ...completed(output), status: "failed" },
    { status: "completed", steps: [] },
    { status: "completed", errors: [{ message: "provider-secret" }], steps: [] },
    { status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "not JSON" }] }] },
    { status: "completed", steps: [{ type: "thought", content: [{ type: "text", text: JSON.stringify(output) }] }] },
    { status: "completed", steps: [{ type: "model_output", content: [{ type: "image", data: "wrong" }] }] },
    completed({ ...output, need: { ...output.need, budget_total_twd: -1 } }),
    completed({ ...output, need: { ...output.need, target_categories: ["invented"] } }),
    completed({ ...output, unexpected: true }),
  ];
  for (const response of invalid) {
    mockResponse(response);
    await expect(parseVoice({ audio: new Uint8Array(12), mimeType: "audio/wav", today: "2026-09-05" })).rejects.toBeInstanceOf(GeminiError);
  }
});

test("empty speech is actionable rather than a fabricated requirement", async () => {
  mockResponse(completed({ transcript: " ", need: EMPTY_NEED }));
  await expect(parseVoice({ audio: new Uint8Array(12), mimeType: "audio/wav", today: "2026-09-05" })).rejects.toBeInstanceOf(NoSpeechError);
});

test("upstream errors never expose key, audio, response text, or request URL", async () => {
  mockResponse({ error: "test-only-secret; private audio transcript" }, 429);
  await expect(generateStructured({ system: "test", input: [], schema: z.object({ value: z.string() }) })).rejects.toThrow("Gemini could not produce a valid structured response");
});

test("cancellation aborts the provider call and is not retried", async () => {
  const controller = new AbortController();
  let calls = 0;
  globalThis.fetch = (async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls++;
    return new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true }));
  }) as unknown as typeof fetch;
  const pending = generateStructured({ system: "test", input: [], schema: z.string(), signal: controller.signal });
  controller.abort(new DOMException("Stopped", "AbortError"));
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toBe(1);
});

test("validates documented audio envelopes including Chromium WebM and Safari M4A", () => {
  expect(audioMime("audio/webm;codecs=opus")).toBe("audio/webm");
  expect(audioMime("audio/mp4;codecs=mp4a.40.2")).toBe("audio/m4a");
  expect(audioMime("audio/x-wav")).toBe("audio/wav");
  expect(audioMime("text/html")).toBeNull();
  expect(audioMime("")).toBeNull();
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
  expect(audioEnvelopeMatches(webm, "audio/webm")).toBe(true);
  expect(audioEnvelopeMatches(webm, "audio/wav")).toBe(false);
  expect(audioEnvelopeMatches(new TextEncoder().encode("0000ftypM4A "), "audio/m4a")).toBe(true);
  expect(audioEnvelopeMatches(new TextEncoder().encode("RIFF0000WAVE"), "audio/wav")).toBe(true);
  expect(audioEnvelopeMatches(new Uint8Array(0), "audio/webm")).toBe(false);
});

test("provider schema omits undocumented annotations without weakening local validation", async () => {
  const schema = z.object({ pattern: z.string().min(3).max(5).regex(/^ABC/), default: z.string().default("x") });
  let body: any;
  process.env.GEMINI_MODEL = "models/gemini-test";
  globalThis.fetch = (async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return Response.json(completed({ pattern: "x", default: "x" }));
  }) as unknown as typeof fetch;
  await expect(generateStructured({ system: "test", input: [], schema })).rejects.toBeInstanceOf(GeminiError);
  expect(body.model).toBe("gemini-test");
  expect(body.response_format.schema).toEqual({
    type: "object", properties: { pattern: { type: "string" }, default: { type: "string" } },
    required: ["pattern", "default"], additionalProperties: false,
  });
});

test("provider authentication, quota, network and malformed output have safe distinct diagnostics", async () => {
  for (const [status, kind] of [[401,"auth"],[403,"auth"],[429,"quota"],[503,"unavailable"],[400,"request"]] as const) {
    mockResponse({error:"test-only-secret"},status);
    try { await generateStructured({system:"test",input:[],schema:z.string()}); throw new Error("unexpected success"); }
    catch (error) {
      expect(error).toMatchObject({name:"GeminiError",kind,status});
      expect(JSON.stringify(error)).not.toContain("test-only-secret");
    }
  }
});

test("network transport failures and invalid provider JSON are distinguishable and sanitized", async () => {
  globalThis.fetch = (async()=>{throw new TypeError("private-url-with-key")}) as unknown as typeof fetch;
  await expect(generateStructured({system:"test",input:[],schema:z.string()})).rejects.toMatchObject({kind:"network",status:0});
  globalThis.fetch = (async()=>new Response("private invalid response")) as unknown as typeof fetch;
  await expect(generateStructured({system:"test",input:[],schema:z.string()})).rejects.toMatchObject({kind:"invalid_response",status:0});
});
