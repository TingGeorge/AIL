import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  USERNAME_PATTERN,
  accountDataFromStorage,
  changePasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  type AccountData,
  type AuthResponse,
  type User,
} from "../shared/account.ts";
import { dbConfigured, sql } from "./db.ts";

// SPEC-backend fixes sessions at 1,800 seconds. Deliberately do not make this
// security boundary configurable through AUTH_SESSION_TTL_SECONDS.
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_JSON_BYTES = 8 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 10;
const LOGIN_FAILURE_MAX_ENTRIES = 10_000;
const LOGIN_FAILURE_SWEEP_INTERVAL = 64;
const FAKE_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=2,p=1$0mL7S7VKSDxEchZUp6fJJengVG7d8EpTN2eI7J+wJjs$T1E6HXAScRpWCqapSQ2LUZFC9CRBPY8C9lvlne3gG+8";

export type AuthVariables = {
  user: User;
  authSessionId: string;
};

type LoginFailure = { n: number; until: number };

class LoginFailureLimiter {
  private readonly entries = new Map<string, LoginFailure>();
  private operations = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly windowMs: number,
    private readonly failureLimit: number,
  ) {}

  private sweepExpired(now: number, force = false) {
    this.operations += 1;
    if (!force && this.operations % LOGIN_FAILURE_SWEEP_INTERVAL !== 0) return;
    for (const [username, state] of this.entries) {
      if (state.until <= now) this.entries.delete(username);
    }
  }

  state(username: string, now = Date.now()) {
    this.sweepExpired(now);
    const state = this.entries.get(username);
    if (state && state.until <= now) {
      this.entries.delete(username);
      return undefined;
    }
    return state;
  }

  record(username: string, now = Date.now()) {
    const state = this.state(username, now);
    if (!state && this.entries.size >= this.maxEntries) {
      this.sweepExpired(now, true);
      while (this.entries.size >= this.maxEntries) {
        const oldest = this.entries.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        this.entries.delete(oldest);
      }
    }

    const next = state ? { n: state.n + 1, until: state.until } : { n: 1, until: now + this.windowMs };
    // Refresh insertion order so cap eviction removes the least recently failed username.
    this.entries.delete(username);
    this.entries.set(username, next);
    return next.n >= this.failureLimit;
  }

  success(username: string) {
    this.entries.delete(username);
  }

  get size() {
    return this.entries.size;
  }
}

// This is intentionally a bounded, per-process best-effort brake. It resets on restart and
// does not coordinate across replicas; deployment-wide enforcement belongs at the edge/store.
const loginFailures = new LoginFailureLimiter(
  LOGIN_FAILURE_MAX_ENTRIES,
  LOGIN_WINDOW_MS,
  LOGIN_FAILURE_LIMIT,
);

/** @internal Test an isolated limiter without mutating the process-global auth state. */
export const __createLoginFailureLimiterForTests = (maxEntries: number, windowMs: number, failureLimit: number) =>
  new LoginFailureLimiter(maxEntries, windowMs, failureLimit);

const normalizeUsername = (value: string) => value.trim().toLowerCase();
const pgCode = (error: unknown) => {
  if (!error || typeof error !== "object") return "";
  const postgresError = error as { code?: unknown; errno?: unknown };
  return String(postgresError.errno ?? postgresError.code ?? "");
};

export const hashToken = (token: string) =>
  new Bun.CryptoHasher("sha256").update(token).digest("hex");

const newToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
};

const userFromRow = (row: Record<string, unknown>): User => ({
  id: String(row.id),
  username: String(row.username),
  nickname: String(row.nickname ?? row.username),
});

const unauthorized = (c: Parameters<MiddlewareHandler>[0]) =>
  c.json({ error: "unauthorized", message: "請重新登入" }, 401);

const unavailable = (c: { json: (body: unknown, status: 503) => Response }) =>
  c.json({ error: "database_unavailable", message: "帳號服務暫時無法使用" }, 503);

const authBodyLimit = bodyLimit({
  maxSize: MAX_JSON_BYTES,
  onError: (c) => c.json({ error: "payload_too_large", message: "請求內容過大" }, 413),
});

const parseJson = async (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => null);

