// Reproducible inventory of the curated snapshot; not an automated fact-check or a crawler.
import { resolve, join } from "node:path";
import { readCatalog, defaultDataDirectory } from "./catalog-files.ts";
import { assessCatalog } from "../src/shared/catalog-quality.ts";
import { rowToRec } from "../src/shared/records.ts";

try {
  const batch = await readCatalog(defaultDataDirectory,false);
  const records = batch.records.map(rowToRec);
  const sourceIndex = new Map<string,Set<string>>();
  for (const record of records) {
    const coordinates = record.extra.source_coordinates as {url?:string}|null|undefined;
    const urls = [record.source_url,...record.evidence.map(evidence=>evidence.url),...(coordinates?.url ? [coordinates.url] : [])];
    for (const url of urls) {
      const ids = sourceIndex.get(url) ?? new Set<string>();
      ids.add(record.id);sourceIndex.set(url,ids);
    }
  }
  const timestamps = records.map(record=>record.verified_at).filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const reviewedAt = timestamps.at(-1) ?? null;
  const assessmentClock = Date.now();
  const assessedAt = new Date(assessmentClock).toISOString();
  const files = await Promise.all(batch.files.map(async file=>({file:`prototype-v1/data/live/${file}`,sha256:new Bun.CryptoHasher("sha256").update(await Bun.file(join(batch.directory,file)).arrayBuffer()).digest("hex")})));
  const output = {
    manifest_version:1,
    description:"Curated first-party web evidence snapshot. Hashes confirm file identity, not factual accuracy or current stock. reviewed_at is the latest non-null candidate verified_at metadata; assessed_at is the current clock used for expiration and readiness assessment. Re-run source research to refresh facts.",
    batches:[...new Set(records.map(record=>record.extra.research_batch))].sort(),
    reviewed_at:reviewedAt,
    assessed_at:assessedAt,
    assessment:assessCatalog(records,undefined,assessmentClock),
    coordinate_count:records.filter(record=>record.lat!==null && record.lng!==null).length,
    baseline_count:records.filter(record=>record.baseline!==null).length,
    files,
    sources:[...sourceIndex.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([url,ids])=>({url,candidate_ids:[...ids].sort()})),
  };
  const path = resolve(Bun.fileURLToPath(new URL("../../docs/research/catalog-manifest.json",import.meta.url)));
  await Bun.write(path,JSON.stringify(output,null,2)+"\n");
  console.log(`來源清冊已產生：${records.length} 筆、${sourceIndex.size} 個來源 URL、${output.coordinate_count} 筆有來源座標。`);
} catch(error) { console.error(error instanceof Error ? error.message : "清冊產生失敗");process.exitCode=1; }
