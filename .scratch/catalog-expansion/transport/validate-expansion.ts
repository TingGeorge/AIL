import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepareCandidate } from "../../../prototype-v1/src/shared/ingestion.ts";
import { assessCatalog } from "../../../prototype-v1/src/shared/catalog-quality.ts";

const root = resolve(import.meta.dir, "../../..");
const existingPath = resolve(root, "prototype-v1/data/live/交通.json");
const expansionPath = resolve(root, "prototype-v1/data/live/交通-expansion.json");
const existing = JSON.parse(readFileSync(existingPath, "utf8"));
const expansion = JSON.parse(readFileSync(expansionPath, "utf8"));
const now = Date.now();

if (!Array.isArray(existing) || existing.length !== 8) throw new Error(`既有交通應為8筆，實際${existing?.length}`);
if (!Array.isArray(expansion) || expansion.length !== 16) throw new Error(`新增交通應為16筆，實際${expansion?.length}`);

const preparedExisting = existing.map((raw: unknown) => prepareCandidate(raw, { now }));
const preparedExpansion = expansion.map((raw: unknown) => prepareCandidate(raw, { now }));
const ids = [...preparedExisting, ...preparedExpansion].map(record => record.id);
if (new Set(ids).size !== ids.length) throw new Error("交通資料有重複ID");
for (const record of preparedExpansion) {
  if (record.extra.research_batch !== "expansion-2026-09-05") {
    throw new Error(`${record.id}: research_batch不正確`);
  }
}

const report = assessCatalog([...preparedExisting, ...preparedExpansion], ["交通"], now);
const transport = report.categories[0];
if (report.total !== 24) throw new Error(`交通合計應為24筆，實際${report.total}`);
if (transport.total !== 24 || transport.rankable !== 24 || transport.pending !== 0) {
  throw new Error(`交通品質數量不符：${JSON.stringify(transport)}`);
}
if (report.issues.length !== 0) throw new Error(`品質問題：${report.issues.join("；")}`);

console.log(JSON.stringify({
  existing: preparedExisting.length,
  added: preparedExpansion.length,
  new_verified: preparedExpansion.filter(record => record.data_status === "已驗證").length,
  new_group_offers: preparedExpansion.filter(record => record.group_offer !== null).map(record => record.id),
  total: report.total,
  rankable: transport.rankable,
  pending: transport.pending,
  issues: report.issues,
  ready: report.ready,
}, null, 2));
