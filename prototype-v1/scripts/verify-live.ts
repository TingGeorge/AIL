// Read-only smoke test against a running server. Never sends API keys or writes accounts.
import { CATEGORIES, EMPTY_NEED, type Need } from "../src/shared/need.ts";
import { comparableTotal, isDemoRecord, passesGate, type Category, type Rec } from "../src/shared/records.ts";
import type { CatalogSummary } from "../src/shared/catalog.ts";
import type { SearchEvent } from "../src/shared/search.ts";

const base = (process.env.API_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
type RequireCondition = (condition: unknown, reason: string) => asserts condition;
const requireCondition: RequireCondition = (condition, reason) => { if (!condition) throw new Error(reason); };

export type SearchSnapshot = { ranked: Rec[]; pending: Rec[]; excluded: Rec[] };
export type SearchCategoryCheck = {
  category: Category;
  total: number;
  rankable: number;
  ranked: number;
  pending: number;
  excluded: number;
};
export type ValidatedSearch = { ids: Set<string>; categories: SearchCategoryCheck[] };

const countCategory = (records: readonly Rec[], category: Category) => records.filter(record => record.category === category).length;
const visibleRecord = (record: Rec) => !isDemoRecord(record) && record.extra.archived !== true;

export function validateSearchSnapshot(catalog: CatalogSummary, snapshot: SearchSnapshot, freeOnly: boolean): ValidatedSearch {
  const all = [...snapshot.ranked, ...snapshot.pending, ...snapshot.excluded];
  const ids = new Set<string>();
  for (const record of all) {
    requireCondition((CATEGORIES as readonly string[]).includes(record.category), `${record.id}: 未知類別 ${record.category}`);
    requireCondition(visibleRecord(record), `${record.id}: 搜尋公開了示範或封存資料`);
    requireCondition(!ids.has(record.id), `${record.id}: 搜尋結果 id 重複或同時出現在多個 bucket`);
    ids.add(record.id);
  }

  for (const record of [...snapshot.ranked, ...snapshot.excluded]) {
    requireCondition(passesGate(record), `${record.id}: rankable bucket 混入待確認或過期資料`);
  }
  for (const record of snapshot.pending) {
    requireCondition(!passesGate(record), `${record.id}: pending bucket 混入可排序資料`);
  }
  if (freeOnly) {
    for (const record of snapshot.ranked) {
      requireCondition(comparableTotal(record) === 0, `${record.id}: 免費搜尋的推薦結果不是零總成本`);
    }
  }

  requireCondition(catalog.categories.length === CATEGORIES.length, "catalog 類別數不是五類");
  const catalogCategories = new Set(catalog.categories.map(row => row.category));
  requireCondition(catalogCategories.size === CATEGORIES.length && CATEGORIES.every(category => catalogCategories.has(category)), "catalog 類別遺漏或重複");

  const categories = CATEGORIES.map(category => {
    const expected = catalog.categories.find(row => row.category === category);
    requireCondition(expected, `${category}: catalog 缺少類別統計`);
    const ranked = countCategory(snapshot.ranked, category);
    const pending = countCategory(snapshot.pending, category);
    const excluded = countCategory(snapshot.excluded, category);
    requireCondition(ranked + pending + excluded === expected.total, `${category}: 搜尋 total 與 catalog 不一致`);
    requireCondition(ranked + excluded === expected.rankable, `${category}: 搜尋 rankable 與 catalog 不一致`);
    requireCondition(pending === expected.pending, `${category}: 搜尋 pending 與 catalog 不一致`);
    return { category, total: expected.total, rankable: expected.rankable, ranked, pending, excluded };
  });

  requireCondition(all.length === catalog.total, "搜尋總筆數與 catalog 不一致");
  requireCondition(snapshot.ranked.length + snapshot.excluded.length === catalog.rankable, "搜尋可排序總數與 catalog 不一致");
  requireCondition(snapshot.pending.length === catalog.pending, "搜尋待確認總數與 catalog 不一致");
  requireCondition(categories.reduce((sum, row) => sum + row.total, 0) === catalog.total, "catalog 分類 total 加總不一致");
  requireCondition(categories.reduce((sum, row) => sum + row.rankable, 0) === catalog.rankable, "catalog 分類 rankable 加總不一致");
  requireCondition(categories.reduce((sum, row) => sum + row.pending, 0) === catalog.pending, "catalog 分類 pending 加總不一致");
  return { ids, categories };
}

export function requireSameSearchIds(left: ReadonlySet<string>, right: ReadonlySet<string>): void {
  const onlyLeft = [...left].filter(id => !right.has(id));
  const onlyRight = [...right].filter(id => !left.has(id));
  requireCondition(onlyLeft.length === 0 && onlyRight.length === 0,
    `一般／免費搜尋 id 集合不一致（一般獨有：${onlyLeft.join(",") || "無"}；免費獨有：${onlyRight.join(",") || "無"}）`);
}

const parseSearchSnapshot = (events: SearchEvent[], label: string): SearchSnapshot => {
  const end = events.at(-1);
  requireCondition(end && "step" in end && end.step === "done", `${label}: 串流未完整結束`);
  const ranked: Rec[] = [];
  for (const event of events) {
    if (!("status" in event) || event.status === "ranking") continue;
    requireCondition(event.records.every(record => record.category === event.category && record.agent === event.agent),
      `${label}: 排序事件混入錯誤類別或 agent`);
    ranked.push(...event.records);
  }
  return { ranked, pending: end.pending, excluded: end.excluded };
};

const get = async (path: string) => {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15_000) });
  requireCondition(response.ok, `${path}: HTTP ${response.status}`);
  requireCondition(response.headers.get("cache-control")?.includes("no-store"), `${path}: 缺少 no-store`);
  return response.json();
};

