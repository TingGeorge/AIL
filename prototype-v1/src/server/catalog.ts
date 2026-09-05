import { CATEGORIES } from "../shared/need.ts";
import { dataStatusOf, isDemoRecord, type Rec } from "../shared/records.ts";
import { catalogCoordinateIssue, truthfullyVerified, verifiedRecordIssue } from "../shared/catalog-quality.ts";
import { publicHttpsUrl } from "../shared/ingestion.ts";
import type { CatalogSummary } from "../shared/catalog.ts";

const safeRecord = (record: Rec, now: number): Rec => {
  if (isDemoRecord(record)) return record;
  const safeCoordinates = catalogCoordinateIssue(record, now) ? { ...record, lat: null, lng: null } : record;
  if (safeCoordinates.data_status !== "已驗證" || !verifiedRecordIssue(safeCoordinates, now)) return safeCoordinates;
  const derived = dataStatusOf(safeCoordinates, now);
  return { ...safeCoordinates, data_status: derived === "已驗證" ? "部分驗證／待確認" : derived };
};

// Fixtures stay in the database for reference; only an explicit demo environment can expose them.
// Live rows with an unsubstantiated verified label remain visible, but are downgraded before ranking.
export function publicRecords(records: Rec[], now = Date.now()): Rec[] {
  return records.filter(record => record.extra.archived !== true
    && (process.env.ALLOW_DEMO_DATA === "1" || !isDemoRecord(record))
    && (isDemoRecord(record) || [record.source_url, ...record.evidence.map(item => item.url)].every(publicHttpsUrl)))
    .map(record => safeRecord(record, now));
}

export function summarizeCatalog(records: Rec[], now = Date.now()): CatalogSummary {
  const rankable = records.filter(record => truthfullyVerified(record, now)).length;
  const dates = records.filter(record => truthfullyVerified(record, now)).map(record => record.verified_at)
    .filter(value => value && !Number.isNaN(Date.parse(value)));
  return {
    total: records.length,
    rankable,
    pending: records.length - rankable,
    demonstration: records.filter(isDemoRecord).length,
    latest_verified_at: dates.sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null,
    scope: "圓山站／大龍峒／花博周邊，活動另含明示的士林科教館／天文館延伸選項；另有線上配送與全臺公共服務；資料是來源查核快照，不代表即時庫存。",
    categories: CATEGORIES.map(category => {
      const selected = records.filter(record => record.category === category);
      const eligible = selected.filter(record => truthfullyVerified(record, now)).length;
      return { category, total: selected.length, rankable: eligible, pending: selected.length - eligible };
    }),
  };
}
