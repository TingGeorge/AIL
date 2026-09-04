import { expect, test } from "bun:test";
import { app } from "../src/server/index.ts";

// API contract checks that need no provider (spec §4 error shapes).
const post = (path: string, body: BodyInit, headers?: Record<string, string>) =>
  app.request(path, { method: "POST", body, headers });

test("parse: 503 when LLM is unconfigured", async () => {
  delete process.env.LLM_BASE_URL;
  const res = await post("/api/parse", JSON.stringify({ transcript: "晚餐" }), { "content-type": "application/json" });
  expect(res.status).toBe(503);
  expect((await res.json()).error).toBe("parse_failed");
});

test("parse: 400 on malformed body", async () => {
  process.env.LLM_BASE_URL = "http://127.0.0.1:9";
  process.env.LLM_MODEL = "x";
  const res = await post("/api/parse", "{}", { "content-type": "application/json" });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "parse_failed", message: "請求格式錯誤" });
});

test("parse: upstream failure is 502 with a fixed message, no leaked detail", async () => {
  process.env.LLM_BASE_URL = "http://127.0.0.1:9";
  process.env.LLM_MODEL = "x";
  const res = await post("/api/parse", JSON.stringify({ transcript: "晚餐" }), { "content-type": "application/json" });
  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({ error: "parse_failed", message: "解析失敗" });
}, 20_000); // SDK retries with backoff before failing

test("transcribe: 400 without audio, 400 on empty clip", async () => {
  process.env.STT_BASE_URL = "http://127.0.0.1:9";
  process.env.STT_MODEL = "w";
  const noAudio = new FormData();
  noAudio.append("other", "1");
  expect((await post("/api/transcribe", noAudio)).status).toBe(400);
  const empty = new FormData();
  empty.append("audio", new File([], "clip"));
  expect((await post("/api/transcribe", empty)).status).toBe(400);
});
