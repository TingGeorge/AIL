// 匯入驗收檢查（SPEC-ingestion §9）。全過才算匯入完成；失敗印出 id 與原因並 exit 1。
// 帶類別參數（bun run scripts/check-data.ts 食品）只檢查那幾類；不帶就是規格的五類全查。
import { sql, dbConfigured } from "../src/server/db.ts";
import { CATEGORIES } from "../src/shared/need.ts";
import { TAGS, isExpired, missingEvidence, rowToRec, selfConflicting, type Rec } from "../src/shared/records.ts";

const MIN_PER_CATEGORY = 7;
const TAIWAN = { lat: [21.5, 25.5], lng: [118, 122.5] };

if (!dbConfigured()) {
  console.error("缺少 DATABASE_URL（見 .env.example）。");
  process.exit(1);
}

const asked = process.argv.slice(2);
const unknown = asked.filter((c) => !(CATEGORIES as readonly string[]).includes(c));
if (unknown.length > 0) {
  console.error(`不認得的類別：${unknown.join("、")}。可用：${CATEGORIES.join("、")}`);
  process.exit(1);
}
const scope = asked.length > 0 ? asked : [...CATEGORIES];

const recs: Rec[] = (await sql`select * from candidates where category = any(${sql.array(scope, "text")})`).map(rowToRec);
const verified = recs.filter((r) => r.data_status === "已驗證");

const failures: string[] = [];
const check = (name: string, bad: string[]) => {
  console.log(`${bad.length === 0 ? "✓" : "✗"} ${name}`);
  for (const b of bad) console.log(`    ${b}`);
  failures.push(...bad);
};

check(`1. 每類 ≥ ${MIN_PER_CATEGORY} 筆，其中已驗證 ≥ ${MIN_PER_CATEGORY}`, scope.flatMap((c) => {
  const all = recs.filter((r) => r.category === c).length;
  const ok = verified.filter((r) => r.category === c).length;
  return all >= MIN_PER_CATEGORY && ok >= MIN_PER_CATEGORY ? [] : [`${c}：${all} 筆、已驗證 ${ok} 筆`];
}));

check("2. 已驗證的紀錄必要摘錄齊全", verified.flatMap((r) => {
  const missing = missingEvidence(r);
  return missing.length === 0 ? [] : [`${r.id} 缺少 ${missing.join("、")} 的摘錄`];
}));

check("3. 沒有價格 0 卻標 paid 的列", recs.filter((r) => r.agent === "paid" && r.price_total_twd === 0).map((r) => `${r.id} agent=paid 但價格 0`));

check("4. tags 為 [] 卻在證據裡看得到成分描述", recs.flatMap((r) => {
  if (r.tags === null || r.tags.length > 0) return [];
  const hit = TAGS.filter((t) => r.evidence.some((e) => e.quote.includes(t)));
  return hit.length === 0 ? [] : [`${r.id} 證據提到 ${hit.join("、")}，tags 應填實際標籤或改成 null`];
}));

check("5. 有座標的列落在台灣範圍內", recs.flatMap((r) => {
  if (r.lat === null || r.lng === null) return [];
  const ok = r.lat >= TAIWAN.lat[0]! && r.lat <= TAIWAN.lat[1]! && r.lng >= TAIWAN.lng[0]! && r.lng <= TAIWAN.lng[1]!;
  return ok ? [] : [`${r.id} 座標 ${r.lat}, ${r.lng} 不在台灣範圍`];
}));

// §3：刻意準備的邊界資料，缺一項就無法示範例外處理。
const sameStoreTwoSources = recs.some((r) =>
  recs.some((o) => o.id !== r.id && o.provider === r.provider && o.source_url !== r.source_url
    && r.data_status === "已驗證" && o.data_status === "已驗證"));
check("6. §3 的邊界資料都在", [
  [recs.some((r) => r.price_total_twd === null), "缺少未知價格（price_total_twd = null）的紀錄"],
  [recs.some((r) => isExpired(r)), "缺少已過期（valid_until 已過）的紀錄"],
  [recs.some((r) => selfConflicting(r)), "缺少同一來源自我矛盾的紀錄"],
  [sameStoreTwoSources, "缺少同店不同來源、兩筆各自已驗證的紀錄"],
  [recs.some((r) => r.address === null), "缺少沒有地址的紀錄"],
  [recs.some((r) => r.baseline === null), "缺少沒有 baseline 的紀錄"],
].flatMap(([ok, why]) => (ok ? [] : [why as string])));

check("7. 每個 source_url 都是 https", recs.filter((r) => !r.source_url.startsWith("https://")).map((r) => `${r.id} ${r.source_url}`));

console.log(`\n檢查範圍：${scope.join("、")}，共 ${recs.length} 筆（已驗證 ${verified.length} 筆）`);
await sql.end();
if (failures.length > 0) {
  console.error(`${failures.length} 項不合格。`);
  process.exit(1);
}
console.log("全部通過。");
