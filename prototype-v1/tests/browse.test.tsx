import { afterEach, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { browseRecords } from "../src/shared/browse.ts";
import { CATEGORIES } from "../src/shared/need.ts";
import { isDemoRecord, type Rec } from "../src/shared/records.ts";
import { createBrowseRouter } from "../src/server/browse.ts";
import { browse } from "../src/client/api.ts";
import { BrowseResultsContent, type BrowseState } from "../src/client/BrowseResults.tsx";

const NOW = Date.parse("2026-09-05T12:00:00+08:00");
const rec = (overrides: Partial<Rec> = {}): Rec => ({
  id: "browse-live", category: "食品", title: "測試餐點", provider: "來源店家",
  price_total_twd: 100, mandatory_fees_twd: 0, discount_twd: 0, price_unit: "份",
  quantity_or_servings: "一份", eligibility: [], registration_required: false,
  availability_or_event_time: "依公告時間", distance_or_time_text: null, address: null,
  lat: null, lng: null, valid_until: null, source_url: "https://www.gov.taipei/source",
  source_type: "curated", source_authority: "official",
  evidence: ["價格", "份量", "時間", "資格"].map(field => ({ field, quote: "來源摘錄", url: "https://www.gov.taipei/source", checked_at: "2026-01-01T00:00:00Z" })),
  collected_at: "2026-01-01T00:00:00Z", verified_at: "2026-01-01T00:00:00Z",
  data_status: "已驗證", agent: "paid", action_label: null, action_url: null,
  extra: {}, baseline: null, tags: null, group_offer: null, distance_km: null, reason: null,
  ...overrides,
});
const originalFetch = globalThis.fetch;
const demoSetting = process.env.ALLOW_DEMO_DATA;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (demoSetting === undefined) delete process.env.ALLOW_DEMO_DATA;
  else process.env.ALLOW_DEMO_DATA = demoSetting;
});

// All data is in memory. Never import fixtures, call a provider or query a database.
test("unconstrained browsing includes all five categories and orders their comparable totals together", () => {
  const records = CATEGORIES.map((category, i) => rec({ id: `category-${i}`, category, price_total_twd: 100 - i * 25 }));
  const before = structuredClone(records);
  const result = browseRecords(records, NOW);
  expect(result.main.map(item => item.price_total_twd)).toEqual([0, 25, 50, 75, 100]);
  expect(new Set(result.main.map(item => item.category))).toEqual(new Set(CATEGORIES));
  expect(result.pending).toEqual([]);
  expect(result.excluded).toEqual([]);
  expect(records).toEqual(before);
});

test("browsing does not infer budget, allergy, membership, registration or distance restrictions", () => {
  const record = rec({ price_total_twd: 9000, eligibility: ["Costco 會員"], registration_required: true, tags: ["牛"], distance_km: 500 });
  const result = browseRecords([record], NOW);
  expect(result.main).toEqual([record]);
  expect(result.excluded).toEqual([]);
});

test("price sorting includes mandatory fees and discounts, not just the displayed base price", () => {
  const result = browseRecords([
    rec({ id: "fees", price_total_twd: 0, mandatory_fees_twd: 120 }),
    rec({ id: "discount", price_total_twd: 100, discount_twd: 50 }),
    rec({ id: "free", price_total_twd: 0 }),
  ], NOW);
  expect(result.main.map(item => item.id)).toEqual(["free", "discount", "fees"]);
});

test("expired, unconfirmed and unknown-cost rows stay visible after verified rows; unknown cost is not zero", () => {
  const result = browseRecords([
    rec({ id: "unknown-fees", price_total_twd: 0, mandatory_fees_twd: null }),
    rec({ id: "pending", price_total_twd: 30, data_status: "部分驗證／待確認" }),
    rec({ id: "expired", price_total_twd: 0, valid_until: "2026-01-01T00:00:00Z" }),
    rec({ id: "verified", price_total_twd: 300 }),
  ], NOW);
  expect(result.main.map(item => item.id)).toEqual(["verified"]);
  expect(result.pending.map(item => item.id)).toEqual(["expired", "pending", "unknown-fees"]);
  expect(result.excluded).toEqual([]);
});

test("empty catalog is a successful empty browse, not an artificial search error", () => {
  expect(browseRecords([], NOW)).toEqual({ main: [], pending: [], excluded: [] });
});

