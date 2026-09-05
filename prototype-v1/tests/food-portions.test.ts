import { expect, test } from "bun:test";
import { EMPTY_NEED } from "../src/shared/need.ts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { foodPortionRange } from "../src/shared/portions.ts";
import { fallbackRank, rankGroup, sanitizeRanking } from "../src/server/rank.ts";
import { ResultsView, DetailView, orderResultCandidates } from "../src/client/ResultsView.tsx";
import { detailRecord, initialSearch, rankedRecords, reduceSearch } from "../src/client/search-state.ts";
import { filterStage, rowToRec } from "../src/shared/records.ts";

const food = (count: number) => ({
  ...rowToRec({ id: `food-${count}`, title: `${count}人份餐點`, category: "食品",
    data_status: "已驗證", price_total_twd: count * 50, mandatory_fees_twd: 0,
    discount_twd: 0, agent: "paid", provider: "測試店家", price_unit: "固定套餐",
    source_url: "https://merchant.test/food", verified_at: "2026-09-05T00:00:00Z",
    registration_required: false, tags: null, availability_or_event_time: null }),
  quantity_or_servings: `${count}人份`,
});
const fivePeople = { ...EMPTY_NEED, people_or_servings: 5 };

test("five people can see one through five food portions, but never six portions in recommendations", () => {
  const result = filterStage([1, 2, 3, 4, 5, 6].map(food), fivePeople, []);
  expect(result.main.map(item => item.id).sort()).toEqual([1, 2, 3, 4, 5].map(n => `food-${n}`));
  expect(result.excluded.map(item => item.id)).toEqual(["food-6"]);
  expect(result.pending).toHaveLength(0);
  expect(result.excluded_by.people).toBe(1);
});

test("food recommendations prefer exact portions, then the closest smaller portions without scaling prices", () => {
  const records = [1, 2, 3, 4, 5].map(food);
  const before = structuredClone(records);
  const result = filterStage(records, fivePeople, []);
  expect(result.main.map(item => item.id)).toEqual([5, 4, 3, 2, 1].map(n => `food-${n}`));
  expect(result.main.map(item => item.price_total_twd)).toEqual([250, 200, 150, 100, 50]);
  expect(records).toEqual(before);
});

test("unknown and smaller unverified portions remain pending, but known oversized portions never leak into pending", () => {
  const result = filterStage([
    { ...food(4), data_status: "部分驗證／待確認" },
    { ...food(6), mandatory_fees_twd: null },
    { ...food(1), id: "unknown", quantity_or_servings: "家庭分享餐，份量未提供" },
  ] as Parameters<typeof filterStage>[0], fivePeople, []);
  expect(result.pending.map(item => item.id)).toEqual(["food-4", "unknown"]);
  expect(result.excluded.map(item => item.id)).toEqual(["food-6"]);
  expect(result.excluded[0]?.request_match?.reasons.join(" ")).toContain("超過你設定的 5");
});

test("relaxing food portions does not relax explicit budget, allergens or registration restrictions", () => {
  const result = filterStage([
    { ...food(2), id: "cost", price_total_twd: 999 },
    { ...food(2), id: "allergen", tags: ["牛"] },
    { ...food(2), id: "registration", registration_required: true },
  ], { ...fivePeople, budget_total_twd: 300, registration_ok: false }, ["牛"]);
  expect(result.main).toHaveLength(0);
  expect(result.excluded.map(item => item.id)).toEqual(["cost", "allergen", "registration"]);
});

test("unrequested food portions and non-food capacity rules remain unchanged", () => {
  const browseLike = filterStage([food(6), food(1)], EMPTY_NEED, []);
  expect(browseLike.main.map(item => item.id)).toEqual(["food-1", "food-6"]);
  expect(browseLike.main.every(item => !item.portion_match)).toBe(true);
  const ticket = { ...food(1), category: "交通" as const, quantity_or_servings: "每張限一人" };
  expect(filterStage([ticket], fivePeople, []).excluded).toHaveLength(1);
});

