import { expect, test } from "bun:test";
import { EMPTY_NEED, type Need } from "../src/shared/need.ts";
import type { Rec } from "../src/shared/records.ts";
import {
  constraintWarnings,
  fallbackRank,
  rankGroup,
  sanitizeRanking,
  type RankingGeneratorInput,
} from "../src/server/rank.ts";

const rec = (over: Partial<Rec> = {}): Rec => ({
  id: "a", category: "食品", title: "測試", provider: "測試店",
  price_total_twd: 100, mandatory_fees_twd: 0, discount_twd: 0,
  price_unit: null, quantity_or_servings: null, eligibility: [],
  registration_required: false, availability_or_event_time: null,
  distance_or_time_text: null, address: null, lat: null, lng: null, valid_until: null,
  source_url: "https://example.com/private", source_type: "curated", source_authority: "provider",
  evidence: [], collected_at: "2026-09-01T00:00:00+08:00", verified_at: "2026-09-01T00:00:00+08:00",
  data_status: "已驗證", agent: "paid", action_label: null, action_url: null,
  extra: {}, baseline: { name: "不應送出", total_twd: 999, basis: "local_common", as_of: "2026-09" },
  tags: null, group_offer: null, distance_km: null, reason: null,
  ...over,
});
const need = (over: Partial<Need> = {}): Need => ({ ...EMPTY_NEED, ...over });

test("fallbackRank：明確依總可比成本排序、同成本穩定且不假裝有 AI 理由", () => {
  const ranked = fallbackRank([
    rec({ id: "b", price_total_twd: 100, verified_at: "2026-09-02T00:00:00+08:00" }),
    rec({ id: "c", price_total_twd: 80 }),
    rec({ id: "a", price_total_twd: 100, verified_at: "2026-09-02T00:00:00+08:00" }),
  ]);
  expect(ranked.map((r) => r.id)).toEqual(["c", "a", "b"]);
  expect(ranked.every((r) => r.reason === null)).toBe(true);
});

test("sanitizeRanking：未知與重複 id 不進結果，漏掉的候選依成本補回且每個 id 恰好一次", () => {
  const records = [
    rec({ id: "a", price_total_twd: 100 }),
    rec({ id: "b", price_total_twd: 200 }),
    rec({ id: "c", price_total_twd: 150 }),
  ];
  const ranked = sanitizeRanking(records, need(), {
    order: [
      { id: "b", reason: "評分 9/10、最便宜，只要 999 元" },
      { id: "unknown", reason: "不存在" },
      { id: "b", reason: "重複" },
      { id: "a", reason: "總可比成本為 100 元，是本組最低。" },
    ],
  });

  expect(ranked.map((r) => r.id)).toEqual(["b", "a", "c"]);
  expect(new Set(ranked.map((r) => r.id)).size).toBe(records.length);
  expect(ranked[0]?.reason).toContain("200 元");
  expect(ranked[0]?.reason).not.toMatch(/9\/10|最便宜|999/);
  expect(ranked[1]?.reason).toBe("總可比成本為 100 元，是本組最低。");
  expect(ranked[2]?.reason).toBeNull();
});

test("sanitizeRanking：不接受錯誤自有成本或把文字型限制說成已保證", () => {
  const records = [rec({ id: "a", price_total_twd: 100 }), rec({ id: "b", price_total_twd: 200 })];
  const ranked = sanitizeRanking(records, need({ people_or_servings: 4, eligibility_notes: "限學生" }), {
    order: [
      { id: "b", reason: "總可比成本為 100 元，符合 4 人與學生資格。" },
      { id: "a", reason: "總可比成本為 100 元，是本組最低。" },
    ],
  });
  expect(ranked[0]?.reason).toContain("200 元");
  expect(ranked[0]?.reason).not.toContain("符合 4 人");
  expect(ranked[1]?.reason).toBe("總可比成本為 100 元，是本組最低。");
});

test("sanitizeRanking：較貴候選超前時必須明說成本取捨，免費也不可捏造無條件", () => {
  const records = [
    rec({ id: "cheap", price_total_twd: 100 }),
    rec({ id: "paid", price_total_twd: 200 }),
    rec({ id: "free", agent: "free", price_total_twd: 0, eligibility: ["限學生"] }),
  ];
  const ranked = sanitizeRanking(records, need({ soft_preferences: ["可外帶"] }), {
    order: [
      { id: "paid", reason: "符合可外帶偏好，總可比成本為 200 元。" },
      { id: "free", reason: "完全免費且沒有任何資格限制。" },
      { id: "cheap", reason: "總可比成本為 100 元。" },
    ],
  });
  expect(ranked.map((record) => record.id)).toEqual(["paid", "free", "cheap"]);
  expect(ranked[0]?.reason).toContain("本組最低 0 元");
  expect(ranked[0]?.reason).toContain("可外帶");
  expect(ranked[1]?.reason).not.toContain("沒有任何資格限制");
  expect(ranked[1]?.reason).toContain("仍請核對");
});

