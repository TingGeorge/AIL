import { afterEach, describe, expect, test } from "bun:test";
import { ApiError, search, sseDecoder, type SearchEvent } from "../src/client/api.ts";
import { initialSearch, rankedRecords, reduceSearch } from "../src/client/search-state.ts";
import { EMPTY_NEED } from "../src/shared/need.ts";
import type { Rec } from "../src/shared/records.ts";
import type { SearchWarning } from "../src/shared/search.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const rec = (id: string, agent: Rec["agent"], category: Rec["category"]): Rec => ({
  id,
  agent,
  category,
  title: id,
  provider: "測試提供者",
  price_total_twd: agent === "free" ? 0 : 100,
  mandatory_fees_twd: 0,
  discount_twd: 0,
  price_unit: null,
  quantity_or_servings: null,
  eligibility: [],
  registration_required: false,
  availability_or_event_time: null,
  distance_or_time_text: null,
  address: null,
  lat: null,
  lng: null,
  valid_until: null,
  source_url: `https://example.com/${id}`,
  source_type: "curated",
  source_authority: "provider",
  evidence: [],
  collected_at: "2026-09-05T00:00:00+08:00",
  verified_at: "2026-09-05T00:00:00+08:00",
  data_status: "已驗證",
  action_label: null,
  action_url: null,
  extra: {},
  baseline: null,
  tags: null,
  group_offer: null,
  distance_km: null,
  reason: null,
});

const searchBody = {
  need: { ...EMPTY_NEED, need: "晚餐" },
  exclude: [],
  location: null,
  costco_ok: false,
};

const streamResponse = (parts: Uint8Array[], contentType = "text/event-stream; charset=utf-8") =>
  new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  }), { status: 200, headers: { "content-type": contentType } });

const caughtApiError = async (operation: Promise<unknown>) => {
  try {
    await operation;
    throw new Error("expected operation to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
};

describe("sseDecoder", () => {
  test("decodes CRLF events when field names, values, and blank lines cross arbitrary chunks", () => {
    const events: SearchEvent[] = [];
    const decoder = sseDecoder((event) => events.push(event));
    const source = [
      ": keep-alive\r\n",
      "data: {\"step\":\"filter\",\"found\":2,\"passed\":1,\"pending\":0,\"groups\":{\"paid\":1,\"free\":0},\"excluded_by\":{}}\r\n",
      "\r\n",
      "data: {\"step\":\"done\",\"pending\":[],\"excluded\":[]}\r\n",
      "\r\n",
    ].join("");

    const sizes = [1, 2, 7, 3, 11, 4, 19, 5];
    let offset = 0;
    for (let index = 0; offset < source.length; index++) {
      const size = sizes[index % sizes.length]!;
      decoder.push(source.slice(offset, offset + size));
      offset += size;
    }
    decoder.finish();

    expect(events).toEqual([
      {
        step: "filter",
        found: 2,
        passed: 1,
        pending: 0,
        groups: { paid: 1, free: 0 },
        excluded_by: {},
      },
      { step: "done", pending: [], excluded: [] },
    ]);
  });

  test("joins multiline data fields and flushes a final event without a trailing blank line", () => {
    const events: SearchEvent[] = [];
    const decoder = sseDecoder((event) => events.push(event));

    decoder.push("data: {\r\ndata:   \"step\": \"done\",\r\n");
    decoder.push("data:   \"pending\": [],\r\ndata:   \"excluded\": []\r\ndata: }");
    decoder.finish();

    expect(events).toEqual([{ step: "done", pending: [], excluded: [] }]);
  });

  test("surfaces malformed JSON instead of silently dropping the event", () => {
    const decoder = sseDecoder(() => {
      throw new Error("callback should not run");
    });

    expect(() => decoder.push("data: {\"step\":\r\n\r\n")).toThrow(SyntaxError);
  });
});

describe("search", () => {
  test("preserves partial events but rejects a stream that closes without done", async () => {
    const wire = new TextEncoder().encode(
      'data: {"step":"filter","found":1,"passed":1,"pending":0,"groups":{"paid":1,"free":0},"excluded_by":{}}\n\n',
    );
    globalThis.fetch = (() => Promise.resolve(streamResponse([wire.slice(0, 9), wire.slice(9, 31), wire.slice(31)]))) as unknown as typeof fetch;
    const events: SearchEvent[] = [];

    const error = await caughtApiError(search(searchBody, (event) => events.push(event)));

    expect(error).toMatchObject({
      kind: "failed",
      status: 0,
      message: "搜尋串流未完成，已收到的結果僅為部分結果，請重試。",
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ step: "filter", found: 1, passed: 1 });
  });

  test("rejects a successful HTTP response whose body is not an SSE stream", async () => {
    globalThis.fetch = (() => Promise.resolve(new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    }))) as unknown as typeof fetch;

    const error = await caughtApiError(search(searchBody, () => {}));

    expect(error).toMatchObject({ kind: "failed", status: 0, message: "搜尋回應格式不正確。" });
  });

  test("preserves API status and server-safe message for HTTP errors", async () => {
    globalThis.fetch = (() => Promise.resolve(Response.json(
      { error: "search_failed", message: "資料庫未設定" },
      { status: 503 },
    ))) as unknown as typeof fetch;

    const error = await caughtApiError(search(searchBody, () => {}));

    expect(error).toMatchObject({ kind: "failed", status: 503, message: "資料庫未設定" });
  });

  test("normalizes fetch failures without attempting a real network request", async () => {
    globalThis.fetch = (() => Promise.reject(new TypeError("socket details must not leak"))) as unknown as typeof fetch;

    const error = await caughtApiError(search(searchBody, () => {}));

    expect(error).toMatchObject({
      kind: "failed",
      status: 0,
      message: "連線中斷，請檢查網路後重試。",
    });
  });
});

