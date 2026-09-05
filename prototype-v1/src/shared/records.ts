// Candidate record (PRD §9.1) as the client renders it, plus the comparison rules of §9.3,
// and the session-local community objects (profile, settings, reports, teams).
import { z } from "zod";
import type { Need } from "./need.ts";
import { CATEGORIES } from "./need.ts";

export type Category = (typeof CATEGORIES)[number];
export const DATA_STATUSES = ["已驗證", "部分驗證／待確認", "過期／待確認", "衝突待確認", "無法納入比較"] as const;
export type DataStatus = (typeof DATA_STATUSES)[number];

export const TAGS = ["牛", "豬", "雞", "海鮮", "辣", "素", "含酒精"] as const;
export const PREFS = ["可外帶", "素食優先", "不排隊", "有座位", "近捷運", "營業到晚"] as const;
export const DOT_COLORS = ["#3b7bff", "#ff4b3e", "#ffe14d", "#e4ff1a", "#7cf2c4", "#c48bff"] as const;

export type GroupOffer = { min_people: number; discount_pct?: number; price_per_person?: number; redeem_code: string; note: string };

// 逐欄證據摘錄（SPEC-ingestion §5）。同一個 field 出現兩筆 = 該來源自己前後矛盾。
export type Evidence = { field: string; quote: string; url: string; checked_at: string };

export type Rec = {
  id: string;
  category: Category;
  title: string;
  provider: string;
  price_total_twd: number | null;
  mandatory_fees_twd: number;
  discount_twd: number;
  price_unit: string | null;
  quantity_or_servings: string | null;
  eligibility: string[];
  registration_required: boolean;
  availability_or_event_time: string | null;
  distance_or_time_text: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  valid_until: string | null;   // 來源明示的有效期限；null = 未明示
  source_url: string;
  source_type: "curated" | "web-searched";
  source_authority: "official" | "provider" | "public" | "other";
  evidence: Evidence[];
  collected_at: string;
  verified_at: string;
  data_status: DataStatus;
  agent: "paid" | "free";
  action_label: string | null;
  action_url: string | null;
  extra: Record<string, unknown>;
  baseline: { name: string; total_twd: number; basis: string; as_of: string } | null;
  tags: string[] | null; // null = 成分未標示
  group_offer: GroupOffer | null;
  // 搜尋流程後填，不在資料庫裡
  distance_km?: number | null;
  reason?: string | null;
};

export type Profile = { nickname: string; color: string };
export type Settings = { monthly_budget: number | null; spent: number; spent_month: string; survival: boolean; exclude: string[]; prefs: string[]; costco_ok: boolean };
export const EXPERIENCE_REASONS = ["食安", "過敏", "身體不適"] as const;
export const DATA_REASONS = ["價格過期", "條件錯誤", "來源失效", "分類錯誤"] as const;
export type Report = { id: string; candidate_id: string; reason: string; note: string; created_at: string; by: string };
export type Team = { rec_id: string; code: string; members: { name: string; color: string }[] };

export const isExperience = (r: Report) => (EXPERIENCE_REASONS as readonly string[]).includes(r.reason);
export const recentExperience = (reports: Report[], recId: string, now = Date.now()) =>
  reports.filter((r) => r.candidate_id === recId && isExperience(r) && now - Date.parse(r.created_at) < 30 * 86_400_000);

// 總可比成本 = 價格 + 必要費用 − 明確適用折扣；未知價格不視為 0。
export const comparableTotal = (r: Rec) =>
  r.price_total_twd === null ? null : r.price_total_twd + r.mandatory_fees_twd - r.discount_twd;

export const groupTotal = (r: Rec, people: number) => {
  const t = comparableTotal(r);
  if (t === null || !r.group_offer || people < r.group_offer.min_people) return t;
  if (r.group_offer.price_per_person !== undefined) return r.group_offer.price_per_person * people;
  return Math.round(t * (1 - (r.group_offer.discount_pct ?? 0) / 100));
};

export const saving = (r: Rec) => {
  const total = comparableTotal(r);
  if (total === null || !r.baseline || r.data_status !== "已驗證") return null;
  const amount = r.baseline.total_twd - total;
  return { amount, pct: Math.round((amount / r.baseline.total_twd) * 100) };
};

