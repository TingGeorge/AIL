import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { authResponseSchema } from "../src/shared/account.ts";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { auth, hashToken, __createLoginFailureLimiterForTests } = await import("../src/server/auth.ts");
const { applySchema, sql } = await import("../src/server/db.ts");

const app = new Hono();
app.route("/", auth);

const jsonHeaders = { "content-type": "application/json" };
const post = (path: string, body: unknown, token?: string) => app.request(path, {
  method: "POST",
  headers: { ...jsonHeaders, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const get = (path: string, token?: string) => app.request(path, {
  headers: token ? { authorization: `Bearer ${token}` } : undefined,
});

// Validation and fixed auth failures are route-level and do not touch PostgreSQL.
test("auth validation is bounded and strict before database access", async () => {
  const badRegister = await post("/api/auth/register", { username: "A!", password: "short", extra: true });
  expect(badRegister.status).toBe(400);
  expect(await badRegister.json()).toEqual({ error: "invalid_request", message: "註冊資料格式錯誤" });

  const badLogin = await post("/api/auth/login", { username: "x", password: "x", extra: true });
  expect(badLogin.status).toBe(400);
  expect(await badLogin.json()).toEqual({ error: "invalid_request", message: "登入資料格式錯誤" });
});

test("auth enforces its 8 KiB body limit without relying on Content-Length", async () => {
  const request = new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ padding: "x".repeat(9 * 1024) }),
  });
  expect(request.headers.has("content-length")).toBe(false);

  const response = await app.request(request);
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ error: "payload_too_large", message: "請求內容過大" });
});

test("protected auth routes use one fixed 401 response", async () => {
  for (const token of [undefined, "too-short", "!".repeat(40)]) {
    const response = await get("/api/auth/me", token);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized", message: "請重新登入" });
  }
});

test("login rate limit returns 429 on the tenth failure in fifteen minutes", async () => {
  const username = `bad!${crypto.randomUUID().slice(0, 8)}`;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await post("/api/auth/login", { username, password: "not long enough" });
    expect(response.status).toBe(attempt < 10 ? 401 : 429);
  }
  const blocked = await post("/api/auth/login", { username, password: "not long enough" });
  expect(blocked.status).toBe(429);
});

test("login failure limiter expires stale entries and evicts oldest entries at its cap", () => {
  const limiter = __createLoginFailureLimiterForTests(3, 100, 2);
  expect(limiter.record("a", 0)).toBe(false);
  expect(limiter.record("b", 0)).toBe(false);
  expect(limiter.record("c", 0)).toBe(false);
  expect(limiter.size).toBe(3);

  limiter.record("d", 50);
  expect(limiter.size).toBe(3);
  expect(limiter.state("a", 50)).toBeUndefined();
  expect(limiter.state("d", 50)).toEqual({ n: 1, until: 150 });

  limiter.record("e", 101);
  expect(limiter.size).toBe(2);
  expect(limiter.state("b", 101)).toBeUndefined();
  expect(limiter.state("c", 101)).toBeUndefined();
});

