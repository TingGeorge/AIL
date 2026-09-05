import type { Need } from "./need.ts";
import type { Rec } from "./records.ts";

export type ConstraintKey = "exclude" | "people" | "date" | "time" | "eligibility";
export type ConstraintMatch = { incompatible: ConstraintKey[]; unknown: ConstraintKey[] };
export const constraintLabels: Record<ConstraintKey, string> = {exclude:"成分／排除項目",people:"人數／份量",date:"日期",time:"供應時段",eligibility:"使用資格"};

// Only explicit positive evidence proves presence. Missing labels NEVER prove absence.
const ingredientPresence: Record<string, RegExp> = {
  牛: /牛肉|牛排|牛腩|牛肋|牛筋|牛舌/,
  豬: /豬肉|豬排|豬腳|豬肋|培根/,
  雞: /雞肉|雞腿|雞排|雞塊/,
  海鮮: /海鮮|魚|蝦|蟹|貝|牡蠣|章魚|魷魚/,
  辣: /辣/, 含酒精: /含酒精/,
};
type Window = [number, number];
const minutes = (h: string, m: string) => Number(h) * 60 + Number(m);
function windowOf(text: string, request = false): Window | null {
  const range = text.match(/(\d{1,2}):(\d{2})\s*[-–—~～至]\s*(\d{1,2}):(\d{2})/);
  if (range) {
    const from = minutes(range[1]!, range[2]!), to = minutes(range[3]!, range[4]!);
    return from < 1440 && to <= 1440 && Number(range[2]) < 60 && Number(range[4]) < 60 ? [from, to] : null;
  }
  if (/全天供應|全天開放|^24小時$|^24H$/i.test(text.trim())) return [0, 1440];
  if (request) {
    if (/晚餐|晚飯|晚饭|傍晚|晚上/.test(text)) return [17*60, 21*60];
    if (/午餐|午飯|午饭|中午/.test(text)) return [11*60, 14*60];
    if (/早餐|早飯|早饭|早上/.test(text)) return [5*60, 11*60];
    const at = text.match(/^(\d{1,2}):(\d{2})$/);
    if (at && Number(at[1]) < 24 && Number(at[2]) < 60) return [minutes(at[1]!,at[2]!),minutes(at[1]!,at[2]!)+1];
  }
  return null;
}
const splitWindow = ([start, end]: Window): Window[] => end < start ? [[start,1440],[0,end]] : [[start,end]];
const overlaps = (a: Window, b: Window) => splitWindow(a).some(x => splitWindow(b).some(y => x[0] < y[1] && y[0] < x[1]));

export function matchConstraints(r: Rec, n: Need, exclusions: string[]): ConstraintMatch {
  const incompatible: ConstraintKey[] = [], unknown: ConstraintKey[] = [];
  if (r.category === "食品") {
    for (const tag of new Set([...exclusions, ...n.exclude_tags])) {
      if (r.tags?.includes(tag) || ingredientPresence[tag]?.test(r.title)) incompatible.push("exclude");
      else unknown.push("exclude");
    }
  } else if (r.tags?.some(tag => exclusions.includes(tag) || n.exclude_tags.includes(tag))) incompatible.push("exclude");
  if (n.people_or_servings !== null && ["食品", "活動", "交通"].includes(r.category)) {
    const quantity = r.quantity_or_servings ?? "";
    let servings: number | null = null;
    if (r.category === "食品") {
      const count = quantity.match(/^(\d+)(?:人份|份|個)/);
      if (count && /每人各1|人份|份/.test(quantity)) servings = Number(count[1]);
    } else if (/每張限一人|單程1人次|每人1張|一車/.test(quantity)) servings = 1;
    if (servings === null) unknown.push("people");
    else if (servings < n.people_or_servings) incompatible.push("people");
  }
  if (n.date) {
    const availability = r.availability_or_event_time ?? "";
    const dated = availability.match(/^(\d{4}-\d{2}-\d{2})(?:至(\d{4}-\d{2}-\d{2}))?(?:[， ,]|$)/);
    if (dated && !/查核|庫存|更新/.test(availability)) {
      if (n.date < dated[1]! || n.date > (dated[2] ?? dated[1]!)) incompatible.push("date");
    } else if (/週二至週日/.test(availability) && !/假日|寒暑假|連假|節/.test(availability)) {
      if (new Date(`${n.date}T12:00:00Z`).getUTCDay() === 1) incompatible.push("date");
    } else unknown.push("date");
  }
  const requirements = r.eligibility.filter(value => !/^一般民眾；本筆不套用|^適用全票者；本筆不套用/.test(value));
  // Free text about a user's qualifications is not proof that all provider requirements hold.
  if (requirements.some(value => value !== "Costco 會員") || n.eligibility_notes?.trim()) unknown.push("eligibility");
  const requestedTime = n.time_window || (r.category === "食品" && /晚餐|午餐|早餐/.test(n.need) ? n.need : null);
  if (requestedTime) {
    const requested = windowOf(requestedTime, true);
    // Product supply window precedes store hours. Complex multiple/seasonal windows are unknown.
    const supply = (r.availability_or_event_time ?? "").split(/[；;]/)[0]!;
    const available = /國定假日|寒暑假|週六.*週日|售票至/.test(supply) ? null : windowOf(supply);
    if (!requested || !available) unknown.push("time");
    else if (!overlaps(requested, available)) incompatible.push("time");
  }
  return { incompatible: [...new Set(incompatible)], unknown: [...new Set(unknown)] };
}
