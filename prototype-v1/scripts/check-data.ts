// Default: inspect the real DB. --files validates the curated batch without needing PostgreSQL.
import { sql, dbConfigured } from "../src/server/db.ts";
import { CATEGORIES } from "../src/shared/need.ts";
import { rowToRec, type Category, type Rec } from "../src/shared/records.ts";
import { assessCatalog } from "../src/shared/catalog-quality.ts";
import { readCatalog } from "./catalog-files.ts";

const args = process.argv.slice(2);
const fromFiles = args.includes("--files");
const requested = args.filter(arg => arg !== "--files");
const unknown = requested.filter(category => !(CATEGORIES as readonly string[]).includes(category));
let readingDB = false;
try {
  if (unknown.length) throw new Error(`不認得的參數：${unknown.join("、")}；可用 --files 及 ${CATEGORIES.join("、")}`);
  const scope = requested.length ? requested as Category[] : CATEGORIES;
  let records: Rec[];
  if (fromFiles) records = (await readCatalog(undefined, false)).records.map(row => rowToRec(row));
  else {
    if (!dbConfigured()) throw new Error("缺少 DATABASE_URL；可用 data:validate 檢查來源檔。");
    readingDB = true;
    records = (await sql`select * from candidates`).map(rowToRec);
  }
  const report = assessCatalog(records, scope);
  console.log(`真實資料驗收（${fromFiles ? "來源檔" : "資料庫"}）：${report.total} 筆；忽略 ${report.ignored} 筆示範／封存／範圍外資料。`);
  console.table(report.categories);
  for (const issue of report.issues) console.error(`✗ ${issue}`);
  console.log("可比較 = 成本與必要證據完整且未到期；不是即時庫存／開放保證。配額每類 7 筆。合成邊界情境另由 bun test 驗收。");
  if (!report.ready) {
    console.error("尚未達到欄位與五類筆數門檻；請補證據或真實來源，不要用示範資料補數。");
    process.exitCode = 1;
  } else console.log("✓ 真實資料欄位與五類涵蓋檢查通過。");
} catch(error) {
  console.error(readingDB ? "資料庫檢查失敗；請確認連線及 schema。" : error instanceof Error ? error.message : "檢查失敗");
  process.exitCode = 1;
} finally { await sql.end(); }
