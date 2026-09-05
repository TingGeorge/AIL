import { describe, expect, test } from "bun:test";
import { app } from "../src/server/index.ts";
import { sql } from "../src/server/db.ts";
import { EMPTY_NEED, type Need } from "../src/shared/need.ts";
import { comparableTotal, type Rec } from "../src/shared/records.ts";

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

// ---- 票 05／11：搜尋與候選查詢 ----

test("search: 400 on a malformed body, before touching the database", async () => {
  const res = await post("/api/search", JSON.stringify({ need: null }), { "content-type": "application/json" });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "search_failed", message: "請求格式錯誤" });
});

test("candidates: 400 over the id cap, 400 comes before any query", async () => {
  const ids = Array.from({ length: 201 }, (_, i) => `x${i}`).join(",");
  const res = await app.request(`/api/candidates?ids=${ids}`);
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe("candidates_failed");
});

test("candidates: no ids is an empty list, not an error", async () => {
  const res = await app.request("/api/candidates?ids=");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual([]);
});

// ---- 需要資料庫的部分：沒有 DATABASE_URL 就跳過 ----
// 不要在這裡 sql.end()：sql 是整個測試行程共用的單例，關掉之後別的測試檔就連不上了。
const dbLive = Boolean(process.env.DATABASE_URL);

describe.skipIf(!dbLive)("搜尋與候選查詢 (live database)", () => {
  const need: Need = {
    ...EMPTY_NEED, target_categories: ["食品"], people_or_servings: 2, budget_total_twd: 300,
  };

  const events = async (body: unknown) => {
    const res = await post("/api/search", JSON.stringify(body), { "content-type": "application/json" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    return text.split("\n\n").filter(Boolean)
      .map((f) => f.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n"))
      .filter(Boolean).map((d) => JSON.parse(d));
  };

  test("SSE 依序推 filter → 每組 ranking/done → done", async () => {
    const es = await events({ need, exclude: [], location: null, costco_ok: false });
    const filter = es[0];
    expect(filter.step).toBe("filter");
    expect(filter.found).toBeGreaterThanOrEqual(10);
    expect(filter.passed).toBeGreaterThan(0);
    expect(Object.keys(filter.excluded_by).sort()).toEqual(["budget", "costco", "distance", "exclude", "free_only", "registration"]);
    // 預算 300 排掉那筆 780 的鍋物。
    expect(filter.excluded_by.budget).toBeGreaterThan(0);

    const last = es[es.length - 1];
    expect(last.step).toBe("done");
    // 過期、無法納入比較、衝突待確認的三筆都落在待確認，不進主要排序。
    expect(last.pending.map((r: Rec) => r.id).sort()).toEqual(["f_m4n5", "f_p6q7", "f_r8s9"]);

    const middle = es.slice(1, -1);
    expect(middle.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < middle.length; i += 2) {
      expect(middle[i].status).toBe("ranking");
      expect(middle[i + 1].status).toBe("done");
      expect(middle[i + 1].agent).toBe(middle[i].agent);
      const totals = middle[i + 1].records.map((r: Rec) => comparableTotal(r));
      expect([...totals].sort((a: number, b: number) => a - b)).toEqual(totals);
    }
  });

  test("free_only 只留下總可比成本 0 的紀錄", async () => {
    const es = await events({ need: { ...need, free_only: true }, exclude: [], location: null, costco_ok: false });
    expect(es[0].excluded_by.free_only).toBeGreaterThan(0);
    for (const e of es.slice(1, -1)) {
      if (e.status !== "done") continue;
      for (const r of e.records as Rec[]) expect(comparableTotal(r)).toBe(0);
    }
  });

  test("單筆查詢：找得到回 Rec，找不到回 404", async () => {
    const ok = await app.request("/api/candidates/f_a3k9");
    expect(ok.status).toBe(200);
    const r = (await ok.json()) as Rec;
    expect(r.title).toContain("便當");
    expect(Array.isArray(r.evidence)).toBe(true);   // jsonb 已經 parse 過
    expect(r.distance_km).toBeNull();

    const missing = await app.request("/api/candidates/does_not_exist");
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toBe("not_found");
  });

  test("批次查詢：略過不存在的 id，不讓整個請求失敗", async () => {
    const res = await app.request("/api/candidates?ids=f_a3k9,nope,f_b1c2");
    expect(res.status).toBe(200);
    const recs = (await res.json()) as Rec[];
    expect(recs.map((r) => r.id).sort()).toEqual(["f_a3k9", "f_b1c2"]);
  });
});