export const COSTCO_MEMBER = "Costco 會員";

// 證據閘門（SPEC-backend §8.3）：已驗證、算得出總可比成本，而且沒有過期。過期是查詢當下判定。
export const passesGate = (r: Rec, now = Date.now()) =>
  r.data_status === "已驗證" && comparableTotal(r) !== null && !isExpired(r, now);

export type ExcludedBy = { budget: number; free_only: number; distance: number; exclude: number; registration: number; costco: number };

// 硬限制（PRD FR-04、SPEC-backend §8.3）：回傳被哪些限制擋下，空陣列 = 通過。
// ponytail: people_or_servings、date、time_window、eligibility_notes 維持文字，只顯示、交給 LLM，
// 不做機器篩選 —— 紀錄上沒有對應的結構化欄位。
export const hardViolations = (r: Rec, n: Need, exclude: string[], costcoOk: boolean): (keyof ExcludedBy)[] => {
  const out: (keyof ExcludedBy)[] = [];
  const total = comparableTotal(r);
  if (n.free_only && total !== 0) out.push("free_only");
  if (n.budget_total_twd !== null && total !== null && total > n.budget_total_twd) out.push("budget");
  if (r.tags && exclude.some((t) => r.tags!.includes(t))) out.push("exclude");
  const km = r.distance_km;   // null／undefined = 沒有座標，顯示但不做距離篩選（SPEC-geocoding）
  if (km !== null && km !== undefined
    && ((n.max_distance_km !== null && km > n.max_distance_km) || (n.max_minutes !== null && walkMinutes(km) > n.max_minutes))) out.push("distance");
  if (n.registration_ok === false && r.registration_required) out.push("registration");
  if (!costcoOk && r.eligibility.includes(COSTCO_MEMBER)) out.push("costco");
  return out;
};

export const passesHard = (r: Rec, n: Need, exclude: string[], costcoOk = true) =>
  hardViolations(r, n, exclude, costcoOk).length === 0;

// 總可比成本由低至高，同成本時新確認的在前。生存模式：免費永遠在前。
export const costOrder = (survival = false) => (a: Rec, b: Rec) => {
  const ta = comparableTotal(a) ?? Infinity, tb = comparableTotal(b) ?? Infinity;
  if (survival && (ta === 0) !== (tb === 0)) return ta === 0 ? -1 : 1;
  return ta - tb || b.verified_at.localeCompare(a.verified_at);
};

export type Bucket = { main: Rec[]; pending: Rec[]; excluded: Rec[] };

// 先過閘門，再套硬限制，最後依成本排序。
export const bucket = (recs: Rec[], n: Need, exclude: string[], survival: boolean, costcoOk = true): Bucket => {
  const out: Bucket = { main: [], pending: [], excluded: [] };
  for (const r of recs) {
    if (!passesGate(r)) out.pending.push(r);
    else if (!passesHard(r, n, exclude, costcoOk)) out.excluded.push(r);
    else out.main.push(r);
  }
  out.main.sort(costOrder(survival));
  return out;
};

export type Stage1 = { main: Rec[]; pending: Rec[]; excluded: Rec[]; excluded_by: ExcludedBy };

// 第一階段（SPEC-backend §8）：閘門 → 硬限制 → 依成本排序。整趟搜尋只跑一次，兩個 Agent 共用。
// 一筆被多個限制擋下時每個限制都計數：FR-13 要回答的是「放寬哪一個限制才會有結果」。
export const filterStage = (recs: Rec[], n: Need, exclude: string[], costcoOk: boolean, now = Date.now()): Stage1 => {
  const out: Stage1 = {
    main: [], pending: [], excluded: [],
    excluded_by: { budget: 0, free_only: 0, distance: 0, exclude: 0, registration: 0, costco: 0 },
  };
  for (const r of recs) {
    if (!passesGate(r, now)) { out.pending.push(r); continue; }
    const hit = hardViolations(r, n, exclude, costcoOk);
    for (const k of hit) out.excluded_by[k]++;
    (hit.length === 0 ? out.main : out.excluded).push(r);
  }
  out.main.sort(costOrder(false));   // 生存模式的「免費在前」在前端合併時處理
  return out;
};