test("explicit Arabic/Chinese serving counts and bounded ranges are recognized without treating pieces as people", () => {
  for (const [text, count] of [["一份", 1], ["兩份", 2], ["三人份", 3], ["4 份餐點", 4], ["５人餐", 5], ["六人份", 6], ["十二份", 12], ["2個漢堡；每人各1個", 2]] as const) {
    expect(foodPortionRange(text)).toEqual({ min: count, max: count });
  }
  expect(foodPortionRange("4～6人份")).toEqual({ min: 4, max: 6 });
  for (const text of [null, "家庭餐", "6塊雞塊", "500克", "2個漢堡", "0份", "1.5份", "六至四人份"]) {
    expect(foodPortionRange(text)).toBeNull();
  }
  const range = { ...food(1), quantity_or_servings: "4～6人份" };
  expect(filterStage([range], fivePeople, []).excluded).toHaveLength(1);
});

test("food portion matching supports changing group sizes, with same-portion ties still ordered by total cost", () => {
  for (let people = 1; people <= 6; people++) {
    const result = filterStage([1, 2, 3, 4, 5, 6].map(food), { ...fivePeople, people_or_servings: people }, []);
    expect(result.main.map(item => item.id)).toEqual(Array.from({ length: people }, (_, i) => `food-${people - i}`));
    expect(result.excluded).toHaveLength(6 - people);
  }
  const result = filterStage([{ ...food(5), id: "expensive", price_total_twd: 300 }, food(4), food(5)], fivePeople, []);
  expect(result.main.map(item => item.id)).toEqual(["food-5", "expensive", "food-4"]);
});

test("LLM and fallback ordering cannot move smaller portions ahead of a closer food match", async () => {
  const records = filterStage([1, 2, 3, 4, 5].map(food), fivePeople, []).main;
  const cheapestFirst = [...records].reverse();
  const output = { order: cheapestFirst.map(record => ({ id: record.id, reason: "價格較低，足夠全員 5 人食用，仍需核對。" })) };
  expect(fallbackRank(cheapestFirst).map(item => item.id)).toEqual(records.map(item => item.id));
  const ranked = sanitizeRanking(records, fivePeople, output);
  expect(ranked.map(item => item.id)).toEqual(records.map(item => item.id));
  expect(ranked.at(-1)?.reason).not.toContain("足夠全員 5 人");
  let candidateMatch: unknown;
  const result = await rankGroup({ agent: "paid", category: "食品", records, need: fivePeople, generate: async ({ prompt }) => {
    candidateMatch = JSON.parse(prompt).candidates[0].portion_match;
    return output;
  }});
  expect(result.status).toBe("done");
  expect(result.records.map(item => item.id)).toEqual(records.map(item => item.id));
  expect(candidateMatch).toEqual({ requested: 5, min: 5, max: 5 });
  const failed = await rankGroup({ agent: "paid", category: "食品", records: cheapestFirst, need: fivePeople, generate: null });
  expect(failed.records.map(item => item.id)).toEqual(records.map(item => item.id));
  expect(failed).toMatchObject({ status: "failed", error: "智慧排序目前無法使用，已改依份量接近度與預估總費用排列" });
});

test("UI recommendation order survives paid/free group merging; explicit cost sort remains cost sort and pending remains last", () => {
  const stage = filterStage([food(5), { ...food(2), price_total_twd: 0, agent: "free" }, { ...food(4), data_status: "部分驗證／待確認" }] as Parameters<typeof filterStage>[0], fivePeople, []);
  let state = initialSearch();
  for (const record of stage.main) state = reduceSearch(state, { agent: record.agent, category: "食品", status: "done", records: [record] });
  const merged = rankedRecords(state, true);
  expect(orderResultCandidates(merged, stage.pending, "rank", false).map(item => item.id)).toEqual(["food-5", "food-2", "food-4"]);
  expect(orderResultCandidates(merged, stage.pending, "cost", true).map(item => item.id)).toEqual(["food-2", "food-5", "food-4"]);
});

