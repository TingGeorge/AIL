import { generateStructured, geminiConfigured } from "./gemini.ts";
import { z } from "zod";
import type { Need } from "../shared/need.ts";
import { comparableTotal, TAGS, type Category, type Rec } from "../shared/records.ts";
import type { SearchWarning } from "../shared/search.ts";

export const RANK_TIMEOUT_MS = 30_000;

const rankingOutputSchema = z.strictObject({
  order: z.array(z.strictObject({
    id: z.string().min(1),
    reason: z.string().trim().min(1).max(300),
  })).max(500),
});

export type RankingOutput = z.infer<typeof rankingOutputSchema>;
export type RankingGeneratorInput = { system: string; prompt: string; signal: AbortSignal };
export type RankingGenerator = (input: RankingGeneratorInput) => Promise<unknown>;
export type RankingWarning = SearchWarning;
export type RankingResult =
  | { status: "done"; records: Rec[] }
  | { status: "failed"; records: Rec[]; error: string };

const SYSTEM = `你是「ALL in life」的推薦排序 Agent，只排序已由伺服器篩選過的候選紀錄，不上網搜尋。
規則：
- 必須輸出每個候選 id 恰好一次，不可新增、刪除或重複。
- 總可比成本是第一考量；使用者軟偏好是第二考量。若較貴項目排在較便宜項目前，理由必須明確說明取捨。
- reason 只寫一句繁體中文，使用輸入中可核對的事實；不得捏造價格、折扣、距離、資格、供應狀態或評分／分數。
- people_or_servings、date、time_window、eligibility_notes 目前只有文字可參考，不得宣稱已保證符合；必要時寫「待確認」。
- 免費只代表總可比成本為 0，不代表沒有資格、登記、押金或其他條件。
- 只輸出指定的結構化 JSON。`;

export const rankingConfigured = geminiConfigured;

const aiRankingGenerator: RankingGenerator = ({ system, prompt, signal }) => generateStructured({
  signal,
  schema: rankingOutputSchema,
  system,
  input: [{ type: "text", text: prompt }],
});

// 缺少結構化欄位時仍顯示候選，但一定把限制說明交給前端，不能假稱硬限制已保證。
export const constraintWarnings = (need: Need, records: Rec[], settingsExclude: string[] = []): RankingWarning[] => {
  const fields = [
    need.people_or_servings !== null ? "people_or_servings" : null,
    need.date !== null ? "date" : null,
    need.time_window !== null ? "time_window" : null,
    need.eligibility_notes !== null && need.eligibility_notes.trim() !== "" ? "eligibility_notes" : null,
  ].filter((field): field is string => field !== null);
  const warnings: RankingWarning[] = [];
  if (fields.length > 0) warnings.push({
    code: "text_constraints_not_filtered",
    fields,
    message: "人數／份量、日期、時段與資格目前只有文字資料，未作結構化硬限制篩選；請逐筆核對。",
  });
  if ((need.max_distance_km !== null || need.max_minutes !== null)
      && records.some((record) => record.distance_km === null || record.distance_km === undefined)) {
    warnings.push({
      code: "distance_not_evaluated",
      fields: ["max_distance_km", "max_minutes"].filter((field) =>
        field === "max_distance_km" ? need.max_distance_km !== null : need.max_minutes !== null),
      message: "部分候選缺少座標，未套用距離／步行時間硬限制；請核對地址。",
    });
  }
  const requestedExclusions = [...new Set(
    [...need.exclude_tags, ...settingsExclude].map((tag) => tag.trim()).filter((tag) => tag !== ""),
  )];
  if (requestedExclusions.length > 0) {
    const supported = new Set<string>(TAGS);
    const unrecognized = requestedExclusions.filter((tag) => !supported.has(tag));
    const hasMissingTags = records.some((record) => record.tags === null);
    if (unrecognized.length > 0 || hasMissingTags) {
      const details = [
        unrecognized.length > 0 ? `排除項目「${unrecognized.slice(0, 3).join("、")}」不在目前可辨識標籤內` : null,
        hasMissingTags ? "部分候選缺少成分標籤" : null,
      ].filter((detail): detail is string => detail !== null);
      warnings.push({
        code: "exclude_tags_not_guaranteed",
        fields: [need.exclude_tags.length > 0 ? "exclude_tags" : null, settingsExclude.length > 0 ? "exclude" : null]
          .filter((field): field is string => field !== null),
        message: `${details.join("；")}；無法保證已完整排除，請逐筆核對。`,
      });
    }
  }
  return warnings;
};

// 成本相同時以新確認優先，再以 id 收斂成完全 deterministic 的 fallback。
export const fallbackRank = (records: Rec[]): Rec[] => [...records]
  .sort((a, b) => {
    const cost = (comparableTotal(a) ?? Infinity) - (comparableTotal(b) ?? Infinity);
    return cost || b.verified_at.localeCompare(a.verified_at) || a.id.localeCompare(b.id);
  })
  .map((record) => ({ ...record, reason: null }));

