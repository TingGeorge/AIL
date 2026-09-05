import { readFile } from "node:fs/promises";
import { prepareCandidate } from "../../../prototype-v1/src/shared/ingestion.ts";
import { assessCatalog, truthfullyVerified } from "../../../prototype-v1/src/shared/catalog-quality.ts";

const root = new URL("../../../", import.meta.url);
const read = async (path: string) => readFile(new URL(path, root), "utf8");
const raw = JSON.parse(await read("prototype-v1/data/live/食品-expansion.json"));
const existing = JSON.parse(await read("prototype-v1/data/live/食品.json"));
const now = Date.now();

const snapshots = {
  ikeaMenu: await read(".scratch/catalog-expansion/food/ikea-restaurant-clean.txt"),
  ikeaNeihu: await read(".scratch/catalog-expansion/food/ikea-neihu-index-clean.txt"),
  kfcMenu: await read(".scratch/catalog-expansion/food/kfc-menu-browser-body.txt"),
  kfcFaq: await read(".scratch/catalog-expansion/food/kfc-faq-clean.txt"),
  mcd20260831: await read(".scratch/catalog-expansion/food/mcdonalds-20260831-browser-body.txt"),
  mcd20260519: await read(".scratch/catalog-expansion/food/mcdonalds-20260519-browser-body.txt"),
};

const sourceFor = async (record: any, evidence: any) => {
  switch (evidence.url) {
    case "https://www.ikea.com.tw/zh/ikea-food/restaurant": return snapshots.ikeaMenu;
    case "https://www.ikea.com.tw/zh/store/nei-hu/index": return snapshots.ikeaNeihu;
    case "https://www.kfcclub.com.tw/menu?menuId=2": return snapshots.kfcMenu;
    case "https://olo.kfcclub.com.tw/customerService/FAQ": return snapshots.kfcFaq;
    case "https://www.mcdonalds.com/tw/zh-tw/newsroom/2026/20260831.html": return snapshots.mcd20260831;
    case "https://www.mcdonalds.com/tw/zh-tw/newsroom/2026/20260519.html": return snapshots.mcd20260519;
    case "https://olo-api.kfcclub.com.tw/menu/v1/GetQueryFood": {
      const path = record.extra?.api_snapshot;
      if (typeof path !== "string") throw new Error(`${record.id}: missing api_snapshot`);
      return read(path);
    }
    default: throw new Error(`${record.id}: no snapshot mapping for ${evidence.url}`);
  }
};

const quoteIssues: string[] = [];
for (const record of raw) {
  for (const evidence of record.evidence) {
    const source = await sourceFor(record, evidence);
    if (!source.includes(evidence.quote)) quoteIssues.push(`${record.id}/${evidence.field}: exact quote not found: ${JSON.stringify(evidence.quote)}`);
    if (/官網價格\s*[×x*]|無服務費|零附加費|供應交集/.test(evidence.quote)) quoteIssues.push(`${record.id}/${evidence.field}: derived wording leaked into quote`);
  }
}

const prepared = raw.map((record: unknown) => prepareCandidate(record, { now }));
const report = assessCatalog(prepared, ["食品"], now);
const existingIds = new Set(existing.map((record: any) => record.id));
const overlap = prepared.filter((record) => existingIds.has(record.id)).map((record) => record.id);
const providerTitle = prepared.map((record) => `${record.provider}::${record.title}`);
const duplicateProviderTitles = providerTitle.filter((value, index) => providerTitle.indexOf(value) !== index);
const grouped = Object.fromEntries([...new Set(prepared.map((record) => record.provider))].map((provider) => [provider, prepared.filter((record) => record.provider === provider).length]));
const result = {
  count: prepared.length,
  truthfullyVerified: prepared.filter((record) => truthfullyVerified(record, now)).length,
  quoteIssues,
  catalogIssues: report.issues,
  overlap,
  duplicateProviderTitles,
  nonNullGroupOffers: prepared.filter((record) => record.group_offer !== null).map((record) => record.id),
  providers: grouped,
  assessment: report,
};
console.log(JSON.stringify(result, null, 2));
if (prepared.length !== 36 || result.truthfullyVerified !== 36 || quoteIssues.length || report.issues.length || overlap.length || duplicateProviderTitles.length || result.nonNullGroupOffers.length) process.exit(1);