export const statusPip = (s: DataStatus) => (s === "已驗證" ? "yellow" : s === "過期／待確認" || s === "衝突待確認" ? "red" : "blue");
export const money = (n: number) => (n === 0 ? "FREE" : `NT$${n.toLocaleString("zh-TW")}`);
export const joinCode = (id: string) => `AIL-${id.toUpperCase()}${(id.length * 7) % 10}${(id.charCodeAt(0) * 3) % 10}`;

// 直線距離（haversine）。SPEC-backend §3：只做直線估算，顯示時必須標「估算」。
// ponytail: 不走路網、不看即時交通；升級路徑是換成 Google Routes computeRouteMatrix，只換這個函式。
export const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

// 步行每分鐘 80 公尺（SPEC-backend §3），標示為估算。
export const walkMinutes = (km: number) => Math.round(km / 0.08);

// `valid_until` 到期的紀錄退出主要排序（SPEC-backend §8、SPEC-ingestion §7）。
export const isExpired = (r: { valid_until: string | null }, now = Date.now()) =>
  r.valid_until !== null && Date.parse(r.valid_until) < now;

// candidates 的一列 → Rec。所有路由只能走這裡（SPEC-backend §5.1）。
// Bun.sql 回傳的 timestamptz 是 Date、text[] 是陣列、jsonb 是**字串**（要自己 parse）。
export const rowToRec = (row: Record<string, unknown>): Rec => {
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null));
  const json = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v) ?? null;
  return {
    id: row.id as string,
    category: row.category as Category,
    title: row.title as string,
    provider: row.provider as string,
    price_total_twd: row.price_total_twd as number | null,
    mandatory_fees_twd: row.mandatory_fees_twd as number,
    discount_twd: row.discount_twd as number,
    price_unit: row.price_unit as string | null,
    quantity_or_servings: row.quantity_or_servings as string | null,
    eligibility: (row.eligibility as string[] | null) ?? [],
    registration_required: row.registration_required as boolean,
    availability_or_event_time: row.availability_or_event_time as string | null,
    distance_or_time_text: row.distance_or_time_text as string | null,
    address: row.address as string | null,
    lat: row.lat as number | null,
    lng: row.lng as number | null,
    valid_until: iso(row.valid_until),
    source_url: row.source_url as string,
    source_type: row.source_type as Rec["source_type"],
    source_authority: row.source_authority as Rec["source_authority"],
    evidence: (json(row.evidence) as Evidence[] | null) ?? [],
    collected_at: iso(row.collected_at)!,
    verified_at: iso(row.verified_at) ?? "",
    data_status: row.data_status as DataStatus,
    agent: row.agent as Rec["agent"],
    action_label: row.action_label as string | null,
    action_url: row.action_url as string | null,
    extra: (json(row.extra) as Record<string, unknown> | null) ?? {},
    baseline: (json(row.baseline) as Rec["baseline"]) ?? null,
    tags: row.tags as string[] | null,
    group_offer: (json(row.group_offer) as GroupOffer | null) ?? null,
    distance_km: null,   // 搜尋流程後填（SPEC-backend §5.1）
    reason: null,
  };
};

// ---- 匯入契約（SPEC-ingestion §4–§6）----
// scripts/import.ts、scripts/check-data.ts 與測試共用這一份規則，不各自寫一次。