const search = async (freeOnly: boolean, targetCategories: Need["target_categories"]): Promise<SearchSnapshot> => {
  const label = freeOnly ? "免費全目錄搜尋" : `全目錄搜尋（target=${targetCategories.join(",") || "無"}）`;
  const response = await fetch(`${base}/api/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      need: { ...EMPTY_NEED, target_categories: targetCategories, free_only: freeOnly },
      exclude: [],
      location: null,
      // Keep the default user constraint: member-only rows must remain accounted for in excluded.
      costco_ok: false,
    }),
  });
  requireCondition(response.ok, `${label}: HTTP ${response.status}`);
  requireCondition(response.headers.get("content-type")?.includes("text/event-stream"), `${label}: 搜尋未回傳 SSE`);
  const cacheControl = response.headers.get("cache-control") ?? "";
  // API middleware must retain no-store even when the SSE helper sets its own policy.
  requireCondition(cacheControl.includes("no-store"), `${label}: 缺少 SSE no-store`);
  const events = (await response.text()).split(/\r?\n\r?\n/).flatMap(frame => {
    const text = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
    return text ? [JSON.parse(text) as SearchEvent] : [];
  });
  return parseSearchSnapshot(events, label);
};

export async function runLiveSmoke(): Promise<void> {
  requireCondition((await get("/api/health")).status === "ok", "health 不健康");
  const catalog: CatalogSummary = await get("/api/catalog");
  requireCondition(catalog.demonstration === 0, "驗收需停用 ALLOW_DEMO_DATA");

  // A requested target proves target_categories only affects Dashboard emphasis: the backend still returns all five categories.
  const normal = await search(false, [CATEGORIES[0]]);
  const free = await search(true, []);
  const normalCheck = validateSearchSnapshot(catalog, normal, false);
  const freeCheck = validateSearchSnapshot(catalog, free, true);
  requireSameSearchIds(normalCheck.ids, freeCheck.ids);

  for (const category of CATEGORIES) {
    const count = catalog.categories.find(row => row.category === category);
    requireCondition(count && count.total > 0, `${category}: 沒有真實資料`);
    requireCondition(count.rankable > 0, `${category}: 沒有可供詳情驗證的可排序資料`);
    const selected = [...normal.ranked, ...normal.excluded].find(record => record.category === category);
    requireCondition(selected, `${category}: 找不到可排序詳情樣本`);
    const detail: Rec = await get(`/api/candidates/${encodeURIComponent(selected.id)}`);
    requireCondition(detail.id === selected.id && detail.category === category, `${category}: 詳情 id 或類別不一致`);
    requireCondition(visibleRecord(detail) && passesGate(detail), `${category}: 詳情公開了示範、封存或不可排序資料`);
    requireCondition(detail.evidence.length > 0 && detail.evidence.every(item => item.field.trim() && item.quote.trim() && item.url.trim() && item.checked_at.trim()),
      `${category}: 詳情證據缺失或欄位為空`);
  }

  const hidden = await fetch(`${base}/api/candidates/f_a3k9`, { signal: AbortSignal.timeout(15_000) });
  requireCondition(hidden.status === 404, "舊示範資料仍公開可見");
  requireCondition(hidden.headers.get("cache-control")?.includes("no-store"), "示範資料 404 缺少 no-store");

  console.table(normalCheck.categories.map(row => ({
    category: row.category,
    total: row.total,
    rankable: row.rankable,
    ranked: row.ranked,
    excluded: row.excluded,
    pending: row.pending,
    free_ranked: freeCheck.categories.find(item => item.category === row.category)?.ranked ?? 0,
  })));
  console.log(`✓ ${catalog.total} 筆公開資料：target 不限類別、五類 bucket/count、免費成本、id 完整性、來源詳情、示範隔離均通過。未建立帳號或修改資料。`);
}

if (import.meta.main) {
  try { await runLiveSmoke(); }
  catch (error) {
    console.error(error instanceof Error ? error.message : "Live smoke test failed");
    process.exitCode = 1;
  }
}
