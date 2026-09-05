// POST /api/search：第一階段 deterministic 篩選 + 各 (agent, category) 並行 LLM 排序 + SSE。
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { needSchema } from "../shared/need.ts";
import { filterStage, haversineKm, rowToRec, type Rec } from "../shared/records.ts";
import type { SearchEvent } from "../shared/search.ts";
import { dbConfigured, sql } from "./db.ts";
import { constraintWarnings, rankGroup, type RankingResult } from "./rank.ts";

// 台灣範圍以外的座標當成沒有座標（SPEC-backend §7）。
const inTaiwan = (l: { lat: number; lng: number }) => l.lat >= 21.5 && l.lat <= 25.5 && l.lng >= 118 && l.lng <= 122.5;

const searchBody = z.object({
  need: needSchema,
  exclude: z.array(z.string().max(20)).max(20).default([]),
  location: z.object({ lat: z.number(), lng: z.number() }).nullable().default(null),
  costco_ok: z.boolean().default(false),
});

type Group = { agent: Rec["agent"]; category: Rec["category"]; records: Rec[] };
type CompletedGroup = { index: number; group: Group; result: RankingResult };

const grouped = (records: Rec[]): Group[] => {
  const map = new Map<string, Group>();
  for (const record of records) {
    const key = `${record.agent}\u0000${record.category}`;
    const group = map.get(key);
    if (group) group.records.push(record);
    else map.set(key, { agent: record.agent, category: record.category, records: [record] });
  }
  return [...map.values()];
};

export const search = new Hono();

search.post("/api/search", async (c) => {
  const body = searchBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "search_failed", message: "請求格式錯誤" }, 400);
  if (!dbConfigured()) return c.json({ error: "search_failed", message: "資料庫未設定" }, 503);

  const { need, exclude, costco_ok } = body.data;
  const location = body.data.location && inTaiwan(body.data.location) ? body.data.location : null;

  let recs: Rec[];
  try {
    // ponytail: 整表讀出、在 TypeScript 篩選。上限約 1 萬列，升級路徑是把條件推進 SQL WHERE。
    recs = (await sql`select * from candidates`).map(rowToRec);
  } catch (error) {
    console.error("search_failed", error instanceof Error ? error.name : "unknown_error"); // 上游錯誤只寫 log，不回傳連線細節
    return c.json({ error: "search_failed", message: "搜尋失敗" }, 502);
  }

  // 使用者座標只用在這一次計算：不寫入資料庫、不寫進 log（SPEC-geocoding）。
  if (location) {
    for (const record of recs) {
      if (record.lat !== null && record.lng !== null) {
        record.distance_km = Math.round(haversineKm(location, { lat: record.lat, lng: record.lng }) * 100) / 100;
      }
    }
  }

  const effectiveExclude = [...new Set([...need.exclude_tags, ...exclude])];
  const stage = filterStage(recs, need, effectiveExclude, costco_ok);
  const groups = grouped(stage.main);
  const warnings = constraintWarnings(need, stage.main, exclude);
  const groupsOf = (agent: Rec["agent"]) => groups.filter((group) => group.agent === agent).length;

  return streamSSE(c, async (stream) => {
    const requestAbort = new AbortController();
    const abort = () => {
      if (!requestAbort.signal.aborted) requestAbort.abort(new Error("search request aborted"));
    };
    const rawSignal = c.req.raw.signal;
    if (rawSignal.aborted) abort();
    else rawSignal.addEventListener("abort", abort, { once: true });
    stream.onAbort(abort);

    const tasks: Promise<CompletedGroup>[] = [];
    let rankingsSettled = false;
    const send = async (event: SearchEvent) => {
      if (stream.aborted || requestAbort.signal.aborted) return false;
      try {
        await stream.writeSSE({ data: JSON.stringify(event) });
        return true;
      } catch (error) {
        abort();
        if (!stream.aborted && !rawSignal.aborted) console.error("search_stream_failed", error instanceof Error ? error.name : "unknown_error");
        return false;
      }
    };

    try {
      // groups 是對 §7.1 的擴充：面板要顯示「推薦排序 n/m 類」，得先知道 m。
      if (!await send({
        step: "filter", found: recs.length, passed: stage.main.length, pending: stage.pending.length,
        groups: { paid: groupsOf("paid"), free: groupsOf("free") }, excluded_by: stage.excluded_by, warnings,
      })) return;

      // 先完整公告每組進入 ranking，再一次啟動全部工作；完成事件不假設群組順序。
      for (const group of groups) {
        if (!await send({ agent: group.agent, category: group.category, status: "ranking" })) return;
      }

      const pending = new Map<number, Promise<CompletedGroup>>();
      groups.forEach((group, index) => {
        const task = rankGroup({
          ...group,
          need,
          signal: requestAbort.signal,
          onError: (error) => console.error("ranking_failed", { agent: group.agent, category: group.category }, error instanceof Error ? error.name : "unknown_error"),
        }).then((result) => ({ index, group, result }));
        tasks.push(task);
        pending.set(index, task);
      });

      // 所有 task 已同時啟動；Promise.race 只決定 SSE 的完成順序，finally 會觀察全部工作。
      while (pending.size > 0 && !requestAbort.signal.aborted && !stream.aborted) {
        const completed = await Promise.race(pending.values());
        pending.delete(completed.index);
        const event = completed.result.status === "done"
          ? { agent: completed.group.agent, category: completed.group.category, status: "done" as const,
              records: completed.result.records, warnings }
          : { agent: completed.group.agent, category: completed.group.category, status: "failed" as const,
              records: completed.result.records, error: completed.result.error, warnings };
        if (!await send(event)) return;
      }
      rankingsSettled = true;
      // excluded 是對 §7.1 的擴充：結果頁的「超出硬限制」摺疊區與 FR-13 放寬按鈕需要紀錄本身。
      await send({ step: "done", pending: stage.pending, excluded: stage.excluded, warnings });
    } finally {
      // writeSSE 拋錯或請求中止時也要取消並觀察所有已啟動工作，避免 detached rejection。
      if (!rankingsSettled) abort();
      await Promise.allSettled(tasks);
      rawSignal.removeEventListener("abort", abort);
    }
  });
});
