import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepareCandidate } from "../../../prototype-v1/src/shared/ingestion.ts";
import { assessCatalog } from "../../../prototype-v1/src/shared/catalog-quality.ts";

const root = resolve(import.meta.dir, "../../..");
const existing = JSON.parse(readFileSync(resolve(root, "prototype-v1/data/live/活動.json"), "utf8"));
const expansion = JSON.parse(readFileSync(resolve(root, "prototype-v1/data/live/活動-expansion.json"), "utf8"));
const now = Date.now();
if (!Array.isArray(existing) || existing.length !== 10) throw new Error(`既有活動應為10筆，實際${existing?.length}`);
if (!Array.isArray(expansion) || expansion.length !== 20) throw new Error(`新增活動應為20筆，實際${expansion?.length}`);
const preparedExisting = existing.map((raw: unknown) => prepareCandidate(raw, { now }));
const preparedExpansion = expansion.map((raw: unknown) => prepareCandidate(raw, { now }));
const ids = [...preparedExisting, ...preparedExpansion].map(record => record.id);
if (new Set(ids).size !== ids.length) throw new Error("活動資料有重複ID");
for (const record of preparedExpansion) {
  if (record.extra.research_batch !== "expansion-2026-09-05") throw new Error(`${record.id}: research_batch不正確`);
  const fields = record.evidence.map(item => item.field);
  for (const required of ["價格", "份量", "時間"]) {
    if (fields.filter(field => field === required).length !== 1) throw new Error(`${record.id}: ${required} evidence 必須恰好一筆`);
  }
}
const grouped = preparedExpansion.filter(record => record.group_offer !== null);
if (grouped.length !== 6) throw new Error(`團體優惠應為6筆，實際${grouped.length}`);
for (const record of grouped) {
  const offer = record.group_offer!;
  if (offer.min_people < 2 || offer.redeem_code !== null || (offer.price_per_person === undefined && offer.discount_pct === undefined)) {
    throw new Error(`${record.id}: group_offer格式不完整`);
  }
  const terms = record.extra.group_offer_terms as Record<string, unknown> | undefined;
  const evidence = record.extra.group_offer_evidence as unknown[] | undefined;
  if (!terms || typeof terms.redemption_method !== "string" || !("valid_until" in terms) || !Array.isArray(evidence) || evidence.length === 0) {
    throw new Error(`${record.id}: group_offer輔助證據不完整`);
  }
}
const moca = preparedExpansion.find(record => record.id === "a_moca");
if (!moca || moca.data_status !== "部分驗證／待確認" || moca.group_offer !== null) throw new Error("a_moca必須維持未開展待確認且無團體優惠");
const offerById = Object.fromEntries(grouped.map(record => [record.id, record]));
if (offerById.a_kids?.group_offer?.min_people !== 30 || offerById.a_kids?.extra.group_offer_terms?.alternative_offer === undefined || !JSON.stringify(offerById.a_kids?.extra.group_offer_evidence).includes("免費入園")) throw new Error("a_kids須為現行30人7折並以逐字證據記錄平常日預約免費替代規則");
if (offerById.a_ntm1?.group_offer?.min_people !== 20 || !String(offerById.a_ntm1.group_offer.note).includes("機關、學校")) throw new Error("a_ntm1資格須限機關學校20人");
if (String(offerById.a_nmh1?.group_offer?.note).match(/同日同時間|隨團人員.*免費/)) throw new Error("a_nmh1不得保留未證實限制或免費名額");
if (!String(offerById.a_t101?.group_offer?.note).includes("外籍團體") || String(offerById.a_t101?.group_offer?.note).match(/3日前|三日前|現場不受理/)) throw new Error("a_t101須保守限外籍20人且不得混入校外教學期限");
const report = assessCatalog([...preparedExisting, ...preparedExpansion], ["活動"], now);
const activity = report.categories[0];
if (report.total !== 29 || report.ignored !== 1) throw new Error(`公開/封存數量不符：${JSON.stringify(report)}`);
if (activity.total !== 29 || activity.rankable !== 26 || activity.pending !== 3) throw new Error(`活動品質數量不符：${JSON.stringify(activity)}`);
if (report.issues.length !== 0) throw new Error(`品質問題：${report.issues.join("；")}`);
console.log(JSON.stringify({ existing: preparedExisting.length, added: preparedExpansion.length, rawTotal: existing.length + expansion.length, publicTotal: report.total, ignored: report.ignored, rankable: activity.rankable, pending: activity.pending, issues: report.issues, ready: report.ready }, null, 2));
