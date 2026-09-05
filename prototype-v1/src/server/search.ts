// POST /api/search：第一階段篩選 + SSE（SPEC-backend §7.1、§8）。
// 本輪只有第一階段：每個 (agent, category) 群組直接依總可比成本推出去；LLM 排序是票 06。
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { needSchema } from "../shared/need.ts";
import { filterStage, haversineKm, rowToRec, type Rec } from "../shared/records.ts";
import { sql } from "./db.ts";

// 台灣範圍以外的座標當成沒有座標（SPEC-backend §7）。
const inTaiwan = (l: { lat: number; lng: number }) => l.lat >= 21.5 && l.lat <= 25.5 && l.lng >= 118 && l.lng <= 122.5;

const searchBody = z.object({
  need: needSchema,
  exclude: z.array(z.string().max(20)).max(20).default([]),
  location: z.object({ lat: z.number(), lng: z.number() }).nullable().default(null),
  costco_ok: z.boolean().default(false),
});

export const search = new Hono();

search.post("/api/search", async (c) => {
  const body = searchBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "search_failed", message: "請求格式錯誤" }, 400);
  const { need, exclude, costco_ok } = body.data;
  const location = body.data.location && inTaiwan(body.data.location) ? body.data.location : null;

  let recs: Rec[];
  try {
    // ponytail: 整表讀出、在 TypeScript 篩選。上限約 1 萬列，升級路徑是把條件推進 SQL WHERE。
    recs = (await sql`select * from candidates`).map(rowToRec);
  } catch (e) {
    console.error("search_failed", e);   // 上游錯誤只寫 log，不回傳
    return c.json({ error: "search_failed", message: "搜尋失敗" }, 502);
  }

  // 使用者座標只用在這一次計算：不寫入資料庫、不寫進 log（SPEC-geocoding）。
  if (location) {
    for (const r of recs) {
      if (r.lat !== null && r.lng !== null) r.distance_km = Math.round(haversineKm(location, { lat: r.lat, lng: r.lng }) * 100) / 100;
    }
  }

  const stage = filterStage(recs, need, exclude, costco_ok);

  // 兩個 Agent 各自的類別群組。票 06 會把每一組交給 LLM 排序，所以這裡先分好。
  const groups = new Map<string, Rec[]>();
  for (const r of stage.main) {
    const key = `${r.agent} ${r.category}`;
    const g = groups.get(key);
    if (g) g.push(r); else groups.set(key, [r]);
  }
  const groupsOf = (agent: string) => [...groups.keys()].filter((k) => k.startsWith(`${agent} `)).length;

  return streamSSE(c, async (stream) => {
    const send = (o: unknown) => stream.writeSSE({ data: JSON.stringify(o) });

    // groups 是對 §7.1 的擴充：面板要顯示「推薦排序 n/m 類」，得先知道 m。
    await send({
      step: "filter", found: recs.length, passed: stage.main.length, pending: stage.pending.length,
      groups: { paid: groupsOf("paid"), free: groupsOf("free") }, excluded_by: stage.excluded_by,
    });

    for (const [key, records] of groups) {
      const [agent, category] = key.split(" ");
      await send({ agent, category, status: "ranking" });
      await send({ agent, category, status: "done", records });
    }

    // excluded 是對 §7.1 的擴充：結果頁的「超出硬限制」摺疊區與 FR-13 的放寬按鈕要的是紀錄本身，不是計數。
    await send({ step: "done", pending: stage.pending, excluded: stage.excluded });
  });
});
