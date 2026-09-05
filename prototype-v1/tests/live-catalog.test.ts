import { expect, test } from "bun:test";
import { readCatalog, defaultDataDirectory } from "../scripts/catalog-files.ts";
import { CATEGORIES } from "../src/shared/need.ts";
import { assessCatalog } from "../src/shared/catalog-quality.ts";
import { canDisplayGroupOffer, groupOfferEvidence, groupOfferTerms } from "../src/shared/group-offers.ts";
import { isDemoRecord, passesGate, rowToRec } from "../src/shared/records.ts";

test("web research batch contains all five categories and only evidence-backed rows can rank", async () => {
  const batch = await readCatalog(defaultDataDirectory, false);
  const records = batch.records.map(rowToRec);
  expect(new Set(records.map(record=>record.category))).toEqual(new Set(CATEGORIES));
  expect(records.every(record=>!isDemoRecord(record))).toBe(true);
  const researchBatches = new Set(["yuanshan-2026-09-05", "expansion-2026-09-05"]);
  expect(records.every(record=>researchBatches.has(String(record.extra.research_batch)))).toBe(true);
  expect(assessCatalog(records).issues).toEqual([]);
  // Coverage gaps are reported by data:validate, not concealed with an invented verified row.
  for (const record of records) {
    expect(record.source_url.startsWith("https://")).toBe(true);
    if (record.data_status === "已驗證") {
      expect(record.evidence.length).toBeGreaterThan(0);
      expect(passesGate(record)).toBe(true);
    } else {
      // Inaccessible or ambiguous sources stay honest pending rows, not invented evidence.
      expect(passesGate(record)).toBe(false);
      expect(record.extra.review_notes).toBeDefined();
    }
    if (record.lat !== null) expect(record.extra.source_coordinates).toBeDefined();
  }
});

// Database baseline: 18 food, 7 household, 7 community, 10 activities, 8 transport.
// Only new real options satisfy expansion; the ten fixtures and one archived row remain untouched.
test("threefold expansion adds exactly 100 distinct, non-demo, non-archived options", async () => {
  const { records } = await readCatalog(defaultDataDirectory, false);
  const additions = records.filter(record => record.extra.research_batch === "expansion-2026-09-05");
  const expected = { "食品": 36, "日用品": 14, "免費／公益資源": 14, "活動": 20, "交通": 16 };
  expect(additions).toHaveLength(100);
  for (const category of CATEGORIES) {
    expect(additions.filter(record => record.category === category)).toHaveLength(expected[category]);
  }
  expect(additions.every(record => !isDemoRecord(record) && record.extra.archived !== true)).toBe(true);
  expect(new Set(records.map(record => record.id)).size).toBe(records.length);
  // Exact offer duplicates must not inflate coverage simply by receiving another id.
  const identity = (record: typeof records[number]) =>
    JSON.stringify([record.category, record.provider, record.title, record.quantity_or_servings, record.price_total_twd]);
  const active = records.filter(record => record.extra.archived !== true);
  expect(new Set(active.map(identity)).size).toBe(active.length);
  const household = active.filter(record => record.category === "日用品");
  expect(new Set(household.map(record => record.source_url)).size).toBe(household.length);
  for (const record of additions) {
    expect(typeof record.extra.scope).toBe("string");
    expect((record.extra.scope as string).trim().length).toBeGreaterThan(0);
    expect(record.source_authority === "official" || record.source_authority === "provider").toBe(true);
  }
});


// Evaluate at the batch audit clock: later expiry should hide an offer at runtime,
// not make this historical research fixture impossible to verify.
test("expanded group offers have independently sourced thresholds and redemption terms", async () => {
  const { records } = await readCatalog(defaultDataDirectory, false);
  const groups = records.filter(record => record.extra.research_batch === "expansion-2026-09-05" && record.group_offer !== null).map(rowToRec);
  expect(groups.length).toBeGreaterThanOrEqual(6);
  for (const record of groups) {
    const auditedAt = Math.max(Date.parse(record.verified_at), ...groupOfferEvidence(record).map(item => Date.parse(item.checked_at)));
    expect(canDisplayGroupOffer(record, auditedAt)).toBe(true);
    expect(groupOfferTerms(record)?.redemption_method).toBeTruthy();
    expect(groupOfferEvidence(record).length).toBeGreaterThan(0);
    expect(record.group_offer!.min_people).toBeGreaterThanOrEqual(2);
    // No synthetic AIL/DEMO placeholders may be mistaken for a merchant coupon.
    expect(record.group_offer!.redeem_code ?? "").not.toMatch(/^(AIL|DEMO)[-_/]/i);
  }
});