const timestamp = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "時間格式不是可解析的 ISO 字串");
const httpsUrl = z.string().regex(/^https:\/\//, "來源必須是 https");

// evidence 的 field 用欄位中文名（§5）。
export const EVIDENCE_FIELDS = ["價格", "份量", "資格", "時間", "地點"] as const;

const candidateShape = {
  id: z.string().regex(/^[fdrat]_[a-z0-9]{4}$/, "id 是類別前綴 + 4 碼，例如 f_a3k9"),
  category: z.enum(CATEGORIES),
  agent: z.enum(["paid", "free"]),
  title: z.string().min(1),
  provider: z.string().min(1),
  price_total_twd: z.number().int().nullable(),          // null = 未知；絕不填 0
  mandatory_fees_twd: z.number().int().default(0),
  discount_twd: z.number().int().default(0),
  price_unit: z.string().nullable().default(null),
  quantity_or_servings: z.string().nullable().default(null),
  eligibility: z.array(z.string()).default([]),
  registration_required: z.boolean().default(false),
  availability_or_event_time: z.string().nullable().default(null),
  valid_until: timestamp.nullable().default(null),
  address: z.string().nullable().default(null),
  lat: z.null().default(null),                           // 匯入者不填，由 scripts/geocode.ts 寫入
  lng: z.null().default(null),
  distance_or_time_text: z.string().nullable().default(null),
  tags: z.array(z.enum(TAGS)).nullable().default(null),  // null = 成分未標示，和 [] 不同意思
  source_url: httpsUrl,
  source_type: z.enum(["curated", "web-searched"]),
  source_authority: z.enum(["official", "provider", "public", "other"]),
  evidence: z.array(z.object({
    field: z.enum(EVIDENCE_FIELDS),
    quote: z.string().min(1),
    url: httpsUrl,
    checked_at: timestamp,
  })).default([]),
  collected_at: timestamp,
  verified_at: timestamp.nullable().default(null),
  data_status: z.enum(DATA_STATUSES),
  action_url: z.string().nullable().default(null),
  action_label: z.string().nullable().default(null),
  baseline: z.object({
    name: z.string().min(1),
    total_twd: z.number().int(),
    basis: z.enum(["user_plan", "local_common", "costco"]),
    as_of: z.string().min(1),
  }).nullable().default(null),
  group_offer: z.object({
    min_people: z.number().int().positive(),
    discount_pct: z.number().optional(),
    price_per_person: z.number().int().optional(),
    redeem_code: z.string().min(1),
    note: z.string().min(1),
  }).nullable().default(null),
  extra: z.record(z.string(), z.unknown()).default({}),
};

// 欄位順序即 insert 的欄位順序（scripts/import.ts）。
export const CANDIDATE_COLUMNS = Object.keys(candidateShape);

export const candidateSchema = z.strictObject(candidateShape).superRefine((r, ctx) => {
  const bad = (message: string, path: string) => ctx.addIssue({ code: "custom", message, path: [path] });
  if (r.agent === "paid" && r.price_total_twd === 0) bad("價格 0 卻標 paid（§9 檢查 3）", "agent");
  if (r.data_status === "已驗證" && r.verified_at === null) bad("沒有 verified_at 就不能是「已驗證」（§4）", "data_status");
  if (r.address !== null && r.extra.address_source === undefined) bad("有 address 就要設 extra.address_source（§6.2）", "extra");
});

export type CandidateFile = z.infer<typeof candidateSchema>;

// §5 必要摘錄：價格、份量、時間；有 eligibility 再加資格，有 address 再加地點。
export const missingEvidence = (r: { evidence: Evidence[]; eligibility: string[]; address: string | null }) => {
  const required = ["價格", "份量", "時間", ...(r.eligibility.length ? ["資格"] : []), ...(r.address !== null ? ["地點"] : [])];
  return required.filter((f) => !r.evidence.some((e) => e.field === f));
};

// 同一個 field 兩筆摘錄 = 這個來源自己前後矛盾（§6.1）。不同來源不會出現在同一筆紀錄裡。
export const selfConflicting = (r: { evidence: Evidence[] }) =>
  r.evidence.some((e, i) => r.evidence.slice(i + 1).some((o) => o.field === e.field));

// §6 決策表：由上往下，第一個成立的就是答案。
export const dataStatusOf = (
  r: { price_total_twd: number | null; valid_until: string | null; verified_at: string | null; evidence: Evidence[]; eligibility: string[]; address: string | null },
  now = Date.now(),
): DataStatus => {
  if (r.price_total_twd === null) return "無法納入比較";
  if (selfConflicting(r)) return "衝突待確認";
  if (isExpired(r, now)) return "過期／待確認";
  if (r.verified_at === null || r.verified_at === "" || missingEvidence(r).length > 0) return "部分驗證／待確認";
  return "已驗證";
};
