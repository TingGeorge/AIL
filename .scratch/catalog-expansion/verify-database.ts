// Read-only post-commit verification; deliberately does not call applySchema/import.
import { sql } from "bun";
import { isDeepStrictEqual } from "node:util";
import { rowToRec } from "../../prototype-v1/src/shared/records.ts";
import { publicRecords, summarizeCatalog } from "../../prototype-v1/src/server/catalog.ts";
import { canDisplayGroupOffer } from "../../prototype-v1/src/shared/group-offers.ts";
import { readCatalog, defaultDataDirectory } from "../../prototype-v1/scripts/catalog-files.ts";
const baseline = await Bun.file(new URL("./database-before.json", import.meta.url)).json();
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const normalized = (row: Record<string, unknown>) => {
  const record = rowToRec(row);
  for (const key of ["collected_at", "verified_at", "valid_until"] as const) {
    if (record[key]) record[key] = new Date(record[key]!).toISOString();
  }
  return json(record);
};
try {
  const result = await sql.begin(async tx => {
    await tx`set transaction isolation level repeatable read, read only`;
    const rows = await tx`select * from candidates order by id`;
    const oldIds = new Set(baseline.rows.map((row: { id: string }) => row.id));
    const unchanged = json(rows.filter(row => oldIds.has(row.id)));
    if (!isDeepStrictEqual(unchanged, baseline.rows)) throw new Error("Original 50 rows differ from the initial snapshot");
    const { records: sources } = await readCatalog(defaultDataDirectory, false);
    const added = sources.filter(row => row.extra.research_batch === "expansion-2026-09-05");
    for (const record of added) {
      const stored = rows.find(row => row.id === record.id);
      if (!stored || !isDeepStrictEqual(normalized(stored), normalized(record))) throw new Error(`File/DB mismatch: ${record.id}`);
    }
    const [tables] = await tx`select
      (select count(*)::int from users) as users,
      (select count(*)::int from auth_sessions) as auth_sessions,
      (select count(*)::int from account_data) as account_data,
      (select count(*)::int from reports) as reports`;
    if (Object.values(tables).some(value => value !== 0)) throw new Error("Account-related table counts differ from the zero baseline");
    const publicRows = publicRecords(rows.map(rowToRec));
    const groupRows = publicRows.filter(row => canDisplayGroupOffer(row));
    if (rows.length !== 150 || added.length !== 100 || groupRows.length !== 7) throw new Error("Unexpected total or group count");
    return { checked_at: new Date().toISOString(), stored: rows.length, old_rows_unchanged: unchanged.length, additions_match_files: added.length,
      account_tables: tables, catalog: summarizeCatalog(publicRows), group_offers: groupRows.map(row => ({ id: row.id, title: row.title, ...row.group_offer })) };
  });
  await Bun.write(new URL("./verification-result.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally { await sql.end(); }