const accountRow = async (db: typeof sql, userId: string, nickname: string) => {
  await db`insert into account_data (user_id) values (${userId}) on conflict (user_id) do nothing`;
  const rows = await db`select list, favs, settings, profile, updated_at from account_data where user_id = ${userId}`;
  if (!rows[0]) throw new Error("account_data_missing_after_upsert");
  return accountDataFromStorage(rows[0] as Record<string, unknown>, nickname);
};

const insertSession = async (db: typeof sql, userId: string) => {
  const sessionToken = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db`insert into auth_sessions (id, user_id, token_hash, expires_at)
    values (${crypto.randomUUID()}, ${userId}, ${hashToken(sessionToken)}, ${expiresAt})`;
  return { sessionToken, expiresAt };
};

const authPayload = (user: User, data: AccountData, sessionToken: string, expiresAt: Date): AuthResponse => ({
  user,
  session_token: sessionToken,
  expires_at: expiresAt.toISOString(),
  data,
});

export const requireUser: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(header);
  if (!match?.[1]) return unauthorized(c);
  if (!dbConfigured()) return unavailable(c);

  try {
    const rows = await sql`select s.id as session_id, u.id, u.username, u.nickname
      from auth_sessions s
      join users u on u.id = s.user_id
      where s.token_hash = ${hashToken(match[1])}
        and s.revoked_at is null
        and s.expires_at > now()
      limit 1`;
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return unauthorized(c);
    c.set("user", userFromRow(row));
    c.set("authSessionId", String(row.session_id));
  } catch (error) {
    console.error("auth_session_failed", error instanceof Error ? error.name : "unknown_error");
    return unavailable(c);
  }
  await next();
};

export const auth = new Hono<{ Variables: AuthVariables }>();

auth.post("/api/auth/register", authBodyLimit, async (c) => {
  const body = registerRequestSchema.safeParse(await parseJson(c));
  if (!body.success) return c.json({ error: "invalid_request", message: "註冊資料格式錯誤" }, 400);
  if (!dbConfigured()) return unavailable(c);

  const userId = crypto.randomUUID();
  const storedNickname = body.data.nickname ?? null;

  try {
    const passwordHash = await Bun.password.hash(body.data.password, { algorithm: "argon2id" });
    const result = await sql.begin(async (tx) => {
      const rows = await tx`insert into users (id, username, password_hash, nickname)
        values (${userId}, ${body.data.username}, ${passwordHash}, ${storedNickname})
        returning id, username, nickname`;
      const user = userFromRow(rows[0] as Record<string, unknown>);
      const data = await accountRow(tx as typeof sql, userId, user.nickname);
      const session = await insertSession(tx as typeof sql, userId);
      return { user, data, ...session };
    });
    return c.json(authPayload(result.user, result.data, result.sessionToken, result.expiresAt), 201);
  } catch (error) {
    if (pgCode(error) === "23505") {
      return c.json({ error: "username_taken", message: "此帳號名稱已被使用" }, 409);
    }
    console.error("auth_register_failed", error instanceof Error ? error.name : "unknown_error");
    return unavailable(c);
  }
});