const moneyFacts = (record: Rec, records: Rec[]) => {
  const facts = new Set<number>();
  const totals = records.map(comparableTotal).filter((n): n is number => n !== null);
  for (const value of [
    comparableTotal(record), record.price_total_twd, record.mandatory_fees_twd, record.discount_twd,
    ...totals,
  ]) if (value !== null) facts.add(Math.abs(value));
  for (const left of totals) for (const right of totals) facts.add(Math.abs(left - right));
  return facts;
};

const statedMoney = (reason: string) => {
  const out: number[] = [];
  const patterns = [/(?:NT\$|TWD|NTD)\s*([0-9][0-9,]*)/gi, /([0-9][0-9,]*)\s*元/g];
  for (const pattern of patterns) {
    for (const match of reason.matchAll(pattern)) out.push(Number(match[1]!.replaceAll(",", "")));
  }
  return out;
};

const deterministicReason = (record: Rec, records: Rec[], need: Need) => {
  const total = comparableTotal(record);
  if (total === null) return "總可比成本無法確認；請先核對價格與必要費用。";
  const totals = records.map(comparableTotal).filter((n): n is number => n !== null);
  const minimum = Math.min(...totals);
  if (total === minimum) return `總可比成本為 ${total} 元，是本組最低；仍請核對份量、時段與資格。`;
  const prefs = need.soft_preferences.filter((pref) => pref.trim() !== "");
  if (prefs.length > 0) {
    return `總可比成本為 ${total} 元（本組最低 ${minimum} 元）；排序另參考「${prefs.slice(0, 2).join("、")}」，請自行權衡成本差異。`;
  }
  return `總可比成本為 ${total} 元（本組最低 ${minimum} 元）；此順位不是最低成本順位，請以顯示成本自行判斷。`;
};

const safeReason = (record: Rec, records: Rec[], need: Need, reason: string, requiresTradeoff: boolean) => {
  const text = reason.replace(/\s+/g, " ").trim();
  const total = comparableTotal(record);
  const totals = records.map(comparableTotal).filter((n): n is number => n !== null);
  const minimum = totals.length > 0 ? Math.min(...totals) : null;
  const inventsScore = /評分|分數|得分|推薦指數|\bscore\b|\d+(?:\.\d+)?\s*(?:\/\s*(?:5|10|100)|顆星|星)|[一二三四五]星/i.test(text);
  const falseCheapest = /最便宜|最低成本|成本最低|價格最低|本組最低/.test(text) && total !== minimum;
  const falseFree = /免費|零元|(?:^|[^0-9])0\s*元/.test(text) && total !== 0;
  const falseConditionClaim = /(?:完全)?免費.{0,12}(?:無|沒有|免)(?:任何|其他)?(?:資格|登記|註冊|報名|押金|條件|限制)|(?:無需|不用|免)(?:登記|註冊|報名|押金)/.test(text)
    && (record.registration_required || record.eligibility.length > 0 || /押金|任何|其他|限制/.test(text));
  const facts = moneyFacts(record, records);
  const falseMoney = statedMoney(text).some((amount) => !facts.has(amount));
  const ownCostClaims = [
    ...text.matchAll(/(?:總可比成本|本(?:項|筆)?(?:價格|成本)|這(?:項|筆)?(?:價格|成本)|價格|成本|只要)\s*(?:為|是|約)?\s*(?:NT\$|TWD|NTD)\s*([0-9][0-9,]*)(?:\s*元)?/gi),
    ...text.matchAll(/(?:總可比成本|本(?:項|筆)?(?:價格|成本)|這(?:項|筆)?(?:價格|成本)|價格|成本|只要)\s*(?:為|是|約)?\s*([0-9][0-9,]*)\s*元/gi),
  ].map((match) => Number(match[1]!.replaceAll(",", "")));
  const falseOwnCost = ownCostClaims.some((amount) => amount !== total);
  const minimumClaims = [...text.matchAll(/本組最低\s*(?:為|是|約)?\s*([0-9][0-9,]*)\s*元/g)]
    .map((match) => Number(match[1]!.replaceAll(",", "")));
  const falseMinimum = minimumClaims.some((amount) => minimum === null || amount !== minimum);
  const qualifiedTextClaim = /待確認|需確認|請確認|仍須核對|仍需核對|未必|不保證|文字(?:顯示|標示)|資料(?:顯示|標示)/.test(text);
  const definitive = "(?:符合|滿足|適合|足夠|可供|剛好|足以|已達|可於|可在)";
  const peopleClaim = new RegExp(`${definitive}.{0,12}(?:\\d+\\s*人|人份|份量|人數)|(?:\\d+\\s*人|人份|份量|人數).{0,12}${definitive}`);
  const scheduleClaim = new RegExp(`${definitive}.{0,12}(?:日期|時段|時間|今天|今日|明天|明日|今晚|早上|上午|下午|晚上|週末)|(?:日期|時段|時間|今天|今日|明天|明日|今晚|早上|上午|下午|晚上|週末).{0,12}${definitive}`);
  const eligibilityClaim = /(?:符合|滿足|具備|具有|已通過).{0,12}(?:資格|條件|身分)|(?:資格|條件|身分).{0,12}(?:符合|滿足|具備|具有|已通過)/;
  const claimsTextConstraint = !qualifiedTextClaim && (
    (need.people_or_servings !== null && peopleClaim.test(text))
    || ((need.date !== null || need.time_window !== null) && scheduleClaim.test(text))
    || (need.eligibility_notes !== null && need.eligibility_notes.trim() !== "" && eligibilityClaim.test(text))
  );
  const acknowledgesTradeoff = /(?:較|比).{0,16}(?:貴|高|多)|成本差異|成本取捨|不是最低|非最低|本組最低/.test(text);
  if (text.length === 0 || text.length > 180 || inventsScore || falseCheapest || falseFree || falseConditionClaim
      || falseMoney || falseOwnCost || falseMinimum || claimsTextConstraint || (requiresTradeoff && !acknowledgesTradeoff)) {
    return deterministicReason(record, records, need);
  }
  return text;
};

