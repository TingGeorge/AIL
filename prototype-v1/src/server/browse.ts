import { Hono } from "hono";
import { browseRecords } from "../shared/browse.ts";
import { rowToRec, type Rec } from "../shared/records.ts";
import { publicRecords } from "./catalog.ts";
import { dbConfigured, sql } from "./db.ts";

const loadRecords = async (): Promise<Rec[]> =>
  (await sql`select * from candidates order by id`).map(rowToRec);

// A read-only, anonymous route. No parse/ranking provider or account data is used.
// Injecting the catalog reader lets route tests exercise this boundary without a DB.
export function createBrowseRouter(readRecords = loadRecords, configured = dbConfigured) {
  const router = new Hono();
  router.get("/api/browse", async c => {
    c.header("Cache-Control", "no-store");
    if (!configured()) return c.json({ error: "database_unconfigured", message: "生活選項目前無法載入，請稍後重試。" }, 503);
    try {
      return c.json(browseRecords(publicRecords(await readRecords())));
    } catch (error) {
      console.error("browse_failed", error instanceof Error ? error.name : "unknown_error");
      return c.json({ error: "browse_failed", message: "目前無法載入生活選項，請稍後重試。" }, 502);
    }
  });
  return router;
}

export const browse = createBrowseRouter();