test("anonymous browse route reads public catalog without auth or any provider call", async () => {
  globalThis.fetch = (() => { throw new Error("Unexpected provider request"); }) as unknown as typeof fetch;
  let reads = 0;
  const router = createBrowseRouter(async () => { reads++; return [rec({ id: "paid" }), rec({ id: "free", price_total_twd: 0, agent: "free" })]; }, () => true);
  const response = await router.request("/api/browse");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const result = await response.json();
  expect(result.main.map((item: Rec) => item.id)).toEqual(["free", "paid"]);
  expect(result.excluded).toEqual([]);
  expect(reads).toBe(1);
});

test("browse route preserves catalog protections: archived, demo and unsafe-source rows are hidden", async () => {
  process.env.ALLOW_DEMO_DATA = "0";
  const demo = rec({ id: "demo", extra: { demo: true } });
  const rows = [rec(), rec({ id: "archived", extra: { archived: true } }), rec({ id: "unsafe", source_url: "http://example.com" }), demo];
  expect(isDemoRecord(demo)).toBe(true);
  const response = await createBrowseRouter(async () => rows, () => true).request("/api/browse");
  const result = await response.json();
  expect([...result.main, ...result.pending].map((item: Rec) => item.id)).toEqual(["browse-live"]);
});

test("browse route downgrades unsupported verified labels without dropping the record", async () => {
  const response = await createBrowseRouter(async () => [rec({ evidence: [] })], () => true).request("/api/browse");
  const result = await response.json();
  expect(result.main).toEqual([]);
  expect(result.pending).toHaveLength(1);
  expect(result.pending[0].data_status).toBe("部分驗證／待確認");
});

test("unconfigured database gives 503 without invoking the catalog loader", async () => {
  const response = await createBrowseRouter(async () => { throw new Error("Must not read"); }, () => false).request("/api/browse");
  expect(response.status).toBe(503);
  expect((await response.json()).error).toBe("database_unconfigured");
});

test("catalog failure stays a retryable error, never a fake empty catalog or leaked connection detail", async () => {
  const response = await createBrowseRouter(async () => { throw new Error("sensitive-connection-detail"); }, () => true).request("/api/browse");
  expect(response.status).toBe(502);
  const body = await response.text();
  expect(body).toContain("browse_failed");
  expect(body).not.toContain("sensitive-connection-detail");
});

test("client browse performs a no-store GET without account or need data", async () => {
  let calls = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls++;
    expect(url).toBe("/api/browse");
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    expect(init?.cache).toBe("no-store");
    return Response.json({ main: [rec()], pending: [], excluded: [] });
  }) as typeof fetch;
  const result = await browse();
  expect(result.main).toHaveLength(1);
  expect(calls).toBe(1);
});

const renderState = (state: BrowseState) => renderToStaticMarkup(<BrowseResultsContent state={state} onRetry={() => {}} list={[]} onOpen={() => {}} onList={() => {}} onAdjust={() => {}} />);

test("loading and failure states do not tell a new user to supply requirements or show false empty results", () => {
  const loading = renderState({ status: "loading" });
  expect(loading).toContain("正在載入所有生活選項");
  expect(loading).toContain('aria-busy="true"');
  expect(loading).not.toContain("沒有候選");
  const failed = renderState({ status: "error", message: "連線中斷" });
  expect(failed).toContain('role="alert"');
  expect(failed).toContain("重新載入");
  expect(failed).not.toContain("沒有候選");
});

test("successful empty browsing explains actual catalog emptiness rather than missing requirements", () => {
  const html = renderState({ status: "ready", result: browseRecords([], NOW) });
  expect(html).toContain("目前尚無可瀏覽的項目");
  expect(html).toContain("並非因為你尚未設定需求");
  expect(html).not.toContain("尚未完成搜尋");
});

test("ready browsing keeps detail/list controls without the unfiltered-browse explanation", () => {
  const html = renderState({ status: "ready", result: browseRecords([rec()], NOW) });
  expect(html).toContain("測試餐點");
  expect(html).not.toContain("你還沒設定需求");
  expect(html).toContain("加入清單");
  expect(html).toContain("調整需求與必要條件");
});

test("client preserves browse server errors so the UI can offer retry instead of an empty list", async () => {
  globalThis.fetch = (async () => Response.json({ error: "browse_failed", message: "目前無法載入生活選項" }, { status: 502 })) as unknown as typeof fetch;
  await expect(browse()).rejects.toMatchObject({ status: 502, message: "目前無法載入生活選項" });
});

test("the browse route is mounted in the actual app before its static catch-all", async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const { app } = await import("../src/server/index.ts");
    const response = await app.request("/api/browse");
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("database_unconfigured");
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
