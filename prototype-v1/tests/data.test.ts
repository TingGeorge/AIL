import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "../src/server/db.ts";
import {
  candidateSchema, dataStatusOf, missingEvidence, rowToRec, selfConflicting,
  type Evidence, type Rec,
} from "../src/shared/records.ts";

const 食品 = await Bun.file(new URL("../data/食品.json", import.meta.url)).json();

// 匯入前的第一道關卡：資料檔本身要合規（SPEC-ingestion §4）。
test("candidateSchema：data/食品.json 每一筆都通過", () => {
  const bad = 食品
    .map((r: unknown) => candidateSchema.safeParse(r))
    .flatMap((p: { success: boolean; error?: { issues: { path: unknown[]; message: string }[] } }, i: number) =>
      p.success ? [] : [`第 ${i + 1} 筆：${p.error!.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("；")}`]);
  expect(bad).toEqual([]);
});

// 票 01 指名的邊界資料。少一項這個資料集就不算完成。
test("食品資料集涵蓋票 01 的邊界情境", () => {
  const rows = 食品.map((r: unknown) => candidateSchema.parse(r));
  const total = (r: { price_total_twd: number | null; mandatory_fees_twd: number; discount_twd: number }) =>
    r.price_total_twd === null ? null : r.price_total_twd + r.mandatory_fees_twd - r.discount_twd;

  expect(rows.length).toBeGreaterThanOrEqual(8);
  expect(rows.length).toBeLessThanOrEqual(10);
  expect(rows.filter((r: { data_status: string }) => r.data_status === "已驗證").length).toBeGreaterThanOrEqual(7);

  // Demo 情境 A：2 人、NT$300 以內要有可行解。
  expect(rows.some((r: any) => r.data_status === "已驗證" && (total(r) ?? 1e9) <= 300 && /2 人/.test(r.quantity_or_servings ?? ""))).toBe(true);

  // 同一家店兩個來源 = 兩筆獨立紀錄（§6.1）：provider 相同、id 與 source_url 不同。
  const 同店 = rows.filter((r: any) => r.provider === "示範 大同水餃店");
  expect(同店.length).toBe(2);
  expect(new Set(同店.map((r: any) => r.source_url)).size).toBe(2);

  expect(rows.some((r: any) => r.baseline === null)).toBe(true);          // 沒有可比基準
  expect(rows.some((r: any) => r.price_total_twd === null)).toBe(true);   // 無法納入比較
  expect(rows.some((r: any) => r.tags === null)).toBe(true);              // 成分未標示
  expect(rows.some((r: any) => selfConflicting(r))).toBe(true);           // 來源自己矛盾
  expect(rows.some((r: any) => r.valid_until !== null && Date.parse(r.valid_until) < Date.now())).toBe(true); // 已過期
  expect(rows.every((r: any) => r.lat === null && r.lng === null)).toBe(true); // 座標由票 04 的腳本補
});

const base = {
  id: "f_z9z9", category: "食品", agent: "paid", title: "測試", provider: "測試店",
  price_total_twd: 100, mandatory_fees_twd: 0, source_url: "https://example.com/x", source_type: "curated",
  source_authority: "provider", collected_at: "2026-09-05T14:00:00+08:00",
  verified_at: "2026-09-05T14:00:00+08:00", data_status: "已驗證",
  evidence: ["價格", "份量", "時間"].map((field) => ({ field, quote: "x", url: "https://example.com/x", checked_at: "2026-09-05T14:00:00+08:00" })),
};

test("candidateSchema：擋掉價格 0 卻標 paid、非 https 來源、已驗證卻沒 verified_at", () => {
  expect(candidateSchema.safeParse({ ...base, price_total_twd: 0 }).success).toBe(false);
  expect(candidateSchema.safeParse({ ...base, source_url: "http://example.com/x" }).success).toBe(false);
  expect(candidateSchema.safeParse({ ...base, verified_at: null }).success).toBe(false);
  expect(candidateSchema.safeParse({ ...base, address: "臺北市大同區酒泉街 20 號" }).success).toBe(false); // 缺 extra.address_source
});

