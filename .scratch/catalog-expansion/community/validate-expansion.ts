import { readFileSync } from "node:fs";
import { prepareCandidate } from "../../../prototype-v1/src/shared/ingestion.ts";
import { assessCatalog, truthfullyVerified } from "../../../prototype-v1/src/shared/catalog-quality.ts";
import type { Rec } from "../../../prototype-v1/src/shared/records.ts";

const now = Date.now();
const base = JSON.parse(readFileSync("prototype-v1/data/live/免費公益資源.json", "utf8"));
const expansionRaw = JSON.parse(readFileSync("prototype-v1/data/live/免費公益資源-expansion.json", "utf8"));
if (expansionRaw.length !== 14) throw new Error(`expansion count ${expansionRaw.length}`);
const expansion = expansionRaw.map((record: unknown) => prepareCandidate(record, { now })) as Rec[];
const combined = [...base.map((record: unknown) => prepareCandidate(record, { now })), ...expansion] as Rec[];
const ids = new Set(combined.map(record => record.id));
if (combined.length !== 21 || ids.size !== 21) throw new Error(`combined=${combined.length}, unique=${ids.size}`);
const report = assessCatalog(combined, ["免費／公益資源"], now);
console.log(JSON.stringify({
  expansion: expansion.length,
  expansion_verified: expansion.filter(record => truthfullyVerified(record, now)).length,
  combined: combined.length,
  combined_verified: combined.filter(record => truthfullyVerified(record, now)).length,
  ids_unique: ids.size === combined.length,
  report,
}, null, 2));
