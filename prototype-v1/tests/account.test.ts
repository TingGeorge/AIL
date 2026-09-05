import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  MAX_ACCOUNT_IDS,
  accountDataSchema,
  accountDataUpdateSchema,
  authResponseSchema,
  defaultAccountData,
} from "../src/shared/account.ts";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { auth } = await import("../src/server/auth.ts");
const { account } = await import("../src/server/account.ts");
const { applySchema, sql } = await import("../src/server/db.ts");

const app = new Hono();
app.route("/", auth);
app.route("/", account);

const request = (path: string, method = "GET", body?: unknown, token?: string) => app.request(path, {
  method,
  headers: {
    ...(body === undefined ? {} : { "content-type": "application/json" }),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test("defaultAccountData is callable and produces the canonical client shape", () => {
  const data = defaultAccountData("前端暱稱", new Date("2026-09-05T00:00:00+08:00"));
  expect(accountDataSchema.parse(data)).toEqual(data);
  expect(data.profile).toEqual({ nickname: "前端暱稱", color: "#e4ff1a" });
  expect(data.settings.spent_month).toBe("2026-09");
});

test("account update schema is strict and caps unique list/favorite IDs", () => {
  const valid = defaultAccountData("測試");
  expect(accountDataUpdateSchema.safeParse(valid).success).toBe(true);
  expect(accountDataUpdateSchema.safeParse({ ...valid, transcript: "不可保存" }).success).toBe(false);
  expect(accountDataUpdateSchema.safeParse({ ...valid, profile: { ...valid.profile, history: [] } }).success).toBe(false);
  expect(accountDataUpdateSchema.safeParse({ ...valid, list: ["same", "same"] }).success).toBe(false);
  expect(accountDataUpdateSchema.safeParse({
    ...valid,
    list: Array.from({ length: MAX_ACCOUNT_IDS + 1 }, (_, index) => `f_${index}`),
  }).success).toBe(false);
});

test("report route rejects an invalid candidate id before database access", async () => {
  const response = await request("/api/candidates/not%20valid/reports");
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "invalid_request", message: "候選紀錄格式錯誤" });
});

const live = Boolean(databaseUrl);
const createdUserIds: string[] = [];
const createdCandidateIds: string[] = [];
const password = "correct horse battery staple";

beforeAll(async () => {
  if (live) await applySchema();
});

afterAll(async () => {
  if (!live) return;
  if (createdCandidateIds.length) {
    await sql`delete from candidates where id = any(${sql.array(createdCandidateIds, "text")})`;
  }
  if (createdUserIds.length) {
    await sql`delete from users where id = any(${sql.array(createdUserIds, "text")})`;
  }
});

const register = async () => {
  const username = `acct_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const response = await request("/api/auth/register", "POST", { username, password, nickname: "原暱稱" });
  const payload = authResponseSchema.parse(await response.json());
  createdUserIds.push(payload.user.id);
  return payload;
};

const insertCandidate = async () => {
  const id = `f_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  createdCandidateIds.push(id);
  await sql`insert into candidates (
      id, category, agent, title, provider, price_total_twd, source_url, source_type,
      source_authority, collected_at, verified_at, data_status
    ) values (
      ${id}, '食品', 'paid', '隔離測試候選', '測試提供者', 100, 'https://example.com/test',
      'curated', 'provider', now(), now(), '已驗證'
    )`;
  return id;
};

describe.skipIf(!live)("account data and reports with isolated PostgreSQL rows", () => {
  test("account mutations enforce their 16 KiB body limit without Content-Length", async () => {
    const session = await register();
    const oversized = new Request("http://localhost/api/me/data", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.session_token}`,
      },
      body: JSON.stringify({ padding: "x".repeat(17 * 1024) }),
    });
    expect(oversized.headers.has("content-length")).toBe(false);

    const response = await app.request(oversized);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload_too_large", message: "請求內容過大" });
  });

  test("GET/PUT account data round-trips allowlisted fields and atomically updates canonical nickname", async () => {
    const session = await register();
    const candidateId = await insertCandidate();

    const initial = await request("/api/me/data", "GET", undefined, session.session_token);
    expect(initial.status).toBe(200);
    expect((await initial.json() as any).profile.nickname).toBe("原暱稱");

    const update = defaultAccountData("新暱稱");
    update.list = [candidateId];
    update.favs = [candidateId];
    update.settings.monthly_budget = 12_000;
    update.settings.spent = 450;
    update.settings.survival = true;
    update.settings.exclude = ["牛"];
    update.settings.prefs = ["可外帶"];
    update.settings.costco_ok = true;

    const saved = await request("/api/me/data", "PUT", update, session.session_token);
    expect(saved.status).toBe(200);
    const data = accountDataSchema.parse(await saved.json());
    expect(data.profile.nickname).toBe("新暱稱");
    expect(data.list).toEqual([candidateId]);

    const rows = await sql`select u.nickname, d.profile from users u
      join account_data d on d.user_id = u.id where u.id = ${session.user.id}`;
    expect(rows[0]?.nickname).toBe("新暱稱");
    expect(rows[0]?.profile).toEqual({ color: update.profile.color });

    const me = await request("/api/auth/me", "GET", undefined, session.session_token);
    const meBody = await me.json() as any;
    expect(meBody.user.nickname).toBe("新暱稱");
    expect(meBody.data.profile.nickname).toBe("新暱稱");
  });

  test("stale device cannot overwrite another device's favorites or nickname", async () => {
    const session = await register();
    const first = structuredClone(session.data);
    const stale = structuredClone(session.data);
    first.favs = ["f_m037"];
    const a = await request("/api/me/data", "PUT", first, session.session_token);
    expect(a.status).toBe(200);
    stale.settings.monthly_budget = 900;
    stale.profile.nickname = "過期裝置";
    const b = await request("/api/me/data", "PUT", stale, session.session_token);
    expect(b.status).toBe(409);
    const final = await request("/api/auth/me", "GET", undefined, session.session_token);
    const saved = await final.json() as any;
    expect(saved.data.favs).toEqual(["f_m037"]);
    expect(saved.user.nickname).toBe("原暱稱");
    expect(saved.data.settings.monthly_budget).toBe(null);
  });

  test("PUT rejects forbidden account fields and over-200 IDs", async () => {
    const session = await register();
    const valid = defaultAccountData("原暱稱");

    const forbidden = await request("/api/me/data", "PUT", { ...valid, search_history: [] }, session.session_token);
    expect(forbidden.status).toBe(400);
    expect(await forbidden.json()).toEqual({ error: "invalid_account_data", message: "帳號資料格式錯誤" });

    const tooMany = await request("/api/me/data", "PUT", {
      ...valid,
      list: Array.from({ length: MAX_ACCOUNT_IDS + 1 }, (_, index) => `f_${index}`),
    }, session.session_token);
    expect(tooMany.status).toBe(400);
  });

  test("candidate reports enforce reason allowlist and return canonical author display", async () => {
    const session = await register();
    const candidateId = await insertCandidate();

    const invalid = await request(`/api/candidates/${candidateId}/reports`, "POST", {
      reason: "其他",
      note: "not allowed",
    }, session.session_token);
    expect(invalid.status).toBe(400);

    const created = await request(`/api/candidates/${candidateId}/reports`, "POST", {
      reason: "價格過期",
      note: "現場價格已不同",
    }, session.session_token);
    expect(created.status).toBe(201);
    const report = await created.json() as any;
    expect(report).toMatchObject({ candidate_id: candidateId, reason: "價格過期", note: "現場價格已不同", by: "原暱稱" });

    const listed = await request(`/api/candidates/${candidateId}/reports`);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual([report]);
  });
});