auth.post("/api/auth/login", authBodyLimit, async (c) => {
  const body = loginRequestSchema.safeParse(await parseJson(c));
  if (!body.success) return c.json({ error: "invalid_request", message: "登入資料格式錯誤" }, 400);

  const username = normalizeUsername(body.data.username);
  const blocked = loginFailures.state(username);
  if (blocked && blocked.n >= LOGIN_FAILURE_LIMIT) {
    return c.json({ error: "rate_limited", message: "嘗試次數過多，請稍後再試" }, 429);
  }

  const syntacticallyValid = USERNAME_PATTERN.test(username) && body.data.password.length >= 12;
  if (!syntacticallyValid) {
    await Bun.password.verify(body.data.password, FAKE_PASSWORD_HASH);
    const limited = loginFailures.record(username);
    return limited
      ? c.json({ error: "rate_limited", message: "嘗試次數過多，請稍後再試" }, 429)
      : c.json({ error: "invalid_credentials", message: "帳號或密碼錯誤" }, 401);
  }
  if (!dbConfigured()) return unavailable(c);

  try {
    const rows = await sql`select id, username, nickname, password_hash from users where username = ${username} limit 1`;
    const row = rows[0] as Record<string, unknown> | undefined;
    const valid = await Bun.password.verify(body.data.password, row ? String(row.password_hash) : FAKE_PASSWORD_HASH);
    if (!row || !valid) {
      const limited = loginFailures.record(username);
      return limited
        ? c.json({ error: "rate_limited", message: "嘗試次數過多，請稍後再試" }, 429)
        : c.json({ error: "invalid_credentials", message: "帳號或密碼錯誤" }, 401);
    }

    const result = await sql.begin(async (tx) => {
      // Serialize session creation with password changes. The first password check avoids
      // holding this row lock for ordinary bad-password attempts; this locked check closes
      // the old-password-login-after-revocation race.
      const lockedRows = await tx`select id, username, nickname, password_hash
        from users where id = ${String(row.id)} for update`;
      const lockedRow = lockedRows[0] as Record<string, unknown> | undefined;
      const stillValid = lockedRow
        && await Bun.password.verify(body.data.password, String(lockedRow.password_hash));
      if (!lockedRow || !stillValid) return null;

      const user = userFromRow(lockedRow);
      const data = await accountRow(tx as typeof sql, user.id, user.nickname);
      const session = await insertSession(tx as typeof sql, user.id);
      return { user, data, ...session };
    });
    if (!result) {
      const limited = loginFailures.record(username);
      return limited
        ? c.json({ error: "rate_limited", message: "嘗試次數過多，請稍後再試" }, 429)
        : c.json({ error: "invalid_credentials", message: "帳號或密碼錯誤" }, 401);
    }
    loginFailures.success(username);
    return c.json(authPayload(result.user, result.data, result.sessionToken, result.expiresAt));
  } catch (error) {
    console.error("auth_login_failed", error instanceof Error ? error.name : "unknown_error");
    return unavailable(c);
  }
});

auth.get("/api/auth/me", requireUser, async (c) => {
  try {
    const data = await sql.begin((tx) => accountRow(tx as typeof sql, c.var.user.id, c.var.user.nickname));
    return c.json({ user: c.var.user, data });
  } catch (error) {
    console.error("auth_me_failed", error instanceof Error ? error.name : "unknown_error");
    return unavailable(c);
  }
});

auth.post("/api/auth/logout", requireUser, async (c) => {
  try {
    await sql`update auth_sessions set revoked_at = now()
      where id = ${c.var.authSessionId} and revoked_at is null`;
    return c.body(null, 204);
  } catch (error) {
    console.error("auth_logout_failed", error instanceof Error ? error.name : "unknown_error");
    return unavailable(c);
  }
});

auth.post("/api/auth/change-password", requireUser, authBodyLimit, async (c) => {
  const body = changePasswordRequestSchema.safeParse(await parseJson(c));
  if (!body.success) return c.json({ error: "invalid_password", message: "密碼格式錯誤" }, 400);

  try {
    const nextHash = await Bun.password.hash(body.data.new_password, { algorithm: "argon2id" });
    const result = await sql.begin(async (tx) => {
      // User-row locking gives login and every concurrent password change one ordering.
      // Re-read the caller's session after acquiring it so a session revoked while waiting
      // cannot authorize a password update.
      const users = await tx`select password_hash from users where id = ${c.var.user.id} for update`;
      if (!users[0]) return "unauthorized" as const;
      const sessions = await tx`select id from auth_sessions
        where id = ${c.var.authSessionId}
          and user_id = ${c.var.user.id}
          and revoked_at is null
          and expires_at > now()
        for update`;
      if (!sessions[0]) return "unauthorized" as const;

      const valid = await Bun.password.verify(
        body.data.current_password,
        String((users[0] as Record<string, unknown>).password_hash),
      );
      if (!valid) return "invalid_password" as const;

      await tx`update users set password_hash = ${nextHash}, updated_at = now() where id = ${c.var.user.id}`;
      await tx`update auth_sessions set revoked_at = now()
        where user_id = ${c.var.user.id} and revoked_at is null`;
      return "changed" as const;
    });
    if (result === "unauthorized") return unauthorized(c);
    if (result === "invalid_password") {
      return c.json({ error: "invalid_credentials", message: "目前密碼錯誤" }, 401);
    }
    return c.body(null, 204);
  } catch (error) {
    console.error("auth_change_password_failed", error instanceof Error ? error.name : "unknown_error");
    return unavailable(c);
  }
});
