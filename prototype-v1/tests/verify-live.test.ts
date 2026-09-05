import { expect, test } from "bun:test";
import { CATEGORIES } from "../src/shared/need.ts";
import type { CatalogSummary } from "../src/shared/catalog.ts";
import type { Category, Rec } from "../src/shared/records.ts";
import { requireSameSearchIds, validateSearchSnapshot, type SearchSnapshot } from "../scripts/verify-live.ts";

const rec = (id: string, category: Category, change: Partial<Rec> = {}): Rec => ({
  id,
  category,
  title: id,
  provider: "測試提供者",
  price_total_twd: 100,
  mandatory_fees_twd: 0,
  discount_twd: 0,
  price_unit: null,
  quantity_or_servings: "一份",
  eligibility: [],
  registration_required: false,
  availability_or_event_time: "每日",
  distance_or_time_text: null,
  address: null,
  lat: null,
  lng: null,
  valid_until: null,
  source_url: "https://www.metro.taipei/test",
  source_type: "curated",
  source_authority: "official",
  evidence: [{ field: "價格", quote: "測試", url: "https://www.metro.taipei/test", checked_at: "2026-09-05T00:00:00Z" }],
  collected_at: "2026-09-05T00:00:00Z",
  verified_at: "2026-09-05T00:00:00Z",
  data_status: "已驗證",
  agent: category === "免費／公益資源" ? "free" : "paid",
  action_label: null,
  action_url: null,
  extra: {},
  baseline: null,
  tags: null,
  group_offer: null,
  ...change,
});

const catalog = (records: Rec[], pending: Rec[] = []): CatalogSummary => {
  const all = [...records, ...pending];
  return {
    total: all.length,
    rankable: records.length,
    pending: pending.length,
    demonstration: 0,
    latest_verified_at: "2026-09-05T00:00:00Z",
    scope: "test",
    categories: CATEGORIES.map(category => ({
      category,
      total: all.filter(record => record.category === category).length,
      rankable: records.filter(record => record.category === category).length,
      pending: pending.filter(record => record.category === category).length,
    })),
  };
};

const allFive = CATEGORIES.map((category, index) => rec(`id-${index}`, category));

test("a requested target category must not narrow the backend smoke snapshot", () => {
  // This is the expected response even when the request sets target_categories to one category.
  const snapshot: SearchSnapshot = { ranked: allFive.slice(0, 4), excluded: [allFive[4]!], pending: [] };
  const checked = validateSearchSnapshot(catalog(allFive), snapshot, false);
  expect(checked.categories.map(row => [row.category, row.total])).toEqual(CATEGORIES.map(category => [category, 1]));
  expect(checked.ids.size).toBe(5);
});

test("excluded and pending buckets still reconcile total and rankable coverage", () => {
  const normal = rec("normal", "日用品");
  const costco = rec("costco", "日用品", { eligibility: ["Costco 會員"] });
  const pending = rec("pending", "日用品", { data_status: "部分驗證／待確認" });
  const checked = validateSearchSnapshot(catalog([normal, costco], [pending]), { ranked: [normal], excluded: [costco], pending: [pending] }, false);
  expect(checked.categories.find(row => row.category === "日用品")).toMatchObject({ total: 3, rankable: 2, ranked: 1, excluded: 1, pending: 1 });
});

test("duplicate and lost IDs are rejected", () => {
  const item = rec("same", "食品");
  expect(() => validateSearchSnapshot(catalog([item, { ...item, id: "other" }]), {
    ranked: [item], excluded: [item], pending: [],
  }, false)).toThrow("id 重複");
  expect(() => requireSameSearchIds(new Set(["a", "b"]), new Set(["a", "c"]))).toThrow("id 集合不一致");
});

test("free-only requires zero cost only in ranked results and accounts for paid exclusions", () => {
  const free = rec("free", "免費／公益資源", { price_total_twd: 0 });
  const paid = rec("paid", "食品", { price_total_twd: 80 });
  expect(() => validateSearchSnapshot(catalog([free, paid]), { ranked: [free], excluded: [paid], pending: [] }, true)).not.toThrow();
  expect(() => validateSearchSnapshot(catalog([free, paid]), { ranked: [paid], excluded: [free], pending: [] }, true)).toThrow("不是零總成本");
});


test("request-pending evidence remains catalog-rankable without entering recommendations", () => {
  const normal = rec("public-fare", "交通");
  const eligibilityUnknown = rec("member-only", "交通", {
    eligibility: ["註冊會員"],
    request_match: { status: "pending", reasons: ["使用資格缺乏足夠證據，待確認"] },
  });
  const unverified = rec("unverified-fare", "交通", { data_status: "部分驗證／待確認" });
  const checked = validateSearchSnapshot(catalog([normal, eligibilityUnknown], [unverified]), {
    ranked: [normal], excluded: [], pending: [eligibilityUnknown, unverified],
  }, false);
  expect(checked.categories.find(row => row.category === "交通")).toMatchObject({
    total: 3, rankable: 2, ranked: 1, excluded: 0, pending: 2,
  });
  expect(checked.ids.size).toBe(3);
});


test("request-pending records cannot be promoted to ranked or mislabelled excluded buckets", () => {
  const unknown = rec("unknown-eligibility", "交通", {
    request_match: { status: "pending", reasons: ["使用資格缺乏足夠證據，待確認"] },
  });
  expect(() => validateSearchSnapshot(catalog([unknown]), { ranked: [unknown], pending: [], excluded: [] }, false))
    .toThrow("需求待確認或已排除");
  expect(() => validateSearchSnapshot(catalog([unknown]), { ranked: [], pending: [], excluded: [unknown] }, false))
    .toThrow("excluded bucket 混入需求待確認");
  expect(() => validateSearchSnapshot(catalog([unknown]), { ranked: [], pending: [{ ...unknown, request_match: { status: "pending", reasons: [] } }], excluded: [] }, false))
    .toThrow("缺少資料或需求待確認原因");
});
