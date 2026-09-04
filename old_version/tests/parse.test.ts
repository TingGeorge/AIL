import { describe, expect, test } from "bun:test";
import { parseNeed, parseConfigured } from "../src/server/parse.ts";
import { EMPTY_NEED, needSchema, type Need } from "../src/shared/need.ts";

// Fixtures from docs/SPEC-voice-input.md §10, run against the configured LLM.
// Skips when LLM_BASE_URL / LLM_MODEL are unset so the suite stays green on a bare checkout.
const today = "2026-09-04";
const live = parseConfigured();

describe.skipIf(!live)("需求解析 (live provider)", () => {
  test("1. 情境 A", async () => {
    const n = await parseNeed({ transcript: "今天晚餐兩個人預算三百圓山區二十分鐘內可以外帶", current: null, today });
    expect(n.need).toContain("晚餐");
    expect(n.people_or_servings).toBe(2);
    expect(n.budget_total_twd).toBe(300);
    expect(n.max_minutes).toBe(20);
    expect(n.date).toBe(today);
    expect(n.soft_preferences.join()).toContain("外帶");
  }, 60_000);

  test("2. 情境 B", async () => {
    const n = await parseNeed({ transcript: "這週末圓山區有沒有不用付費的活動或公共資源可以先登記", current: null, today });
    expect(n.free_only).toBe(true);
    expect(n.registration_ok).toBe(true);
    expect(n.budget_total_twd).toBeNull();
    expect(n.target_categories).toEqual(expect.arrayContaining(["免費／公益資源", "活動"]));
  }, 60_000);

  test("3. 沒說預算", async () => {
    const n = await parseNeed({ transcript: "圓山區今天晚餐", current: null, today });
    expect(n.budget_total_twd).toBeNull();
    expect(n.people_or_servings).toBeNull();
  }, 60_000);

  test("4. 修正語句只改人數", async () => {
    const current: Need = { ...EMPTY_NEED, need: "晚餐", people_or_servings: 2, budget_total_twd: 300, soft_preferences: ["可外帶"] };
    const n = await parseNeed({ transcript: "改成三個人", current, today });
    expect(n.people_or_servings).toBe(3);
    expect(n.budget_total_twd).toBe(300);
    expect(n.soft_preferences).toEqual(["可外帶"]);
  }, 60_000);

  test("5. 未解析內容", async () => {
    const n = await parseNeed({ transcript: "晚餐兩個人靠近捷運站", current: null, today });
    expect(n.unresolved.join()).toContain("捷運");
    expect(n.max_distance_km).toBeNull();
  }, 60_000);

  test("6. 英文 token 不遺失", async () => {
    const n = await parseNeed({ transcript: "兩個人晚餐預算 NT$300 想去 Costco 附近", current: null, today });
    expect(n.budget_total_twd).toBe(300);
    expect([...n.unresolved, ...n.soft_preferences].join()).toContain("Costco");
  }, 60_000);
});

test("schema rejects a guessed extra field and accepts EMPTY_NEED", () => {
  expect(needSchema.safeParse(EMPTY_NEED).success).toBe(true);
  expect(needSchema.safeParse({ ...EMPTY_NEED, target_categories: ["其他"] }).success).toBe(false);
});
