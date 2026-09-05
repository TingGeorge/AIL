import { expect, test } from "bun:test";
import { readCatalog, defaultDataDirectory } from "../scripts/catalog-files.ts";
import { CATEGORIES } from "../src/shared/need.ts";
import { assessCatalog } from "../src/shared/catalog-quality.ts";
import { isDemoRecord, passesGate, rowToRec } from "../src/shared/records.ts";

test("web research batch contains all five categories and only evidence-backed rows can rank", async () => {
  const batch = await readCatalog(defaultDataDirectory, false);
  const records = batch.records.map(rowToRec);
  expect(new Set(records.map(record=>record.category))).toEqual(new Set(CATEGORIES));
  expect(records.every(record=>!isDemoRecord(record))).toBe(true);
  expect(records.every(record=>record.extra.research_batch==="yuanshan-2026-09-05")).toBe(true);
  expect(assessCatalog(records).issues).toEqual([]);
  // Coverage gaps are reported by data:validate, not concealed with an invented verified row.
  for (const record of records) {
    expect(record.source_url.startsWith("https://")).toBe(true);
    if (record.data_status === "已驗證") {
      expect(record.evidence.length).toBeGreaterThan(0);
      expect(passesGate(record)).toBe(true);
    } else {
      // Inaccessible or ambiguous sources stay honest pending rows, not invented evidence.
      expect(passesGate(record)).toBe(false);
      expect(record.extra.review_notes).toBeDefined();
    }
    if (record.lat !== null) expect(record.extra.source_coordinates).toBeDefined();
  }
});
