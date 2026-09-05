import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { z } from "zod";
import { needSchema } from "../shared/need.ts";
import { parseNeed, parseConfigured } from "./parse.ts";
import { transcribeAudio, sttConfigured } from "./transcribe.ts";
import { applySchema, dbConfigured } from "./db.ts";
import { search } from "./search.ts";
import { data } from "./data.ts";
import { auth } from "./auth.ts";
import { account } from "./account.ts";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";

const TIMEOUT_MS = 30_000;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // trust boundary: 30 s of opus/aac is well under this

class Timeout extends Error {}

const withTimeout = <T>(run:(signal:AbortSignal)=>Promise<T>, requestSignal:AbortSignal) => {
  const controller=new AbortController();
  let t: ReturnType<typeof setTimeout>;
  const timer = new Promise<never>((_, rej) => { t = setTimeout(() => {rej(new Timeout());controller.abort();}, TIMEOUT_MS); });
  return Promise.race([run(AbortSignal.any([controller.signal,requestSignal])), timer]).finally(() => clearTimeout(t));
};

// Upstream errors are logged, never echoed: they can embed the provider URL or headers.
const fail = (c: { json: (o: unknown, s: 502 | 504) => Response }, kind: "stt_failed" | "parse_failed", e: unknown) => {
  if (e instanceof Timeout) return c.json({ error: "timeout", message: "逾時" }, 504);
  console.error(kind, e instanceof Error ? e.name : "unknown_error");
  return c.json({ error: kind, message: kind === "stt_failed" ? "辨識失敗" : "解析失敗" }, 502);
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
app.get("/api/config", c => c.json({ database:dbConfigured(), parse:parseConfigured(), transcribe:sttConfigured(), ranking:parseConfigured(), support_email:process.env.SUPPORT_EMAIL || null, area:"圓山區" }));
app.get("/api/health", c => c.json({status:"ok"}));

app.post("/api/transcribe", async (c) => {
  if (!sttConfigured()) return c.json({ error: "stt_failed", message: "STT 未設定" }, 503);
  const form = await c.req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File)) return c.json({ error: "stt_failed", message: "缺少 audio" }, 400);
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) return c.json({ error: "stt_failed", message: "音檔為空或過大" }, 400);
  try {
    const bytes=new Uint8Array(await audio.arrayBuffer());
    const transcript = await withTimeout(signal=>transcribeAudio(bytes,signal),c.req.raw.signal);
    return c.json({ transcript });
  } catch (e) {
    return fail(c, "stt_failed", e);
  }
});

const parseBody = z.object({
  transcript: z.string().min(1).max(2000),
  current: needSchema.nullable().default(null),
});

app.post("/api/parse", async (c) => {
  if (!parseConfigured()) return c.json({ error: "parse_failed", message: "LLM 未設定" }, 503);
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
