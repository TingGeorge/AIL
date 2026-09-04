// Candidate record (PRD §9.1) as the client renders it, plus the comparison rules of §9.3,
// and the session-local community objects (profile, settings, reports, teams).
import type { Need } from "../shared/need.ts";
import { CATEGORIES } from "../shared/need.ts";

export type Category = (typeof CATEGORIES)[number];
export type DataStatus = "已驗證" | "部分驗證／待確認" | "過期／待確認" | "衝突待確認" | "無法納入比較";

export const TAGS = ["牛", "豬", "雞", "海鮮", "辣", "素", "含酒精"] as const;
export const PREFS = ["可外帶", "素食優先", "不排隊", "有座位", "近捷運", "營業到晚"] as const;
export const DOT_COLORS = ["#3b7bff", "#ff4b3e", "#ffe14d", "#e4ff1a", "#7cf2c4", "#c48bff"] as const;

export type GroupOffer = { min_people: number; discount_pct?: number; price_per_person?: number; note: string };

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
  source_url: string;
  source_type: "curated" | "web-searched";
  source_authority: "official" | "provider" | "public" | "other";
  evidence_quote: string;
  collected_at: string;
  verified_at: string;
  data_status: DataStatus;
  agent: "paid" | "free";
  action_label: string;
  baseline: { name: string; total_twd: number; basis: string; as_of: string } | null;
  tags: string[] | null; // null = 成分未標示
  group_offer: GroupOffer | null;
};

export type Profile = { nickname: string; color: string };
export type Settings = { monthly_budget: number | null; spent: number; survival: boolean; exclude: string[]; prefs: string[] };
export const EXPERIENCE_REASONS = ["食安", "過敏", "身體不適"] as const;
export const DATA_REASONS = ["價格過期", "條件錯誤", "來源失效", "分類錯誤"] as const;
export type Report = { id: string; rec_id: string; reason: string; note: string; at: string; by: string };
export type Team = { rec_id: string; code: string; members: { name: string; color: string }[] };

export const isExperience = (r: Report) => (EXPERIENCE_REASONS as readonly string[]).includes(r.reason);
export const recentExperience = (reports: Report[], recId: string, now = Date.now()) =>
  reports.filter((r) => r.rec_id === recId && isExperience(r) && now - Date.parse(r.at) < 30 * 86_400_000);

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

export const passesGate = (r: Rec) => r.data_status === "已驗證" && comparableTotal(r) !== null;

// Hard constraints first (PRD FR-04). ponytail: budget, free_only and exclusions are machine-checkable
// on this record shape; distance/time stay as source text and are shown, not filtered.
export const passesHard = (r: Rec, n: Need, exclude: string[]) => {
  const total = comparableTotal(r);
  if (n.free_only && total !== 0) return false;
  if (n.budget_total_twd !== null && total !== null && total > n.budget_total_twd) return false;
  if (r.tags && exclude.some((t) => r.tags!.includes(t))) return false;
  return true;
};

export type Bucket = { main: Rec[]; pending: Rec[]; excluded: Rec[] };

// 先套硬限制，再依總可比成本由低至高排序；同價依資料新鮮度。生存模式：免費永遠在前。
export const bucket = (recs: Rec[], n: Need, exclude: string[], survival: boolean): Bucket => {
  const out: Bucket = { main: [], pending: [], excluded: [] };
  for (const r of recs) {
    if (!passesGate(r)) out.pending.push(r);
    else if (!passesHard(r, n, exclude)) out.excluded.push(r);
    else out.main.push(r);
  }
  out.main.sort((a, b) => {
    const ta = comparableTotal(a)!, tb = comparableTotal(b)!;
    if (survival && (ta === 0) !== (tb === 0)) return ta === 0 ? -1 : 1;
    return ta - tb || b.verified_at.localeCompare(a.verified_at);
  });
  return out;
};

export const statusPip = (s: DataStatus) => (s === "已驗證" ? "yellow" : s === "過期／待確認" || s === "衝突待確認" ? "red" : "blue");
export const money = (n: number) => (n === 0 ? "FREE" : `NT$${n.toLocaleString("zh-TW")}`);
export const joinCode = (id: string) => `AIL-${id.toUpperCase()}${(id.length * 7) % 10}${(id.charCodeAt(0) * 3) % 10}`;
