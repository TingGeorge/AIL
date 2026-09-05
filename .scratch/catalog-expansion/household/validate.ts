import { assessCatalog } from "../../../prototype-v1/src/shared/catalog-quality.ts";
import { prepareCandidate } from "../../../prototype-v1/src/shared/ingestion.ts";
import type { Rec } from "../../../prototype-v1/src/shared/records.ts";

const root = new URL("../../../", import.meta.url);
const expansionPath = new URL("prototype-v1/data/live/日用品-expansion.json", root);
const existingPath = new URL("prototype-v1/data/live/日用品.json", root);
const now = Date.now();

const load = async (url: URL): Promise<unknown[]> => {
  const raw = await Bun.file(url).json();
  if (!Array.isArray(raw)) throw new Error(`${url.pathname} 必須是 JSON 陣列`);
  return raw;
};

const toRec = (raw: unknown): Rec => ({
  ...prepareCandidate(raw, { now }),
  distance_km: null,
  reason: null,
});

const expansionRaw = await load(expansionPath);
const existingRaw = await load(existingPath);
const expansion = expansionRaw.map(toRec);
const existing = existingRaw.map(toRec);
const merged = [...existing, ...expansion];

const fail = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

fail(expansion.length === 14, `擴充資料必須恰好14筆，實際${expansion.length}筆`);
fail(existing.length === 7, `既有日用品應為7筆，實際${existing.length}筆`);
fail(merged.length === 21, `合併後應為21筆，實際${merged.length}筆`);
fail(new Set(merged.map(record => record.id)).size === merged.length, "既有與擴充資料出現重複 id");
fail(new Set(expansion.map(record => record.source_url)).size === expansion.length, "擴充資料出現重複商品來源 URL");
fail(expansion.every(record => record.category === "日用品"), "擴充資料含非日用品類別");
fail(expansion.every(record => record.extra.research_batch === "expansion-2026-09-05"), "research_batch 不一致");
fail(expansion.every(record => !existing.some(old => old.source_url === record.source_url)), "擴充資料與既有資料出現相同 SKU URL");
fail(expansion.every(record => new Set(record.evidence.map(item => item.field)).size === record.evidence.length), "同筆 evidence field 不唯一");
fail(expansion.every(record => record.evidence.every(item => item.url === record.source_url)), "evidence URL 與候選 source_url 不一致");
fail(expansion.every(record => record.evidence.some(item => item.field === "價格")
  && record.evidence.some(item => item.field === "份量")
  && record.evidence.some(item => item.field === "時間")), "缺少價格／份量／時間證據");
fail(expansion.every(record => record.evidence.every(item => !/[；;]/.test(item.quote))), "evidence quote 疑似拼接多段原文");
fail(expansion.every(record => record.evidence.every(item => !/(商品售價|本候選|比較採|不使用頁面|查核時)/.test(item.quote))), "evidence quote 含資料整理或改寫語句");
fail(expansion.every(record => {
  const fulfillment = record.extra.fulfillment_evidence;
  if (typeof fulfillment !== "object" || fulfillment === null || Array.isArray(fulfillment)) return false;
  const value = fulfillment as Record<string, unknown>;
  return value.mandatory_fee_twd === record.mandatory_fees_twd
    && value.url === record.source_url
    && typeof value.quote === "string"
    && value.quote.length > 0;
}), "履約費與配送證據不一致");
fail(expansion.every(record => record.address === null && record.lat === null && record.lng === null), "線上候選不應填實體地址或座標");

const expansionAssessment = assessCatalog(expansion, ["日用品"], now);
const mergedAssessment = assessCatalog(merged, ["日用品"], now);
const expansionCategory = expansionAssessment.categories[0];
const mergedCategory = mergedAssessment.categories[0];

fail(expansionAssessment.issues.length === 0, `擴充資料品質問題：${expansionAssessment.issues.join("；")}`);
fail(expansionCategory.total === 14, `擴充 total 應為14，實際${expansionCategory.total}`);
fail(expansionCategory.rankable === 14, `擴充 rankable 應為14，實際${expansionCategory.rankable}`);
fail(mergedAssessment.issues.length === 0, `合併資料品質問題：${mergedAssessment.issues.join("；")}`);
fail(mergedCategory.total === 21, `合併 total 應為21，實際${mergedCategory.total}`);
fail(mergedCategory.rankable === 21, `合併 rankable 應為21，實際${mergedCategory.rankable}`);

console.log(JSON.stringify({
  prepareCandidate: { expansion_valid: expansion.length, existing_valid: existing.length },
  expansion: expansionAssessment,
  merged: mergedAssessment,
}, null, 2));
