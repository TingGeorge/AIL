import { costOrder, passesGate, type Bucket, type Rec } from "./records.ts";

// Browsing is not an empty personalized search: no budget, membership, dietary,
// location or other user constraint is inferred. Evidence uncertainty still matters.
export function browseRecords(records: Rec[], now = Date.now()): Bucket {
  const result: Bucket = { main: [], pending: [], excluded: [] };
  for (const record of records) {
    (passesGate(record, now) ? result.main : result.pending).push(record);
  }
  result.main.sort(costOrder());
  result.pending.sort(costOrder());
  return result;
}