// 結構正確不代表 id 正確：未知與重複 occurrence 丟掉，漏項以誠實成本順序補回。
export const sanitizeRanking = (records: Rec[], need: Need, output: RankingOutput): Rec[] => {
  const byId = new Map(records.map((record) => [record.id, record]));
  const seen = new Set<string>();
  const ranked: Rec[] = [];
  for (const item of output.order) {
    const record = byId.get(item.id);
    if (!record || seen.has(item.id)) continue;
    const total = comparableTotal(record);
    const requiresTradeoff = total !== null && records.some((candidate) =>
      !seen.has(candidate.id) && candidate.id !== item.id
      && comparableTotal(candidate) !== null && comparableTotal(candidate)! < total);
    seen.add(item.id);
    ranked.push({ ...record, reason: safeReason(record, records, need, item.reason, requiresTradeoff) });
  }
  for (const record of fallbackRank(records)) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    ranked.push(record);
  }
  return ranked;
};

class RankingTimeout extends Error {}
class RankingAborted extends Error {}

const generateWithDeadline = async (
  generate: RankingGenerator,
  input: Omit<RankingGeneratorInput, "signal">,
  timeoutMs: number,
  externalSignal?: AbortSignal,
) => {
  const controller = new AbortController();
  const abortFromRequest = () => controller.abort(externalSignal?.reason ?? new RankingAborted());
  if (externalSignal?.aborted) abortFromRequest();
  else externalSignal?.addEventListener("abort", abortFromRequest, { once: true });

  const timeoutError = new RankingTimeout();
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
  const aborted = new Promise<never>((_resolve, reject) => {
    if (controller.signal.aborted) reject(controller.signal.reason);
    else controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
  });
  // Promise.race attaches rejection handlers to both promises, so a provider that settles late cannot become unhandled.
  const generated = Promise.resolve().then(() => generate({ ...input, signal: controller.signal }));
  try {
    return await Promise.race([generated, aborted]);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromRequest);
  }
};

const failed = (records: Rec[], error: string): RankingResult => ({ status: "failed", records: fallbackRank(records), error });

export async function rankGroup(input: {
  agent: Rec["agent"];
  category: Category;
  records: Rec[];
  need: Need;
  generate?: RankingGenerator | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  onError?: (error: unknown) => void;
}): Promise<RankingResult> {
  const generate = input.generate === undefined ? (rankingConfigured() ? aiRankingGenerator : null) : input.generate;
  if (!generate) return failed(input.records, "LLM 未設定，已改依總可比成本排列");

  const prompt = JSON.stringify({
    agent: input.agent,
    category: input.category,
    need: {
      need: input.need.need,
      people_or_servings: input.need.people_or_servings,
      date: input.need.date,
      time_window: input.need.time_window,
      soft_preferences: input.need.soft_preferences,
      eligibility_notes: input.need.eligibility_notes,
    },
    candidates: input.records.map((record) => ({
      id: record.id,
      title: record.title,
      provider: record.provider,
      comparable_total_twd: comparableTotal(record),
      price_unit: record.price_unit,
      quantity_or_servings: record.quantity_or_servings,
      distance_km: record.distance_km ?? null,
      availability: record.availability_or_event_time,
      eligibility: record.eligibility,
      tags: record.tags,
    })),
  });

  try {
    const raw = await generateWithDeadline(generate, { system: SYSTEM, prompt }, input.timeoutMs ?? RANK_TIMEOUT_MS, input.signal);
    const parsed = rankingOutputSchema.safeParse(raw);
    if (!parsed.success) return failed(input.records, "推薦排序格式錯誤，已改依總可比成本排列");
    return { status: "done", records: sanitizeRanking(input.records, input.need, parsed.data) };
  } catch (error) {
    if (error instanceof RankingTimeout) return failed(input.records, "推薦排序逾時，已改依總可比成本排列");
    if (input.signal?.aborted || error instanceof RankingAborted) return failed(input.records, "搜尋已取消");
    input.onError?.(error);
    return failed(input.records, "推薦排序失敗，已改依總可比成本排列");
  }
}