const live = Boolean(databaseUrl);
const createdUserIds: string[] = [];
const uniqueUsername = (label: string) => `${label}_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
const password = "correct horse battery staple";

beforeAll(async () => {
  if (live) await applySchema();
});

afterAll(async () => {
  if (!live || createdUserIds.length === 0) return;
  await sql`delete from users where id = any(${sql.array(createdUserIds, "text")})`;
});

const register = async (username: string, nickname?: string) => {
  const response = await post("/api/auth/register", { username, password, ...(nickname ? { nickname } : {}) });
  expect(response.status).toBe(201);
  const payload = authResponseSchema.parse(await response.json());
  createdUserIds.push(payload.user.id);
  return payload;
};

describe.skipIf(!live)("auth with isolated PostgreSQL rows", () => {
  test("register normalizes username, stores argon2id/token hashes, and rejects case-insensitive duplicate", async () => {
    const username = uniqueUsername("reg");
    const payload = await register(username.toUpperCase());
    expect(payload.user.username).toBe(username);
    expect(payload.user.nickname).toBe(username);
    expect(payload.data.profile.nickname).toBe(username);
    expect(Date.parse(payload.expires_at) - Date.now()).toBeWithin(29 * 60_000, 31 * 60_000);

    const rows = await sql`select u.password_hash, u.nickname, s.token_hash, d.profile
      from users u
      join auth_sessions s on s.user_id = u.id
      join account_data d on d.user_id = u.id
      where u.id = ${payload.user.id}`;
    const row = rows[0] as Record<string, unknown>;
    expect(String(row.password_hash).startsWith("$argon2id$")).toBe(true);
    expect(row.nickname).toBeNull();
    expect(row.token_hash).toBe(hashToken(payload.session_token));
    expect(row.token_hash).not.toBe(payload.session_token);
    expect(row.profile).toEqual({});

    const duplicate = await post("/api/auth/register", { username: username.toUpperCase(), password });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "username_taken", message: "此帳號名稱已被使用" });
  });

  test("login is case-insensitive and /me restores canonical account data", async () => {
    const username = uniqueUsername("login");
    await register(username, "初始暱稱");

    const login = await post("/api/auth/login", { username: username.toUpperCase(), password });
    expect(login.status).toBe(200);
    const payload = authResponseSchema.parse(await login.json());
    expect(payload.user.nickname).toBe("初始暱稱");
    expect(payload.data.profile.nickname).toBe("初始暱稱");

    const me = await get("/api/auth/me", payload.session_token);
    expect(me.status).toBe(200);
    const restored = await me.json() as any;
    expect(restored.user).toEqual(payload.user);
    expect(restored.data.profile.nickname).toBe(payload.user.nickname);
  });

  test("expired sessions and logged-out sessions return the same 401", async () => {
    const expired = await register(uniqueUsername("expire"));
    await sql`update auth_sessions set expires_at = now() - interval '1 second'
      where token_hash = ${hashToken(expired.session_token)}`;
    const expiredResponse = await get("/api/auth/me", expired.session_token);
    expect(expiredResponse.status).toBe(401);
    expect(await expiredResponse.json()).toEqual({ error: "unauthorized", message: "請重新登入" });

    const loggedOut = await register(uniqueUsername("logout"));
    const logout = await post("/api/auth/logout", {}, loggedOut.session_token);
    expect(logout.status).toBe(204);
    const afterLogout = await get("/api/auth/me", loggedOut.session_token);
    expect(afterLogout.status).toBe(401);
    expect(await afterLogout.json()).toEqual({ error: "unauthorized", message: "請重新登入" });
  });

  test("change-password revokes every session and only the new password logs in", async () => {
    const username = uniqueUsername("change");
    const first = await register(username);
    const secondResponse = await post("/api/auth/login", { username, password });
    const second = authResponseSchema.parse(await secondResponse.json());

    const nextPassword = "a completely different password";
    const changed = await post("/api/auth/change-password", {
      current_password: password,
      new_password: nextPassword,
    }, first.session_token);
    expect(changed.status).toBe(204);

    for (const token of [first.session_token, second.session_token]) {
      expect((await get("/api/auth/me", token)).status).toBe(401);
    }
    expect((await post("/api/auth/login", { username, password })).status).toBe(401);
    expect((await post("/api/auth/login", { username, password: nextPassword })).status).toBe(200);
  });

  test("an old-password login queued behind a password change cannot create a session", async () => {
    const username = uniqueUsername("loginrace");
    const session = await register(username);
    const nextPassword = "race-safe replacement password";
    const nextHash = await Bun.password.hash(nextPassword, { algorithm: "argon2id" });
    const reserved = await sql.reserve();
    let inTransaction = false;

    try {
      await reserved`begin`;
      inTransaction = true;
      await reserved`select id from users where id = ${session.user.id} for update`;

      // The unlocked login read sees the old hash, then its transaction must wait here.
      const login = post("/api/auth/login", { username, password });
      await Bun.sleep(200);
      await reserved`update users set password_hash = ${nextHash}, updated_at = now()
        where id = ${session.user.id}`;
      await reserved`update auth_sessions set revoked_at = now()
        where user_id = ${session.user.id} and revoked_at is null`;
      await reserved`commit`;
      inTransaction = false;

      const response = await login;
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "invalid_credentials", message: "帳號或密碼錯誤" });
      const active = await sql`select count(*)::int as n from auth_sessions
        where user_id = ${session.user.id} and revoked_at is null and expires_at > now()`;
      expect(active[0]?.n).toBe(0);
    } finally {
      if (inTransaction) await reserved`rollback`.catch(() => undefined);
      reserved.release();
    }
  });

  test("concurrent password changes cannot both validate the same old hash", async () => {
    const username = uniqueUsername("changerace");
    const session = await register(username);
    const firstPassword = "first concurrent replacement";
    const secondPassword = "second concurrent replacement";

    const responses = await Promise.all([
      post("/api/auth/change-password", {
        current_password: password,
        new_password: firstPassword,
      }, session.session_token),
      post("/api/auth/change-password", {
        current_password: password,
        new_password: secondPassword,
      }, session.session_token),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([204, 401]);

    const firstLogin = await post("/api/auth/login", { username, password: firstPassword });
    const secondLogin = await post("/api/auth/login", { username, password: secondPassword });
    expect([firstLogin.status, secondLogin.status].sort()).toEqual([200, 401]);
    expect((await post("/api/auth/login", { username, password })).status).toBe(401);
  });

  test("password change revalidates its session after waiting for the user lock", async () => {
    const session = await register(uniqueUsername("sessionrace"));
    const nextPassword = "must not be installed after revoke";
    const reserved = await sql.reserve();
    let inTransaction = false;

    try {
      await reserved`begin`;
      inTransaction = true;
      await reserved`select id from users where id = ${session.user.id} for update`;

      const change = post("/api/auth/change-password", {
        current_password: password,
        new_password: nextPassword,
      }, session.session_token);
      await Bun.sleep(200);
      await sql`update auth_sessions set revoked_at = now()
        where token_hash = ${hashToken(session.session_token)}`;
      await reserved`commit`;
      inTransaction = false;

      const response = await change;
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized", message: "請重新登入" });
      const rows = await sql`select password_hash from users where id = ${session.user.id}`;
      const storedHash = String(rows[0]?.password_hash);
      expect(await Bun.password.verify(password, storedHash)).toBe(true);
      expect(await Bun.password.verify(nextPassword, storedHash)).toBe(false);
    } finally {
      if (inTransaction) await reserved`rollback`.catch(() => undefined);
      reserved.release();
    }
  });
});
