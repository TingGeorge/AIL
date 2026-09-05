import { CATEGORIES } from "./need.ts";
import { dataStatusOf, isDemoRecord, TAGS, type Category, type Rec } from "./records.ts";
import { publicHttpsUrl } from "./ingestion.ts";

const canonicalUrl = (value: string) => {
  try { return new URL(value).href; }
  catch { return null; }
};

export function verifiedRecordIssue(record: Rec, now = Date.now()): string | null {
  if (record.data_status !== "已驗證") return "資料未標示為已驗證";
  const derived = dataStatusOf(record, now);
  if (derived !== "已驗證") return `已驗證標記已失效：${derived}`;
  if (!record.quantity_or_servings?.trim() || !record.availability_or_event_time?.trim()) return "缺少份量或可用時間";
  if (![record.source_url, ...record.evidence.map(item => item.url)].every(publicHttpsUrl)) return "來源不是有效的公開 HTTPS";
  const dates = [record.collected_at, record.verified_at, ...record.evidence.map(item => item.checked_at)];
  if (dates.some(value => !value || Number.isNaN(Date.parse(value)) || Date.parse(value) > now + 60_000)
    || (record.valid_until !== null && Number.isNaN(Date.parse(record.valid_until)))) return "無效或未來的查核時間";
  return null;
}

export const truthfullyVerified = (record: Rec, now = Date.now()) => verifiedRecordIssue(record, now) === null;

export const catalogCoordinateIssue = (record: Rec, now = Date.now()): string | null => {
  if ((record.lat === null) !== (record.lng === null)) return "座標必須成對";
  if (record.lat === null || record.lng === null) return null;
  if (!Number.isFinite(record.lat) || record.lat < 21.5 || record.lat > 25.5
    || !Number.isFinite(record.lng) || record.lng < 118 || record.lng > 122.5) return "座標不在臺灣範圍";
  if (!record.address) return "座標缺乏實體地址";
  const source = record.extra.source_coordinates;
  if (typeof source !== "object" || source === null || Array.isArray(source)) return "座標缺乏來源紀錄";
  const value = source as Record<string, unknown>;
  const url = typeof value.url === "string" ? canonicalUrl(value.url) : null;
  if (value.lat !== record.lat || value.lng !== record.lng || typeof value.url !== "string" || !publicHttpsUrl(value.url)) {
    return "座標與來源紀錄不一致";
  }
  if (!record.evidence.some(item => item.field === "地點" && canonicalUrl(item.url) === url)) return "座標缺乏同 URL 的地點證據";
  if (record.evidence.some(item => item.field === "地點" && canonicalUrl(item.url) === url
    && (Number.isNaN(Date.parse(item.checked_at)) || Date.parse(item.checked_at) > now + 60_000))) return "座標證據時間無效或位於未來";
  return null;
};

// A readiness check is not source verification: humans still check the linked evidence.
// Deliberately expired/conflicting fixtures belong in tests, never in a live merchant catalogue.
export function assessCatalog(records: Rec[], scope: readonly Category[] = CATEGORIES, now = Date.now()) {
  const live = records.filter(record => scope.includes(record.category) && !isDemoRecord(record) && record.extra.archived !== true);
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const record of live) {
    const fail = (reason: string) => issues.push(`${record.id}: ${reason}`);
    if (ids.has(record.id)) fail("重複 id");
    ids.add(record.id);
    if (![record.source_url, ...record.evidence.map(item => item.url)].every(publicHttpsUrl)) fail("來源不是有效的公開 HTTPS");
    if (record.data_status === "已驗證") {
      const issue = verifiedRecordIssue(record, now);
      if (issue && issue !== "來源不是有效的公開 HTTPS" && issue !== "無效或未來的查核時間") fail(issue);
    }
    const dates = [record.collected_at, record.verified_at, ...record.evidence.map(item => item.checked_at)].filter(Boolean);
    if (dates.some(value => Number.isNaN(Date.parse(value)) || Date.parse(value) > now + 60_000)
      || (record.valid_until !== null && Number.isNaN(Date.parse(record.valid_until)))) fail("無效或未來的查核時間");
    if (record.tags?.length === 0 && TAGS.some(tag => record.evidence.some(item => item.quote.includes(tag)))) fail("證據有成分描述，tags 不應為空陣列");
    const coordinates = catalogCoordinateIssue(record, now);
    if (coordinates) fail(coordinates);
  }
  const categories = scope.map(category => {
    const selected = live.filter(record => record.category === category);
    const rankable = selected.filter(record => truthfullyVerified(record, now)).length;
    return { category, total: selected.length, rankable, pending: selected.length - rankable, target: 7, gap: Math.max(0, 7 - rankable) };
  });
  return { total: live.length, ignored: records.length - live.length, categories, issues, ready: issues.length === 0 && categories.every(category => category.gap === 0) };
}
