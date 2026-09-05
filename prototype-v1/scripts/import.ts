// 讀 data/*.json，逐筆驗證後以 id upsert 進 candidates（SPEC-ingestion §4、SPEC-backend §5）。
// 只寫入與更新，永遠不刪除任何一列；有任何一筆不合規就整批不寫，避免留下半套資料。
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { sql, dbConfigured, applySchema } from "../src/server/db.ts";
import { CANDIDATE_COLUMNS, candidateSchema, isDemoRecord } from "../src/shared/records.ts";

const DIR = process.env.DATA_DIR ? pathToFileURL(resolve(process.env.DATA_DIR) + "/") : new URL("../data/", import.meta.url);
const JSONB = new Set(["evidence", "baseline", "group_offer", "extra"]);
const TEXT_ARRAY = new Set(["eligibility", "tags"]);

// Bun.sql 的參數不會自己變成 Postgres 陣列／jsonb，所以這裡明確轉字面值並在 SQL 加 cast。
const toParam = (col: string, v: unknown) => {
  if (v === null) return null;
  if (TEXT_ARRAY.has(col)) return `{${(v as string[]).map((s) => `"${s.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
  return JSONB.has(col) ? JSON.stringify(v) : v;
};

if (!dbConfigured()) {
  console.error("缺少 DATABASE_URL（見 .env.example）。");
  process.exit(1);
}

const files = [...new Bun.Glob("*.json").scanSync(Bun.fileURLToPath(DIR))].sort();
if (files.length === 0) {
  console.error(`${Bun.fileURLToPath(DIR)} 沒有任何 .json`);
  process.exit(1);
}

type Row = Record<string, unknown>;
const rows: Row[] = [];
const errors: string[] = [];
const seen = new Map<string, string>();

for (const file of files) {
  const json = await Bun.file(new URL(file, DIR)).json();
  if (!Array.isArray(json)) {
    errors.push(`${file}：最外層必須是陣列`);
    continue;
  }
  json.forEach((raw: unknown, i: number) => {
    const where = `${file} 第 ${i + 1} 筆（${(raw as Row)?.id ?? "無 id"}）`;
    const parsed = candidateSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`${where}：${parsed.error.issues.map((x) => `${x.path.join(".") || "(整筆)"} ${x.message}`).join("；")}`);
      return;
    }
    const first = seen.get(parsed.data.id);
    if (first) errors.push(`${where}：id 與 ${first} 重複`);
    seen.set(parsed.data.id, where);
    if(isDemoRecord(parsed.data) && process.env.ALLOW_DEMO_DATA !== "1") errors.push(`${where}：示範資料需要明確設定 ALLOW_DEMO_DATA=1；正式環境請使用真實來源。`);
    rows.push(parsed.data as Row);
  });
}

if (errors.length > 0) {
  for (const e of errors) console.error("✗", e);
  console.error(`\n${errors.length} 筆不合規，沒有寫入任何資料。`);
  process.exit(1);
}

await applySchema();

const placeholders = CANDIDATE_COLUMNS
  .map((c, i) => `$${i + 1}${TEXT_ARRAY.has(c) ? "::text[]" : JSONB.has(c) ? "::jsonb" : ""}`)
  .join(", ");
const updates = CANDIDATE_COLUMNS.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
const upsert = `insert into candidates (${CANDIDATE_COLUMNS.join(", ")}) values (${placeholders}) on conflict (id) do update set ${updates}`;

await sql.begin(async transaction=>{
  for (const row of rows) await transaction.unsafe(upsert, CANDIDATE_COLUMNS.map((c) => toParam(c, row[c])));
});

const counts = await sql`select category, count(*)::int as n from candidates group by category order by category`;
console.log(`匯入 ${rows.length} 筆（${files.join("、")}）`);
for (const c of counts) console.log(`  ${c.category} ${c.n}`);
await sql.end();
