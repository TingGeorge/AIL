import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { z } from "zod";
import { needSchema } from "../shared/need.ts";
import { parseNeed, parseConfigured } from "./parse.ts";
import { transcribeAudio, sttConfigured } from "./transcribe.ts";
import { applySchema, dbConfigured } from "./db.ts";
import { search } from "./search.ts";
import { data } from "./data.ts";

const TIMEOUT_MS = 30_000;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // trust boundary: 30 s of opus/aac is well under this

class Timeout extends Error {}

const withTimeout = <T>(p: Promise<T>) => {
  let t: ReturnType<typeof setTimeout>;
  const timer = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Timeout()), TIMEOUT_MS); });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
};

// Upstream errors are logged, never echoed: they can embed the provider URL or headers.
const fail = (c: { json: (o: unknown, s: 502 | 504) => Response }, kind: "stt_failed" | "parse_failed", e: unknown) => {
  if (e instanceof Timeout) return c.json({ error: "timeout", message: "逾時" }, 504);
  console.error(kind, e);
  return c.json({ error: kind, message: kind === "stt_failed" ? "辨識失敗" : "解析失敗" }, 502);
};

// Server-resolved calendar date for the fixed area (spec §3: 由伺服器依請求當天解析).
const todayInTaipei = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });

export const app = new Hono();

app.post("/api/transcribe", async (c) => {
  if (!sttConfigured()) return c.json({ error: "stt_failed", message: "STT 未設定" }, 503);
  const form = await c.req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File)) return c.json({ error: "stt_failed", message: "缺少 audio" }, 400);
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) return c.json({ error: "stt_failed", message: "音檔為空或過大" }, 400);
  try {
    const transcript = await withTimeout(transcribeAudio(new Uint8Array(await audio.arrayBuffer())));
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
    return c.json(await withTimeout(parseNeed({ ...body.data, today: todayInTaipei() })));
  } catch (e) {
    return fail(c, "parse_failed", e);
  }
});

// 新路由一定要掛在 serveStatic 的 catch-all 之前，否則會被靜態檔案接走（SPEC-backend §5.2）。
app.route("/", search);
app.route("/", data);

app.use("/*", serveStatic({ root: "./dist" }));
app.get("/*", serveStatic({ path: "./dist/index.html" }));

// 只有直接執行這個檔案時才碰資料庫。tests/routes.test.ts 是 import app，import.meta.main 為 false，
// 所以測試環境不需要 PostgreSQL（SPEC-backend §5.2）。
if (import.meta.main && dbConfigured()) await applySchema();

export default { port: Number(process.env.PORT ?? 3000), fetch: app.fetch };