test("candidateSchema：tags 的 null 與 [] 是兩件事，省略等於 null", () => {
  expect(candidateSchema.parse(base).tags).toBeNull();
  expect(candidateSchema.parse({ ...base, tags: [] }).tags).toEqual([]);
  expect(candidateSchema.parse({ ...base, tags: ["豬"] }).tags).toEqual(["豬"]);
  expect(candidateSchema.safeParse({ ...base, tags: ["不存在的標籤"] }).success).toBe(false);
});

const ev = (field: string): Evidence => ({ field, quote: "x", url: "https://example.com/x", checked_at: "2026-09-05T14:00:00+08:00" });
const row = (over: Partial<Parameters<typeof dataStatusOf>[0]> = {}) => ({
  price_total_twd: 100 as number | null, mandatory_fees_twd: 0 as number | null, valid_until: null as string | null,
  verified_at: "2026-09-05T14:00:00+08:00" as string | null,
  evidence: [ev("價格"), ev("份量"), ev("時間")], eligibility: [] as string[], address: null as string | null,
  ...over,
});

test("missingEvidence：資格與地點只在有值時才要求", () => {
  expect(missingEvidence(row())).toEqual([]);
  expect(missingEvidence(row({ evidence: [ev("份量"), ev("時間")] }))).toEqual(["價格"]);
  expect(missingEvidence(row({ eligibility: ["低收入戶"] }))).toEqual(["資格"]);
  expect(missingEvidence(row({ address: "臺北市大同區酒泉街 20 號" }))).toEqual(["地點"]);
});

// §6 決策表由上往下，第一個成立的就是答案 —— 順序本身就是規格。
test("dataStatusOf：無法納入比較 → 衝突 → 過期 → 部分驗證 → 已驗證", () => {
  const now = Date.parse("2026-09-05T12:00:00+08:00");
  const expired = "2026-09-01T00:00:00+08:00";

  expect(dataStatusOf(row(), now)).toBe("已驗證");
  expect(dataStatusOf(row({ verified_at: null }), now)).toBe("部分驗證／待確認");
  expect(dataStatusOf(row({ evidence: [ev("價格"), ev("時間")] }), now)).toBe("部分驗證／待確認");
  expect(dataStatusOf(row({ valid_until: expired }), now)).toBe("過期／待確認");
  // 過期又缺驗證 → 過期先成立
  expect(dataStatusOf(row({ valid_until: expired, verified_at: null }), now)).toBe("過期／待確認");
  // 衝突比過期先成立
  expect(dataStatusOf(row({ valid_until: expired, evidence: [ev("價格"), ev("價格"), ev("份量"), ev("時間")] }), now)).toBe("衝突待確認");
  // 沒有價格最優先
  expect(dataStatusOf(row({ price_total_twd: null, evidence: [ev("價格"), ev("價格")] }), now)).toBe("無法納入比較");
});

// ---- 需要資料庫的部分：沒有 DATABASE_URL 就跳過（同 parse test 的做法）----
// 不要在這裡 sql.end()：sql 是整個測試行程共用的單例，關掉之後別的測試檔就連不上了。
const dbLive = Boolean(process.env.DATABASE_URL);
const ROOT = Bun.fileURLToPath(new URL("..", import.meta.url));

