// GET /api/candidates/:id 與 GET /api/candidates?ids=…（SPEC-backend §5.1、票 11）。
// 兩條路徑與 /api/search 共用同一個 rowToRec：資料庫列到畫面物件只有這一個轉換。
import { Hono } from "hono";
import { rowToRec } from "../shared/records.ts";
import { sql, dbConfigured } from "./db.ts";
import { publicRecords, summarizeCatalog } from "./catalog.ts";

const MAX_IDS = 200;   // trust boundary：query string 帶進來的 id 數量要有上限

export const data = new Hono();

const failed = (c: { json: (o: unknown, s: 502) => Response }, e: unknown) => {
  console.error("candidates_failed", e instanceof Error ? e.name : "unknown_error");   // 上游錯誤只寫 log，不回傳
  return c.json({ error: "candidates_failed", message: "讀取失敗" }, 502);
};

data.get("/api/candidates", async (c) => {
  const ids = (c.req.query("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length > MAX_IDS) return c.json({ error: "candidates_failed", message: `一次最多 ${MAX_IDS} 筆` }, 400);
  if (ids.length === 0) return c.json([]);
  try {
    // 查不到的 id 只是不在結果裡，不讓整個請求失敗（票 11）。
    const rows = await sql`select * from candidates where id = any(${sql.array(ids, "text")})`;
    return c.json(publicRecords(rows.map(rowToRec)));
  } catch (e) {
    return failed(c, e);
  }
});

data.get("/api/candidates/:id", async (c) => {
  try {
    const rows = await sql`select * from candidates where id = ${c.req.param("id")}`;
    const visible = publicRecords(rows.map(rowToRec));
    if (visible.length === 0) return c.json({ error: "not_found", message: "找不到這筆紀錄" }, 404);
    return c.json(visible[0]);
  } catch (e) {
    return failed(c, e);
  }
});

// Public coverage/readiness, without user data or provider secrets.
data.get("/api/catalog", async c => {
  if (!dbConfigured()) return c.json({error:"database_unconfigured",message:"尚未設定資料庫"},503);
  try { return c.json(summarizeCatalog(publicRecords((await sql`select * from candidates`).map(rowToRec)))); }
  catch(error) { return failed(c,error); }
});