test("sanitizeRanking：拒絕無元字樣的錯誤 NT$ 成本、捏造星等與反向文字限制保證", () => {
  const records = [rec({ id: "a", price_total_twd: 100 }), rec({ id: "b", price_total_twd: 200 })];
  const ranked = sanitizeRanking(records, need({ people_or_servings: 2, date: "2026-09-06", time_window: "晚上" }), {
    order: [
      { id: "b", reason: "這項價格是 NT$100，五星推薦，兩人份剛好且今晚適合。" },
      { id: "a", reason: "總可比成本為 NT$100；份量與今晚供應仍需核對。" },
    ],
  });
  expect(ranked[0]?.reason).toContain("200 元");
  expect(ranked[0]?.reason).not.toMatch(/NT\$100|五星|剛好/);
  expect(ranked[1]?.reason).toBe("總可比成本為 NT$100；份量與今晚供應仍需核對。");
});

test("rankGroup：注入 provider、只送允許欄位，成功時保留伺服器排序", async () => {
  let call: RankingGeneratorInput | undefined;
  const result = await rankGroup({
    agent: "paid", category: "食品",
    records: [rec({ id: "a", price_total_twd: 100 }), rec({ id: "b", price_total_twd: 130 })],
    need: need({ soft_preferences: ["可外帶"] }),
    generate: async (input) => {
      call = input;
      return { order: [
        { id: "b", reason: "符合可外帶偏好；總可比成本為 130 元。" },
        { id: "a", reason: "總可比成本為 100 元，是本組最低。" },
      ] };
    },
  });

  expect(result.status).toBe("done");
  expect(result.records.map((r) => r.id)).toEqual(["b", "a"]);
  expect(call?.signal).toBeInstanceOf(AbortSignal);
  const prompt = JSON.parse(call!.prompt);
  expect(prompt.candidates[0]).toEqual({
    id: "a", title: "測試", provider: "測試店", comparable_total_twd: 100,
    price_unit: null, quantity_or_servings: null, distance_km: null,
    availability: null, eligibility: [], tags: null,
  });
  expect(call!.prompt).not.toContain("source_url");
  expect(call!.prompt).not.toContain("private");
  expect(call!.prompt).not.toContain("baseline");
});

test("rankGroup：格式錯誤時整組 failed，回傳成本 fallback 與安全錯誤", async () => {
  const result = await rankGroup({
    agent: "paid", category: "食品",
    records: [rec({ id: "b", price_total_twd: 200 }), rec({ id: "a", price_total_twd: 100 })],
    need: need(), generate: async () => ({ nope: true }),
  });
  expect(result).toMatchObject({ status: "failed", error: "推薦排序格式錯誤，已改依總可比成本排列" });
  expect(result.records.map((r) => r.id)).toEqual(["a", "b"]);
  expect(result.records.every((r) => r.reason === null)).toBe(true);
});

test("rankGroup：逾時會中止 provider，且不等待未完成 promise", async () => {
  let aborted = false;
  const started = performance.now();
  const result = await rankGroup({
    agent: "free", category: "免費／公益資源", records: [rec({ agent: "free", price_total_twd: 0 })],
    need: need(), timeoutMs: 20,
    generate: ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); }, { once: true });
    }),
  });
  expect(performance.now() - started).toBeLessThan(500);
  expect(aborted).toBe(true);
  expect(result.status).toBe("failed");
  if (result.status !== "failed") throw new Error("expected failed ranking");
  expect(result.error).toBe("推薦排序逾時，已改依總可比成本排列");
});

test("rankGroup：外部請求中止會傳給 provider 並安全結束", async () => {
  const controller = new AbortController();
  let providerAborted = false;
  let notifyStarted!: () => void;
  const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
  const ranking = rankGroup({
    agent: "paid", category: "食品", records: [rec()], need: need(), signal: controller.signal,
    generate: ({ signal }) => new Promise((_resolve, reject) => {
      notifyStarted();
      signal.addEventListener("abort", () => {
        providerAborted = true;
        reject(signal.reason);
      }, { once: true });
    }),
  });
  await started;
  controller.abort(new Error("client gone"));
  const result = await ranking;
  expect(providerAborted).toBe(true);
  expect(result.status).toBe("failed");
  if (result.status !== "failed") throw new Error("expected failed ranking");
  expect(result.error).toBe("搜尋已取消");
  expect(result.records[0]?.reason).toBeNull();
});

