import { expect, test } from "bun:test";
import { candidateSchema, groupTotal, rowToRec } from "../src/shared/records.ts";
import { canDisplayGroupOffer } from "../src/shared/group-offers.ts";
const now = Date.parse("2026-09-05T15:30:00Z");
const raw = {
  id: "a_gr01", category: "活動", agent: "paid", title: "團體票測試", provider: "場館",
  price_total_twd: 100, mandatory_fees_twd: 0, quantity_or_servings: "1張", availability_or_event_time: "常態開放",
  source_url: "https://www.zoo.gov.taipei/", source_type: "curated", source_authority: "official",
  evidence: ["價格", "份量", "時間"].map(field => ({ field, quote: "來源原文", url: "https://www.zoo.gov.taipei/", checked_at: "2026-09-05T15:00:00Z" })),
  collected_at: "2026-09-05T15:00:00Z", verified_at: "2026-09-05T15:00:00Z", data_status: "已驗證",
  group_offer: { min_people: 30, price_per_person: 70, redeem_code: null, note: "30人同時購票入場" },
  extra: { group_offer_terms: { redemption_method: "現場清點人數購票", valid_until: null }, group_offer_evidence: [{ field: "團體優惠", quote: "團體達30人，單一票價每人70元。", url: "https://www.zoo.gov.taipei/", checked_at: "2026-09-05T15:00:00Z" }] },
};
const rec = () => rowToRec(candidateSchema.parse(raw));
test("no published redeem code is null, not an invented placeholder", () => {
  const record = rec();
  expect(record.group_offer?.redeem_code).toBeNull();
  expect(canDisplayGroupOffer(record, now)).toBe(true);
  expect(groupTotal(record, 30)).toBe(2100);
  expect(groupTotal(record, 29)).toBe(100);
  expect(candidateSchema.safeParse({ ...raw, group_offer: { ...raw.group_offer, redeem_code: "" } }).success).toBe(false);
});
test("group page requires real group evidence and actual multi-person threshold", () => {
  for (const patch of [{ extra: {} }, { extra: { ...raw.extra, group_offer_evidence: [] } }, { group_offer: { ...raw.group_offer, min_people: 1 } }, { extra: { ...raw.extra, demo: true } }, { extra: { ...raw.extra, archived: true } }, { data_status: "部分驗證／待確認" as const }]) {
    expect(canDisplayGroupOffer({ ...rec(), ...patch }, now)).toBe(false);
  }
});
test("group expiry is independent of venue expiry and future deals are not advertised as current", () => {
  for (const dates of [{ valid_until: "2026-09-04T00:00:00Z" }, { valid_until: "not-a-date" }, { valid_until: null, valid_from: "2026-10-01T00:00:00Z" }]) {
    expect(canDisplayGroupOffer({ ...rec(), extra: { ...raw.extra, group_offer_terms: { redemption_method: "現場", ...dates } } }, now)).toBe(false);
  }
});
test("unverified or unsafe group evidence cannot be surfaced", () => {
  for (const patch of [{ checked_at: "2027-01-01T00:00:00Z" }, { checked_at: "bad" }, { url: "http://unsafe.example" }, { quote: "" }]) {
    expect(canDisplayGroupOffer({ ...rec(), extra: { ...raw.extra, group_offer_evidence: [{ ...raw.extra.group_offer_evidence[0], ...patch }] } }, now)).toBe(false);
  }
});
