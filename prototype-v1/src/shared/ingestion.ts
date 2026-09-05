import { candidateSchema, isDemoRecord, type CandidateFile } from "./records.ts";

const canonicalUrl = (value: string) => {
  try { return new URL(value).href; }
  catch { return null; }
};

// Public provenance URLs only. This is validation, not permission to fetch arbitrary hosts.
export function publicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.+$/, "");
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && !host.includes(":") && !/^[\d.]+$/.test(host) && host.includes(".") && host.split(".").every(Boolean)
      && !/(^|\.)(localhost|local|internal|test|invalid|example|example\.com|example\.org|example\.net|home\.arpa|onion)$/.test(host);
  } catch { return false; }
}

export type ImportRecord = Omit<CandidateFile, "lat" | "lng"> & { lat: number | null; lng: number | null };

export function prepareCandidate(raw: unknown, options: { allowDemo?: boolean; now?: number } = {}): ImportRecord {
  if (typeof raw === "object" && raw !== null && !Object.hasOwn(raw, "mandatory_fees_twd")) {
    throw new Error("資料必須明填必要費用；不知道填 null，不能省略當成 0。");
  }
  const record = candidateSchema.parse(raw);
  const now = options.now ?? Date.now();
  const demo = isDemoRecord(record);
  if (demo && !options.allowDemo) throw new Error("示範資料需要明確設定 ALLOW_DEMO_DATA=1；正式環境請使用真實來源。");
  if (!demo) {
    const sourceUrls = [record.source_url, ...record.evidence.map(item => item.url)];
    if (sourceUrls.some(url => !publicHttpsUrl(url))) throw new Error("真實資料來源必須是公開 HTTPS，不能使用範例、內網或含憑證網址。");
    const dates = [record.collected_at, record.verified_at, ...record.evidence.map(item => item.checked_at)].filter((value): value is string => value !== null);
    if (dates.some(value => Date.parse(value) > now + 60_000)) throw new Error("蒐集／查核時間不可位於未來。");
    if (record.data_status === "已驗證" && (!record.quantity_or_servings?.trim() || !record.availability_or_event_time?.trim())) {
      throw new Error("已驗證資料需要來源支持的份量與可用時間，不能只有欄位名摘錄。");
    }
  }

  // Optional coordinates must be published by the source, never guessed from the place name.
  const source = record.extra.source_coordinates;
  let lat: number | null = null;
  let lng: number | null = null;
  if (source !== undefined && source !== null) {
    if (typeof source !== "object" || Array.isArray(source)) throw new Error("source_coordinates 格式錯誤。");
    const value = source as Record<string, unknown>;
    const coordinateUrl = typeof value.url === "string" ? canonicalUrl(value.url) : null;
    const hasLocationEvidence = coordinateUrl !== null && record.evidence.some(item =>
      item.field === "地點" && canonicalUrl(item.url) === coordinateUrl);
    if (typeof value.lat !== "number" || !Number.isFinite(value.lat) || value.lat < 21.5 || value.lat > 25.5
      || typeof value.lng !== "number" || !Number.isFinite(value.lng) || value.lng < 118 || value.lng > 122.5
      || typeof value.url !== "string" || !publicHttpsUrl(value.url) || record.address === null || !hasLocationEvidence) {
      throw new Error("來源座標需有同 URL 的地點證據、公開 HTTPS、實體地址及成對台灣範圍座標。");
    }
    lat = value.lat;
    lng = value.lng;
  }
  return { ...record, lat, lng };
}
