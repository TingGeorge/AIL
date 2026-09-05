import { expect, test } from "bun:test";
import { EMPTY_NEED, type Need } from "../src/shared/need.ts";
import { filterStage, passesGate, type Rec } from "../src/shared/records.ts";

const NOW = Date.parse("2026-09-05T12:00:00+08:00");

const rec = (over: Partial<Rec> = {}): Rec => ({
  id: "f_0001", category: "食品", title: "測試", provider: "測試店",
  price_total_twd: 100, mandatory_fees_twd: 0, discount_twd: 0,
  price_unit: null, quantity_or_servings: null, eligibility: [],
  registration_required: false, availability_or_event_time: null,
  distance_or_time_text: null, address: null, lat: null, lng: null, valid_until: null,
  source_url: "https://example.com/x", source_type: "curated", source_authority: "provider",
  evidence: [], collected_at: "2026-09-01T00:00:00+08:00", verified_at: "2026-09-01T00:00:00+08:00",
  data_status: "已驗證", agent: "paid", action_label: null, action_url: null,
  extra: {}, baseline: null, tags: null, group_offer: null, distance_km: null, reason: null,
  ...over,
});
const need = (over: Partial<Need> = {}): Need => ({ ...EMPTY_NEED, ...over });
const stage = (recs: Rec[], n = need(), exclude: string[] = []) =>
  filterStage(recs, n, exclude, NOW);

// SPEC-backend §8.3：閘門是「已驗證 + 算得出總可比成本 + 沒過期」，三者缺一就退到待確認。
test("passesGate：過期的紀錄在查詢當下退出主要排序", () => {
  expect(passesGate(rec(), NOW)).toBe(true);
  expect(passesGate(rec({ valid_until: "2026-09-30T23:59:59+08:00" }), NOW)).toBe(true);
  expect(passesGate(rec({ valid_until: "2026-08-31T23:59:59+08:00" }), NOW)).toBe(false);
  expect(passesGate(rec({ price_total_twd: null }), NOW)).toBe(false);
  expect(passesGate(rec({ data_status: "部分驗證／待確認" }), NOW)).toBe(false);
});

test("filterStage：閘門沒過的一律進待確認，不進排除", () => {
  const s = stage([rec({ id: "a" }), rec({ id: "b", price_total_twd: null }), rec({ id: "c", valid_until: "2026-01-01T00:00:00+08:00" })]);
  expect(s.main.map((r) => r.id)).toEqual(["a"]);
  expect(s.pending.map((r) => r.id).sort()).toEqual(["b", "c"]);
  expect(s.excluded).toEqual([]);
});

test("filterStage：六個硬限制各自計數（FR-13 要說得出是哪一個）", () => {
  const recs = [
    rec({ id: "ok" }),
    rec({ id: "貴", price_total_twd: 500 }),
    rec({ id: "牛", tags: ["牛"] }),
    rec({ id: "遠", distance_km: 3 }),
    rec({ id: "要報名", registration_required: true }),
  ];
  const s = stage(recs, need({ budget_total_twd: 300, max_distance_km: 1, registration_ok: false }), ["牛"]);

  expect(s.main).toEqual([]);
  expect(s.pending.map((r) => r.id)).toEqual(["ok"]);
  expect(s.excluded.map((r) => r.id).sort()).toEqual(["牛", "要報名", "貴", "遠"].sort());
  expect(s.excluded_by).toEqual({ budget: 1, free_only: 0, distance: 1, exclude: 1, registration: 1, people: 0, date: 0, time: 0, eligibility: 0 });
});

test("filterStage：free_only 只留下總可比成本為 0 的", () => {
  const s = stage([rec({ id: "免費", price_total_twd: 0, agent: "free" }), rec({ id: "付費" })], need({ free_only: true }));
  expect(s.main.map((r) => r.id)).toEqual(["免費"]);
  expect(s.excluded_by.free_only).toBe(1);
});

// SPEC-backend §8：max_minutes 對 km ÷ 0.08（步行每分鐘 80 公尺，估算）。
test("filterStage：沒有距離的紀錄不做距離篩選，有距離的走 km 與分鐘兩條", () => {
  const far = rec({ id: "遠", distance_km: 2 });          // 2 km ≈ 25 分鐘
  const near = rec({ id: "近", distance_km: 0.8 });       // 0.8 km ≈ 10 分鐘
  const unknown = rec({ id: "無座標" });

  expect(stage([far, near, unknown], need({ max_minutes: 20 })).main.map((r) => r.id)).toEqual(["近", "無座標"]);
  expect(stage([far, near, unknown], need({ max_distance_km: 1 })).main.map((r) => r.id)).toEqual(["近", "無座標"]);
  expect(stage([far, near, unknown], need()).excluded_by.distance).toBe(0);
});

// 會員限定不再是硬限制：需要會員的候選和其他選項一起排序，由使用者自行判斷資格。
test("filterStage：需要會員資格的候選照常進入主要排序", () => {
  const recs = [rec({ id: "會員價", eligibility: ["Costco 會員"] }), rec({ id: "一般" })];
  expect(stage(recs, need()).main.map((r) => r.id).sort()).toEqual(["一般", "會員價"]);
});

test("filterStage：main 依總可比成本由低至高，同成本時新確認的在前", () => {
  const recs = [
    rec({ id: "貴", price_total_twd: 260 }),
    rec({ id: "便宜", price_total_twd: 110 }),
    rec({ id: "同價舊", price_total_twd: 160, verified_at: "2026-09-01T00:00:00+08:00" }),
    rec({ id: "同價新", price_total_twd: 160, verified_at: "2026-09-04T00:00:00+08:00" }),
    rec({ id: "含必要費用", price_total_twd: 150, mandatory_fees_twd: 30, discount_twd: 10 }), // 170
  ];
  expect(stage(recs).main.map((r) => r.id)).toEqual(["便宜", "同價新", "同價舊", "含必要費用", "貴"]);
});

test("filterStage：一筆被多個限制排除時每個限制都計數", () => {
  const s = stage([rec({ price_total_twd: 900, tags: ["牛"] })], need({ budget_total_twd: 300 }), ["牛"]);
  expect(s.excluded.length).toBe(1);
  expect(s.excluded_by.budget).toBe(1);
  expect(s.excluded_by.exclude).toBe(1);
});

// 這些欄位目前沒有可供 deterministic filter 使用的結構化候選欄位：不可假稱已保證符合。
test("filterStage：文字型人數／日期／時段／資格缺乏證據時列待確認", async () => {
  const { constraintWarnings } = await import("../src/server/rank.ts");
  const n = need({ people_or_servings: 4, date: "2026-09-06", time_window: "晚上", eligibility_notes: "限學生" });
  const candidate = rec({ quantity_or_servings: "約 2 人份", availability_or_event_time: "週一白天", eligibility: ["一般民眾"] });
  expect(stage([candidate], n).main).toEqual([]);
  expect(stage([candidate], n).pending.map((r) => r.id)).toEqual([candidate.id]);
  expect(constraintWarnings(n, [candidate])).toEqual([{
    code: "strict_constraints_applied",
    fields: ["people_or_servings", "date", "time_window", "eligibility_notes"],
    message: "餐點份量可以小於或等於 4 人／份；越接近需求的選項會排得越前面，超過需求的餐點不會推薦。較小份量不代表足夠所有人食用，也不會自動增加份數或價格。明確不符合必要條件的選項會排除；份量、日期、時段或資格資料不足的選項會排在清單後段，請再確認。",
  }]);
});