describe.skipIf(!dbLive)("匯入管線 (live database)", () => {
  const runImport = async () => {
    const p = Bun.spawn(["bun", "run", "scripts/import.ts"], { cwd: ROOT, env: {...process.env, ALLOW_DEMO_DATA:"1", DATA_DIR:`${ROOT}/data`}, stdout: "pipe", stderr: "pipe" });
    const code = await p.exited;
    if (code !== 0) throw new Error(await new Response(p.stderr).text());
  };
  const snapshot = async () =>
    (await sql`select id, md5(c::text) as h from candidates c order by id`).map((r: { id: string; h: string }) => `${r.id}:${r.h}`);

  test("示範資料未明確允許時拒絕匯入，資料庫維持不變", async () => {
    const before = await snapshot();
    const p = Bun.spawn(["bun", "run", "scripts/import.ts"], {
      cwd: ROOT, env: { ...process.env, ALLOW_DEMO_DATA: "0", DATA_DIR: `${ROOT}/data` },
      stdout: "pipe", stderr: "pipe",
    });
    const stderr = new Response(p.stderr).text();
    expect(await p.exited).not.toBe(0);
    expect(await stderr).toContain("ALLOW_DEMO_DATA=1");
    expect(await snapshot()).toEqual(before);
  });

  test("a malformed later row cannot partially import an earlier valid row", async () => {
    const before = await snapshot();
    const directory = await mkdtemp(join(tmpdir(), "ail-atomic-import-"));
    try {
      await Bun.write(join(directory, "batch.json"), JSON.stringify([
        { ...食品[0], id: "f_zq91" },
        { ...食品[0], id: "f_zq92", price_total_twd: -5 },
      ]));
      const p = Bun.spawn(["bun", "run", "scripts/import.ts"], {
        cwd: ROOT, env: { ...process.env, ALLOW_DEMO_DATA: "1", DATA_DIR: directory }, stdout: "pipe", stderr: "pipe",
      });
      const stderr = new Response(p.stderr).text();
      expect(await p.exited).not.toBe(0);
      expect(await stderr).toContain("第 2 筆");
      expect(await snapshot()).toEqual(before);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test("import preserves SQL NULL mandatory fees instead of defaulting unknown costs to zero", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ail-null-fees-import-"));
    let id: string;
    do { id = `f_${crypto.randomUUID().replaceAll("-", "").slice(0, 4)}`; }
    while ((await sql`select id from candidates where id = ${id}`).length > 0);
    try {
      await Bun.write(join(directory, "batch.json"), JSON.stringify([
        { ...食品[0], id, mandatory_fees_twd: null, data_status: "無法納入比較" },
      ]));
      const p = Bun.spawn(["bun", "run", "scripts/import.ts"], {
        cwd: ROOT, env: { ...process.env, ALLOW_DEMO_DATA: "1", DATA_DIR: directory }, stdout: "pipe", stderr: "pipe",
      });
      await new Response(p.stderr).text();
      expect(await p.exited).toBe(0);
      const rows = await sql`select * from candidates where id = ${id}`;
      expect(rows.length).toBe(1);
      expect(rows[0].mandatory_fees_twd).toBeNull();
      expect(rowToRec(rows[0]).mandatory_fees_twd).toBeNull();
      expect(dataStatusOf(rowToRec(rows[0]))).toBe("無法納入比較");
      const columns = await sql`select column_default, is_nullable from information_schema.columns where table_schema = current_schema() and table_name = 'candidates' and column_name = 'mandatory_fees_twd'`;
      expect(columns[0].column_default).toBeNull();
      expect(columns[0].is_nullable).toBe("YES");
    } finally {
      await sql`delete from candidates where id = ${id}`;
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("import.ts 連跑兩次：列數與內容都不變", async () => {
    await runImport();
    const first = await snapshot();
    await runImport();
    expect(await snapshot()).toEqual(first);
    expect(first.length).toBeGreaterThanOrEqual(8);
  }, 60_000);

  test("rowToRec：tags 的 null、jsonb 與 timestamptz 從資料庫回來仍正確", async () => {
    const recs: Rec[] = (await sql`select * from candidates order by id`).map(rowToRec);
    const fridge = recs.find((r) => r.id === "f_g0h1")!;
    const bento = recs.find((r) => r.id === "f_a3k9")!;

    expect(fridge.tags).toBeNull();                    // 成分未標示，不是「確認無」
    expect(bento.tags).toEqual(["豬", "雞"]);
    expect(bento.evidence.map((e) => e.field)).toContain("價格");
    expect(bento.baseline!.total_twd).toBe(320);
    expect(bento.extra.address_source).toBe("source");
    expect(bento.valid_until).toBe("2026-09-30T15:59:59.000Z");
    expect(recs.find((r) => r.id === "f_b1c2")!.baseline).toBeNull();
  });
});