test("cards and detail reveal smaller portions without hiding them or claiming a full group meal", () => {
  const stage = filterStage([food(2), food(5), food(6)], fivePeople, []);
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records: [...stage.main].reverse(), pending: [], excluded: stage.excluded, list: [], survival: false,
    onOpen: () => {}, onList: () => {}, onAdjust: () => {},
  }));
  expect(html).toContain("2 個選項");
  expect(html).toContain("標示 2 份／需求 5 人或份");
  expect(html).toContain("不代表足夠全員食用");
  expect(html.indexOf("查看 5人份餐點 詳情")).toBeLessThan(html.indexOf("查看 2人份餐點 詳情"));
  expect(html.indexOf("查看 6人份餐點 詳情")).toBeGreaterThan(html.indexOf("已排除"));
  const detail = renderToStaticMarkup(createElement(DetailView, {
    item: stage.main.find(item => item.id === "food-2")!, favorite: false, listed: false,
    onFavorite: () => {}, onList: () => {}, onReport: () => {},
  }));
  expect(detail).toContain("標示 2 份／需求 5 人或份");
  expect(detail).toContain("不代表足夠全員食用");
});

test("food portions do not hide an oversized option behind a smaller leading count", () => {
  for (const quantity of ["5份或6份", "1份套餐（6人份）", "供6人份", "四至六人份"]) {
    expect(foodPortionRange(quantity)?.max).toBe(6);
    const result = filterStage([{ ...food(1), quantity_or_servings: quantity }], fivePeople, []);
    expect(result.main).toHaveLength(0);
    expect(result.pending).toHaveLength(0);
    expect(result.excluded).toHaveLength(1);
  }
});

test("survival mode still puts confirmed free food first, then orders each price group by portion fit", () => {
  const stage = filterStage([food(5), { ...food(2), price_total_twd: 0, agent: "free" }, food(4)], fivePeople, []);
  expect(orderResultCandidates(stage.main, [], "rank", true).map(item => item.id)).toEqual(["food-2", "food-5", "food-4"]);
});


test("detail retains the current search portion snapshot after a raw catalog record loads", () => {
  const stage = filterStage([food(2)], fivePeople, []);
  const searchRecord = stage.main[0]!;
  const state = reduceSearch(initialSearch(), { agent: "paid", category: "食品", status: "done", records: [searchRecord] });
  const cache = { [searchRecord.id]: food(2) };
  expect(detailRecord(state, cache, searchRecord.id)?.portion_match).toEqual({ requested: 5, min: 2, max: 2 });
  expect(detailRecord(initialSearch(), cache, searchRecord.id)?.portion_match).toBeUndefined();
  expect(detailRecord(state, cache, undefined)).toBeUndefined();
  expect(cache[searchRecord.id]?.portion_match).toBeUndefined();
});


test("detail keeps pending/excluded explanations from the active search snapshot", () => {
  const stage = filterStage([{ ...food(1), quantity_or_servings: null }, food(6)], fivePeople, []);
  const state = { ...initialSearch(), pending: stage.pending, excluded: stage.excluded };
  for (const record of [...stage.pending, ...stage.excluded]) {
    const { request_match: _request, portion_match: _portion, ...raw } = record;
    expect(detailRecord(state, { [record.id]: raw }, record.id)).toBe(record);
  }
});


test("detail drops stale query annotations from cache once the active search changes", () => {
  const raw = food(6);
  const stage = filterStage([raw], fivePeople, []);
  const cached = { ...stage.excluded[0]!, reason: "舊搜尋理由", distance_km: 1.25 };
  const cache = { [cached.id]: cached };
  const newSearch = reduceSearch(initialSearch(), { agent: "paid", category: "食品", status: "done", records: [food(2)] });
  for (const state of [initialSearch(), newSearch]) {
    expect(detailRecord(state, cache, cached.id)).toEqual(raw);
  }
  expect(cache[cached.id]).toBe(cached);
  expect(cached.request_match?.status).toBe("excluded");
  expect(cached.portion_match?.requested).toBe(5);
  expect(cached.reason).toBe("舊搜尋理由");
  expect(cached.distance_km).toBe(1.25);
});
