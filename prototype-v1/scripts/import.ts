// Validate the entire batch before touching the DB. Upserts are atomic; no rows are deleted.
import { sql, dbConfigured, applySchema } from "../src/server/db.ts";
import { CANDIDATE_COLUMNS } from "../src/shared/records.ts";
import { readCatalog } from "./catalog-files.ts";

const JSONB = new Set(["evidence", "baseline", "group_offer", "extra"]);
const TEXT_ARRAY = new Set(["eligibility", "tags"]);
const toParam = (column: string, value: unknown) => {
  if (value === null) return null;
  if (TEXT_ARRAY.has(column)) return `{${(value as string[]).map(item => `"${item.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
  return JSONB.has(column) ? JSON.stringify(value) : value;
};

let writingDB = false;
try {
  if (!dbConfigured()) throw new Error("缺少 DATABASE_URL（見 .env.example）。");
  const { records, files } = await readCatalog();
  writingDB = true;
  await applySchema();
  const placeholders = CANDIDATE_COLUMNS.map((column,index) => `$${index + 1}${TEXT_ARRAY.has(column) ? "::text[]" : JSONB.has(column) ? "::jsonb" : ""}`).join(", ");
  const updates = CANDIDATE_COLUMNS.filter(column => column !== "id").map(column => `${column} = excluded.${column}`).join(", ");
  const statement = `insert into candidates (${CANDIDATE_COLUMNS.join(", ")}) values (${placeholders}) on conflict (id) do update set ${updates}`;
  await sql.begin(async transaction => {
    for (const record of records) {
      await transaction.unsafe(statement, CANDIDATE_COLUMNS.map(column => toParam(column, (record as unknown as Record<string, unknown>)[column])));
    }
  });
  console.log(`已原子匯入 ${records.length} 筆（${files.join("、")}），未刪除原有資料。`);
  for (const category of [...new Set(records.map(record => record.category))]) {
    const selected = records.filter(record => record.category === category);
    console.log(`  ${category}：${selected.length} 筆；來源欄位已驗證 ${selected.filter(record => record.data_status === "已驗證").length} 筆`);
  }
  console.log("舊示範資料預設不會透過 API 顯示；只有 ALLOW_DEMO_DATA=1 才開放。已驗證不代表即時供應保證。");
} catch(error) {
  console.error(writingDB ? "資料庫匯入失敗；請確認連線及 schema，資料交易已回滾。" : error instanceof Error ? error.message : "匯入失敗");
  process.exitCode = 1;
} finally { await sql.end(); }