test("rankGroup：未設定 provider 時明確 failed，不把成本排序冒充 AI", async () => {
  const result = await rankGroup({
    agent: "paid", category: "食品", records: [rec()], need: need(), generate: null,
  });
  expect(result.status).toBe("failed");
  if (result.status !== "failed") throw new Error("expected failed ranking");
  expect(result.error).toBe("LLM 未設定，已改依總可比成本排列");
  expect(result.records[0]?.reason).toBeNull();
});

test("constraintWarnings：只對目前無法保證的硬限制與缺少距離資料提出警告", () => {
  const warnings = constraintWarnings(
    need({ people_or_servings: 2, date: "2026-09-06", time_window: "晚上", eligibility_notes: "限學生", max_distance_km: 1 }),
    [rec({ distance_km: null })],
  );
  expect(warnings.map((w) => w.code)).toEqual(["text_constraints_not_filtered", "distance_not_evaluated"]);
  expect(warnings[0]?.fields).toEqual(["people_or_servings", "date", "time_window", "eligibility_notes"]);
});

test("constraintWarnings：need 與設定排除遇到未知標籤或候選缺標籤時明確警告", () => {
  const warnings = constraintWarnings(
    need({ exclude_tags: ["堅果"] }),
    [rec({ tags: null }), rec({ id: "b", tags: ["牛"] })],
    ["牛"],
  );
  expect(warnings).toEqual([{
    code: "exclude_tags_not_guaranteed",
    fields: ["exclude_tags", "exclude"],
    message: "排除項目「堅果」不在目前可辨識標籤內；部分候選缺少成分標籤；無法保證已完整排除，請逐筆核對。",
  }]);
});

test("rankGroup defaults to Gemini without the provider-rejected 500-item array bound", async () => {
  const oldKey = process.env.GEMINI_API_KEY, oldModel = process.env.GEMINI_MODEL;
  const oldFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  try {
    process.env.GEMINI_API_KEY = "mock-ranking-key";
    process.env.GEMINI_MODEL = "gemini-test";
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const request = JSON.parse(String(init?.body));
      // Live regression: this schema returned HTTP 400 even for one candidate.
      if (request.response_format.schema.properties.order.maxItems === 500) {
        return Response.json({error: {code: "invalid_request", message: "Request contains an invalid argument."}}, {status: 400});
      }
      return Response.json({ status: "completed", steps: [{ type: "model_output", content: [{
        type: "text", text: JSON.stringify({ order: [{ id: "a", reason: "總可比成本為 100 元。" }] }),
      }] }] });
    }) as unknown as typeof fetch;
    const result = await rankGroup({ agent: "paid", category: "食品", records: [rec()], need: need() });
    expect(result.status).toBe("done");
    expect(result.records[0]?.id).toBe("a");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.response_format.schema.required).toEqual(["order"]);
    expect(body.response_format.schema.properties.order.maxItems).toBeUndefined();
    expect(body.response_format.schema.additionalProperties).toBe(false);
    expect(body.response_format.schema.properties.order.items.additionalProperties).toBe(false);
    expect(body.store).toBe(false);
    expect(body.input).toHaveLength(1);
    expect(body.input[0].type).toBe("text");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = oldModel;
  }
});

test("Gemini ranking still validates local size, item lengths and strict objects", async () => {
  const oldKey = process.env.GEMINI_API_KEY, oldModel = process.env.GEMINI_MODEL;
  const oldFetch = globalThis.fetch;
  const item = {id: "a", reason: "總可比成本為 100 元。"};
  const cases: {output: unknown; status: "done" | "failed"}[] = [
    {output: {order: Array.from({length:500}, () => item)}, status: "done"},
    {output: {order: Array.from({length:501}, () => item)}, status: "failed"},
    {output: {order: [{...item, reason:"長".repeat(301)}]}, status: "failed"},
    {output: {order: [{...item, reason:"   "}]}, status: "failed"},
    {output: {order: [{...item, id:""}]}, status: "failed"},
    {output: {order: [{...item, invented:true}]}, status: "failed"},
    {output: {order: [item], invented:true}, status: "failed"},
  ];
  try {
    process.env.GEMINI_API_KEY = "mock-ranking-key";
    process.env.GEMINI_MODEL = "gemini-test";
    for (const scenario of cases) {
      let calls = 0;
      globalThis.fetch = (async () => {
        calls++;
        return Response.json({status:"completed", steps:[{type:"model_output", content:[{type:"text", text:JSON.stringify(scenario.output)}]}]});
      }) as unknown as typeof fetch;
      const result = await rankGroup({agent:"paid", category:"食品", records:[rec()], need:need()});
      expect(result.status).toBe(scenario.status);
      expect(calls).toBe(1);
      expect(result.records.map(record => record.id)).toEqual(["a"]);
      if (scenario.status === "failed") expect(result.records[0]?.reason).toBeNull();
    }
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = oldModel;
  }
});
