// One-time, additive expansion of the observed 50-row catalogue to 150 rows.
// Unlike the general upsert importer, this never updates existing candidates or applies DDL.
import { join } from "node:path";
import { sql, dbConfigured } from "../src/server/db.ts";
import { publicRecords, summarizeCatalog } from "../src/server/catalog.ts";
import { canDisplayGroupOffer } from "../src/shared/group-offers.ts";
import { assessCatalog } from "../src/shared/catalog-quality.ts";
import { CANDIDATE_COLUMNS, isDemoRecord, rowToRec, type Category, type Rec } from "../src/shared/records.ts";
import { readCatalog, defaultDataDirectory } from "./catalog-files.ts";

const BATCH = "expansion-2026-09-05";
const BASELINE: Record<Category, number> = { 食品: 18, 日用品: 7, "免費／公益資源": 7, 活動: 10, 交通: 8 };
const reportDirectory = Bun.fileURLToPath(new URL("../../.scratch/catalog-expansion/", import.meta.url));
const JSONB = new Set(["evidence", "baseline", "group_offer", "extra"]);
const TEXT_ARRAY = new Set(["eligibility", "tags"]);
const parameter = (column: string, value: unknown) => {
  if (value === null) return null;
  if (TEXT_ARRAY.has(column)) return `{${(value as string[]).map(item => `"${item.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
  return JSONB.has(column) ? JSON.stringify(value) : value;
};
const counts = (rows: { category: Category }[]) => Object.fromEntries(
  Object.keys(BASELINE).map(category => [category, rows.filter(row => row.category === category).length]),
);
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
let committed = false;
try {
  assert(dbConfigured(), "DATABASE_URL is required.");
  assert(process.argv.slice(2).every(arg => arg === "--apply"), "Use --apply to insert; omission is a read-only dry run.");
  const apply = process.argv.includes("--apply");
  const { records } = await readCatalog(defaultDataDirectory, false);
  const additions = records.filter(row => row.extra.research_batch === BATCH);
  assert(additions.length === 100, `Expected 100 additions; found ${additions.length}.`);
  for (const [category, count] of Object.entries(BASELINE)) {
    assert(additions.filter(row => row.category === category).length === count * 2, `${category}: incorrect addition count.`);
  }
  assert(additions.every(row => !isDemoRecord(row) && row.extra.archived !== true), "No demo or archived additions permitted.");
  const groupRows = additions.map(rowToRec).filter(row => row.group_offer !== null);
  assert(groupRows.every(row => canDisplayGroupOffer(row)), "A group offer is missing evidence, redemption terms or a valid threshold/period.");
  const assessment = assessCatalog(additions.map(rowToRec));
  assert(assessment.issues.length === 0, assessment.issues.join("\n"));
  const placeholders = CANDIDATE_COLUMNS.map((column, index) => `$${index + 1}${TEXT_ARRAY.has(column) ? "::text[]" : JSONB.has(column) ? "::jsonb" : ""}`).join(", ");
  const insert = `insert into candidates (${CANDIDATE_COLUMNS.join(", ")}) values (${placeholders})`;
  const result = await sql.begin(async transaction => {
    if (apply) {
      await transaction`set local lock_timeout = '5s'`;
      await transaction`set local statement_timeout = '60s'`;
      await transaction`lock table candidates in share row exclusive mode`;
    } else await transaction`set transaction isolation level repeatable read, read only`;
    const [meta] = await transaction`select current_timestamp as checked_at, current_database() as database_name`;
    const before: Record<string, unknown>[] = await transaction`select * from candidates order by id`;
    const beforeRecords: Rec[] = before.map(rowToRec);
    const currentCounts = counts(beforeRecords);
    for (const [category, count] of Object.entries(BASELINE)) {
      assert(currentCounts[category] === count, `${category}: DB changed since baseline; refuse to write.`);
    }
    const ids = new Set(beforeRecords.map(row => row.id));
    assert(additions.every(row => !ids.has(row.id)), "An added id already exists; refuse to overwrite or duplicate.");
    const stamp = new Date(meta.checked_at).toISOString().replaceAll(":", "-");
    if (apply) {
      await Bun.write(join(reportDirectory, `database-before-import-${stamp}.json`), JSON.stringify({ ...meta, rows: before }, null, 2) + "\n");
      for (const row of additions) {
        await transaction.unsafe(insert, CANDIDATE_COLUMNS.map(column => parameter(column, (row as unknown as Record<string, unknown>)[column])));
      }
    }
    const after: Record<string, unknown>[] = apply ? await transaction`select * from candidates order by id` : before;
    if (apply) {
      const unchanged = after.filter(row => ids.has(String(row.id)));
      assert(JSON.stringify(unchanged) === JSON.stringify(before), "Existing candidate data changed; rolling back.");
      const afterCounts = counts(after.map(rowToRec));
      for (const [category, count] of Object.entries(BASELINE)) {
        assert(afterCounts[category] === count * 3, `${category}: threefold target not met; rolling back.`);
      }
    }
    return { mode: apply ? "applied" : "dry-run", batch: BATCH, ...meta, added: apply ? additions.length : 0, planned_additions: counts(additions), before: currentCounts, after: counts(after.map(rowToRec)), preserved_existing_rows: before.length, catalog: summarizeCatalog(publicRecords(after.map(rowToRec))) };
  });
  committed = apply;
  console.log(JSON.stringify(result, null, 2));
  if (apply) await Bun.write(join(reportDirectory, "import-result.json"), JSON.stringify(result, null, 2) + "\n");
} catch (error) {
  // Do not include driver messages/connection strings, which may contain private connection details.
  console.error(committed ? "Expansion committed; local report persistence failed. Verify the DB before any retry." : "Expansion did not commit; no existing data was modified.");
  if (error instanceof Error && error.name === "Error") console.error(error.message);
  else console.error(error instanceof Error ? error.name : "Unknown error");
  process.exitCode = 1;
} finally { await sql.end(); }
