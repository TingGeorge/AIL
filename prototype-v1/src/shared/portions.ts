import type { Rec } from "./records.ts";

export type PortionRange = { min: number; max: number };
// Search-only metadata, never persisted as a claim about the catalog record.
export type PortionMatch = { requested: number; min: number | null; max: number | null };

const numeral = "(?:\\d+|[一二兩三四五六七八九十百]+)";
const digits: Record<string, number> = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function numberOf(text: string): number | null {
  let value: number;
  if (/^\d+$/.test(text)) value = Number(text);
  else if (text === "一百" || text === "百") value = 100;
  else if (text.includes("十")) {
    const parts = text.split("十");
    if (parts.length !== 2 || parts.some(part => part.length > 1)) return null;
    value = (parts[0] ? digits[parts[0]] ?? NaN : 1) * 10 + (parts[1] ? digits[parts[1]] ?? NaN : 0);
  } else value = digits[text] ?? NaN;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// Only explicit serving/person units count. Pieces, weight, meal names and
// "single item" do not prove how many people they feed. Never multiply a price.
export function foodPortionRange(quantity: string | null): PortionRange | null {
  const text = quantity?.normalize("NFKC").trim() ?? "";
  const unit = "(?:人份|份|人(?:套餐|餐))";
  // Inspect all explicit portion labels, not just the leading count. A package
  // labelled "1份套餐（6人份）" must not bypass the requested maximum of five.
  const explicit = new RegExp(`(?<![\\d.一二兩三四五六七八九十百])(${numeral})\\s*(?:${unit})?\\s*[-–—~～至]\\s*(${numeral})\\s*${unit}|(?<![\\d.一二兩三四五六七八九十百])(${numeral})\\s*${unit}`, "g");
  const ranges: PortionRange[] = [];
  for (const match of text.matchAll(explicit)) {
    const min = numberOf(match[1] ?? match[3]!);
    const max = numberOf(match[2] ?? match[3]!);
    if (min === null || max === null || min > max) return null;
    ranges.push({ min, max });
  }
  if (ranges.length) return {
    min: Math.min(...ranges.map(range => range.min)),
    max: Math.max(...ranges.map(range => range.max)),
  };
  // Explicit per-person allocation makes item counts usable as portion counts.
  const allocated = /每人(?:各)?\s*(?:1|一)\s*個/.test(text)
    ? text.match(new RegExp(`^(${numeral})\\s*個`)) : null;
  const named = /^(?:單人(?:份|餐|套餐)|單份)(?:$|[；;，,\s])/.test(text) ? 1
    : /^(?:雙人(?:份|餐|套餐))(?:$|[；;，,\s])/.test(text) ? 2 : null;
  const value = allocated ? numberOf(allocated[1]!) : named;
  return value === null ? null : { min: value, max: value };
}

export function foodPortionMatch(record: Rec, requested: number | null): PortionMatch | undefined {
  if (record.category !== "食品" || requested === null) return undefined;
  const range = foodPortionRange(record.quantity_or_servings);
  return { requested, min: range?.min ?? null, max: range?.max ?? null };
}

export const oversizedPortion = (match: PortionMatch | undefined) =>
  match?.max !== null && match?.max !== undefined && match.max > match.requested;

// Used only by recommendation order. Explicit cost/distance/date sorting remains
// honest to the chosen control. Unknown portions stay after known portions.
export function portionOrder(a: Rec, b: Rec): number {
  const gap = (record: Rec) => !record.portion_match ? 0
    : record.portion_match.max === null ? Infinity
    : Math.max(0, record.portion_match.requested - record.portion_match.max);
  const width = (record: Rec) => record.portion_match?.min != null && record.portion_match.max != null
    ? record.portion_match.max - record.portion_match.min : 0;
  return gap(a) - gap(b) || width(a) - width(b);
}

export function portionSummary(record: Rec): string | null {
  const match = record.portion_match;
  if (!match || match.min === null || match.max === null) return null;
  const quantity = match.min === match.max ? `${match.max}` : `${match.min}～${match.max}`;
  const context = `標示 ${quantity} 份／需求 ${match.requested} 人或份`;
  if (oversizedPortion(match)) return `${context}：超過本次份量上限`;
  if (match.min === match.requested) return `${context}：標示數量相同，食量仍需自行評估`;
  return `${context}：較小份量選項，不代表足夠全員食用`;
}
