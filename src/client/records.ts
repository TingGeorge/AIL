// Candidate record (PRD §9.1) as the client renders it, plus the comparison rules of §9.3.
import type { Need } from "../shared/need.ts";
import { CATEGORIES } from "../shared/need.ts";

export type Category = (typeof CATEGORIES)[number];
export type DataStatus = "已驗證" | "部分驗證／待確認" | "過期／待確認" | "衝突待確認" | "無法納入比較";

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
};

// 總可比成本 = 價格 + 必要費用 − 明確適用折扣；未知價格不視為 0。
export const comparableTotal = (r: Rec) =>
  r.price_total_twd === null ? null : r.price_total_twd + r.mandatory_fees_twd - r.discount_twd;

export const saving = (r: Rec) => {
  const total = comparableTotal(r);
  if (total === null || !r.baseline || r.data_status !== "已驗證") return null;
  const amount = r.baseline.total_twd - total;
  return { amount, pct: Math.round((amount / r.baseline.total_twd) * 100) };
};

export const passesGate = (r: Rec) => r.data_status === "已驗證" && comparableTotal(r) !== null;

// Hard constraints first (PRD FR-04). ponytail: only budget and free_only are machine-checkable
// on this record shape; distance/time stay as source text and are shown, not filtered.
export const passesHard = (r: Rec, n: Need) => {
  const total = comparableTotal(r);
  if (n.free_only && total !== 0) return false;
  if (n.budget_total_twd !== null && total !== null && total > n.budget_total_twd) return false;
  return true;
};

export type Bucket = { main: Rec[]; pending: Rec[]; excluded: Rec[] };

// 先套硬限制，再依總可比成本由低至高排序；同價依資料新鮮度。
export const bucket = (recs: Rec[], n: Need): Bucket => {
  const out: Bucket = { main: [], pending: [], excluded: [] };
  for (const r of recs) {
    if (!passesGate(r)) out.pending.push(r);
    else if (!passesHard(r, n)) out.excluded.push(r);
    else out.main.push(r);
  }
  out.main.sort((a, b) => (comparableTotal(a)! - comparableTotal(b)!) || b.verified_at.localeCompare(a.verified_at));
  return out;
};

export const statusPip = (s: DataStatus) => (s === "已驗證" ? "yellow" : s === "過期／待確認" || s === "衝突待確認" ? "red" : "blue");
export const money = (n: number) => (n === 0 ? "FREE" : `NT$${n.toLocaleString("zh-TW")}`);
