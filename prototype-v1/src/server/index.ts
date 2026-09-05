import { GeminiError } from "./gemini.ts";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { z } from "zod";
import { needSchema } from "../shared/need.ts";
import { parseNeed, parseConfigured } from "./parse.ts";
import { parseVoice, voiceConfigured, audioMime, audioEnvelopeMatches, MAX_AUDIO_BYTES, NoSpeechError } from "./voice.ts";
import { rankingConfigured } from "./rank.ts";
import { readVoiceUpload, VoiceUploadError } from "./voice-upload.ts";
import { applySchema, dbConfigured } from "./db.ts";
import { search } from "./search.ts";
import { data } from "./data.ts";
import { auth } from "./auth.ts";
import { account } from "./account.ts";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";

const TIMEOUT_MS = 30_000;

class Timeout extends Error {}

const withTimeout = <T>(run:(signal:AbortSignal)=>Promise<T>, requestSignal:AbortSignal) => {
  const controller=new AbortController();
  let t: ReturnType<typeof setTimeout>;
  const timer = new Promise<never>((_, rej) => { t = setTimeout(() => {rej(new Timeout());controller.abort();}, TIMEOUT_MS); });
  return Promise.race([run(AbortSignal.any([controller.signal,requestSignal])), timer]).finally(() => clearTimeout(t));
};

// Upstream errors are logged, never echoed: they can embed the provider URL or headers.
const fail = (c: { json: (o: unknown, s: 502 | 504) => Response }, kind: "voice_failed" | "parse_failed", e: unknown) => {
  if (e instanceof Timeout || (e instanceof DOMException && e.name === "TimeoutError")) return c.json({ error: "timeout", message: "逾時" }, 504);
  console.error(kind, e instanceof GeminiError ? `${e.kind}:${e.status}` : e instanceof Error ? e.name : "unknown_error");
  if (e instanceof GeminiError) return c.json({ error: `gemini_${e.kind}`, message: e.publicMessage, upstream_status: e.status || undefined }, 502);
  return c.json({ error: kind, message: kind === "voice_failed" ? "語音解析失敗，請重試或改用文字" : "解析失敗" }, 502);
};

// Server-resolved calendar date for the fixed area (spec §3: 由伺服器依請求當天解析).
const todayInTaipei = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });

export const app = new Hono();
app.use("*", secureHeaders({ referrerPolicy: "no-referrer", xFrameOptions: "DENY" }));
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
  // Streaming helpers set their own cache policy; personal search responses must still not be stored.
  c.header("Cache-Control", "no-store");
});
app.use("/api/*", bodyLimit({ maxSize: 6 * 1024 * 1024, onError: c => c.json({error:"too_large",message:"請求內容過大"},413) }));
app.use("/api/parse", bodyLimit({maxSize:32*1024,onError:c=>c.json({error:"too_large",message:"請求內容過大"},413)}));
app.use("/api/search", bodyLimit({maxSize:32*1024,onError:c=>c.json({error:"too_large",message:"請求內容過大"},413)}));
app.onError((error,c) => { console.error("request_failed",error instanceof Error ? error.name : "unknown_error"); return c.json({error:"server_error",message:"服務暫時無法完成，請稍後重試。"},500); });
app.get("/api/config", c => c.json({ database:dbConfigured(), parse:parseConfigured(), voice:voiceConfigured(), ranking:rankingConfigured(), support_email:process.env.SUPPORT_EMAIL || null, area:"圓山區" }));
app.get("/api/health", c => c.json({status:"ok"}));

app.post("/api/voice", async (c) => {
  if (!voiceConfigured()) return c.json({ error: "voice_failed", message: "Gemini 未設定，可改用手動搜尋" }, 503);
  let audio: Awaited<ReturnType<typeof readVoiceUpload>>;
  try { audio = await readVoiceUpload(c.req.raw); } catch (error) {
    if (error instanceof VoiceUploadError && error.kind === "too_large") return c.json({ error: "too_large", message: "音檔不可超過 5 MiB" }, 413);
    return c.json({ error: "voice_failed", message: "請上傳一份 audio 音檔" }, 400);
  }
  if (audio.bytes.byteLength === 0) return c.json({ error: "voice_failed", message: "音檔為空" }, 400);
  if (audio.bytes.byteLength > MAX_AUDIO_BYTES) return c.json({ error: "too_large", message: "音檔不可超過 5 MiB" }, 413);
  const mime = audioMime(audio.type);
  if (!mime) return c.json({ error: "unsupported_audio", message: "不支援此音訊格式，請重新錄音或改用文字" }, 415);
  try {
    const bytes = audio.bytes;
    if (!audioEnvelopeMatches(bytes, mime)) return c.json({ error: "unsupported_audio", message: "音訊內容與格式不符，請重新錄音" }, 415);
    return c.json(await withTimeout(signal => parseVoice({ audio: bytes, mimeType: mime, today: todayInTaipei() }, signal), c.req.raw.signal));
  } catch (e) {
    if (e instanceof NoSpeechError) return c.json({ error: "no_speech", message: "沒有辨識到語音，請重錄或改用文字" }, 422);
    return fail(c, "voice_failed", e);
  }
});

const parseBody = z.object({
  transcript: z.string().min(1).max(2000),
  current: needSchema.nullable().default(null),
});

app.post("/api/parse", async (c) => {
  if (!parseConfigured()) return c.json({ error: "parse_failed", message: "Gemini 未設定" }, 503);
  const body = parseBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "parse_failed", message: "請求格式錯誤" }, 400);
  try {
    return c.json(await withTimeout(signal=>parseNeed({ ...body.data, today: todayInTaipei() },signal),c.req.raw.signal));
  } catch (e) {
    return fail(c, "parse_failed", e);
  }
});

// 新路由一定要掛在 serveStatic 的 catch-all 之前，否則會被靜態檔案接走（SPEC-backend §5.2）。
app.route("/", search);
app.route("/", data);
app.route("/", auth);
app.route("/", account);
// API typos must never become a successful HTML response.
app.all("/api/*", c => c.json({error:"not_found",message:"找不到此 API"},404));

app.use("/*",async(c,next)=>{if(c.req.path==="/sw.js"||c.req.path==="/"||c.req.path.endsWith(".html"))c.header("Cache-Control","no-cache");await next();});
app.use("/*", serveStatic({ root: "./dist" }));
app.get("/*", serveStatic({ path: "./dist/index.html" }));

// 只有直接執行這個檔案時才碰資料庫。tests/routes.test.ts 是 import app，import.meta.main 為 false，
// 所以測試環境不需要 PostgreSQL（SPEC-backend §5.2）。
if (import.meta.main && dbConfigured()) await applySchema();

export default { port: Number(process.env.PORT ?? 3000), fetch: app.fetch };