describe("search state integration", () => {
  const warning = (code: string, message: string): SearchWarning => ({ code, fields: [], message });

  test("normalizes warning objects from every event into stable, de-duplicated messages", () => {
    let state = initialSearch();
    state = reduceSearch(state, {
      step: "filter",
      found: 2,
      passed: 2,
      pending: 0,
      groups: { paid: 1, free: 0 },
      excluded_by: {},
      warnings: [warning("filter", "日期條件只能用於排序")],
    });
    state = reduceSearch(state, {
      agent: "paid",
      category: "食品",
      status: "failed",
      records: [rec("fallback", "paid", "食品")],
      warnings: [
        warning("filter", "日期條件只能用於排序"),
        warning("distance", "部分候選缺少距離"),
      ],
    });
    state = reduceSearch(state, {
      step: "done",
      pending: [],
      excluded: [],
      warnings: [warning("distance", "部分候選缺少距離")],
    });

    expect(state.warnings).toEqual(["日期條件只能用於排序", "部分候選缺少距離"]);
    expect(state.warnings.every((item) => typeof item === "string")).toBe(true);
  });

  test("group completion order does not change final ranked records", () => {
    const paidFood = [rec("paid-food-1", "paid", "食品"), rec("paid-food-2", "paid", "食品")];
    const freeFood = [rec("free-food-1", "free", "食品")];
    const paidActivity = [rec("paid-activity-1", "paid", "活動")];
    const events: SearchEvent[] = [
      { agent: "paid", category: "食品", status: "done", records: paidFood },
      { agent: "free", category: "食品", status: "done", records: freeFood },
      { agent: "paid", category: "活動", status: "done", records: paidActivity },
    ];
    const reduceAll = (ordered: SearchEvent[]) => ordered.reduce(reduceSearch, initialSearch());

    expect(rankedRecords(reduceAll(events)).map((record) => record.id)).toEqual([
      "paid-food-1",
      "free-food-1",
      "paid-food-2",
      "paid-activity-1",
    ]);
    expect(rankedRecords(reduceAll([...events].reverse())).map((record) => record.id)).toEqual([
      "paid-food-1",
      "free-food-1",
      "paid-food-2",
      "paid-activity-1",
    ]);
  });

  test("uses category order, interleaves paid/free ranks, and puts free first per category in survival mode", () => {
    const events: SearchEvent[] = [
      { agent: "paid", category: "活動", status: "done", records: [rec("activity-paid", "paid", "活動")] },
      { agent: "free", category: "日用品", status: "done", records: [rec("daily-free", "free", "日用品")] },
      {
        agent: "paid",
        category: "食品",
        status: "done",
        records: [rec("food-paid-1", "paid", "食品"), rec("food-paid-2", "paid", "食品")],
      },
      { agent: "free", category: "食品", status: "done", records: [rec("food-free-1", "free", "食品")] },
    ];
    const state = events.reduce(reduceSearch, initialSearch());

    expect(rankedRecords(state).map((record) => record.id)).toEqual([
      "food-paid-1",
      "food-free-1",
      "food-paid-2",
      "daily-free",
      "activity-paid",
    ]);
    expect(rankedRecords(state, true).map((record) => record.id)).toEqual([
      "food-free-1",
      "food-paid-1",
      "food-paid-2",
      "daily-free",
      "activity-paid",
    ]);
  });

  test("repeated terminal events replace a group rather than duplicating its records", () => {
    let state = initialSearch();
    state = reduceSearch(state, {
      agent: "paid",
      category: "食品",
      status: "failed",
      records: [rec("same-record", "paid", "食品")],
      error: "fallback",
    });
    state = reduceSearch(state, {
      agent: "paid",
      category: "食品",
      status: "done",
      records: [rec("same-record", "paid", "食品")],
    });

    expect(rankedRecords(state).map((record) => record.id)).toEqual(["same-record"]);
    expect(state.groups["paid:食品"]?.status).toBe("done");
  });

  test("keeps failed group fallback records in the deterministic result list", () => {
    const fallback = [rec("fallback-cheap", "paid", "交通"), rec("fallback-expensive", "paid", "交通")];
    const state = reduceSearch(initialSearch(), {
      agent: "paid",
      category: "交通",
      status: "failed",
      records: fallback,
      error: "推薦排序失敗，已改依總可比成本排列",
    });

    expect(state.groups["paid:交通"]).toMatchObject({ status: "failed", records: fallback });
    expect(rankedRecords(state).map((record) => record.id)).toEqual(["fallback-cheap", "fallback-expensive"]);
  });
});
