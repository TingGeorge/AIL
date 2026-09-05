import { expect, test } from "bun:test";
import { haversineKm, walkMinutes, isExpired, rowToRec, type Rec } from "../src/shared/records.ts";

// 台北車站 → 圓山站，實際直線約 3.1 km。
test("haversineKm: 台北車站 → 圓山", () => {
  const km = haversineKm({ lat: 25.0478, lng: 121.5170 }, { lat: 25.0713, lng: 121.5203 });
  expect(km).toBeGreaterThan(2.5);
  expect(km).toBeLessThan(3.5);
  expect(haversineKm({ lat: 25, lng: 121 }, { lat: 25, lng: 121 })).toBe(0);
});

test("walkMinutes: 0.08 km/分（估算）", () => {
  expect(walkMinutes(0.8)).toBe(10);
  expect(walkMinutes(0)).toBe(0);
});

test("isExpired: null 永不過期，過去的期限才算過期", () => {
  const at = (valid_until: string | null) => ({ valid_until }) as Rec;
  const now = Date.parse("2026-09-05T12:00:00+08:00");
  expect(isExpired(at(null), now)).toBe(false);
  expect(isExpired(at("2026-09-04T23:59:59+08:00"), now)).toBe(true);
  expect(isExpired(at("2026-09-30T23:59:59+08:00"), now)).toBe(false);
});

// Bun.sql 的回傳型別：timestamptz → Date、jsonb → 已解析物件、缺欄位 → null。
test("rowToRec: Date 轉 ISO、null 補預設值、tags 的 null 不能變成 []", () => {
  const rec = rowToRec({
    id: "f1", category: "食品", title: "雙人便當", provider: "示範便當店", agent: "paid",
    price_total_twd: null, mandatory_fees_twd: 0, discount_twd: 0,
    price_unit: null, quantity_or_servings: null,
    eligibility: null, registration_required: false, availability_or_event_time: null,
    distance_or_time_text: null, address: null, lat: null, lng: null,
    valid_until: new Date("2026-09-30T15:59:59Z"),
    source_url: "#", source_type: "curated", source_authority: "provider",
    evidence: null, collected_at: new Date("2026-09-04T01:10:00Z"), verified_at: null,
    data_status: "無法納入比較", action_label: null, action_url: null,
    extra: null, baseline: null, tags: null, group_offer: null,
  });
  expect(rec.valid_until).toBe("2026-09-30T15:59:59.000Z");
  expect(rec.collected_at).toBe("2026-09-04T01:10:00.000Z");
  expect(rec.verified_at).toBe("");
  expect(rec.eligibility).toEqual([]);
  expect(rec.evidence).toEqual([]);
  expect(rec.extra).toEqual({});
  expect(rec.tags).toBeNull();          // null = 成分未標示，不是「確認無」
  expect(rec.price_total_twd).toBeNull(); // 未知價格絕不當 0
});
