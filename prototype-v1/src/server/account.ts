import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  accountDataFromStorage,
  accountDataUpdateSchema,
  candidateParamSchema,
  reportRequestSchema,
  type CandidateReport,
} from "../shared/account.ts";
import { requireUser, type AuthVariables } from "./auth.ts";
import { dbConfigured, sql } from "./db.ts";

const MAX_JSON_BYTES = 16 * 1024;

const unavailable = (c: { json: (body: unknown, status: 503) => Response }) =>
  c.json({ error: "database_unavailable", message: "帳號服務暫時無法使用" }, 503);

const accountBodyLimit = bodyLimit({
  maxSize: MAX_JSON_BYTES,
  onError: (c) => c.json({ error: "payload_too_large", message: "請求內容過大" }, 413),
});

const parseJson = async (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => null);

const accountRow = async (userId: string, nickname: string) => {
  await sql`insert into account_data (user_id) values (${userId}) on conflict (user_id) do nothing`;
  const rows = await sql`select list, favs, settings, profile, updated_at from account_data where user_id = ${userId}`;
  if (!rows[0]) throw new Error("account_data_missing_after_upsert");
  return accountDataFromStorage(rows[0] as Record<string, unknown>, nickname);
};

const asIso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
const reportFromRow = (row: Record<string, unknown>): CandidateReport => ({
  id: String(row.id),
  candidate_id: String(row.candidate_id),
  reason: row.reason as CandidateReport["reason"],
  note: String(row.note),
  created_at: asIso(row.created_at),
  by: String(row.by),
});

export const account = new Hono<{ Variables: AuthVariables }>();

account.get("/api/me/data", requireUser, async (c) => {
  try {
    return c.json(await accountRow(c.var.user.id, c.var.user.nickname));
  } catch (error) {
    console.error("account_read_failed", error instanceof Error ? error.name : "unknown_error");
    return unavailable(c);
  }
});

account.put("/api/me/data", requireUser, accountBodyLimit, async (c) => {
  const body = accountDataUpdateSchema.safeParse(await parseJson(c));
  if (!body.success) return c.json({ error: "invalid_account_data", message: "帳號資料格式錯誤" }, 400);

  const { list, favs, settings, profile } = body.data;
  try {
    const row = await sql.begin(async (tx) => {
      await tx`update users set nickname = ${profile.nickname}, updated_at = now()
        where id = ${c.var.user.id}`;
      const rows = await tx`insert into account_data (user_id, list, favs, settings, profile, updated_at)
        values (${c.var.user.id}, ${list}::jsonb, ${favs}::jsonb,
          ${settings}::jsonb, ${{ color: profile.color }}::jsonb, now())
        on conflict (user_id) do update set
          list = excluded.list,
          favs = excluded.favs,
          settings = excluded.settings,
          profile = excluded.profile,
          updated_at = now()
        returning list, favs, settings, profile, updated_at`;
      if (!rows[0]) throw new Error("account_data_missing_after_update");
      return rows[0] as Record<string, unknown>;
    });
    return c.json(accountDataFromStorage(row, profile.nickname));
  } catch (error) {
    console.error("account_write_failed", error instanceof Error ? error.name : "unknown_error");
    return unavailable(c);
  }
});

account.get("/api/candidates/:id/reports", async (c) => {
  const candidateId = candidateParamSchema.safeParse(c.req.param("id"));
  if (!candidateId.success) return c.json({ error: "invalid_request", message: "候選紀錄格式錯誤" }, 400);
  if (!dbConfigured()) return unavailable(c);

  try {
    const rows = await sql`select r.id, r.candidate_id, r.reason, r.note, r.created_at,
        coalesce(u.nickname, u.username) as by
      from reports r
      join users u on u.id = r.user_id
      where r.candidate_id = ${candidateId.data}
      order by r.created_at desc, r.id desc`;
    return c.json(rows.map((row: unknown) => reportFromRow(row as Record<string, unknown>)));
  } catch (error) {
    console.error("reports_read_failed", error instanceof Error ? error.name : "unknown_error");
    return unavailable(c);
  }
});

account.post("/api/candidates/:id/reports", requireUser, accountBodyLimit, async (c) => {
  const candidateId = candidateParamSchema.safeParse(c.req.param("id"));
  const body = reportRequestSchema.safeParse(await parseJson(c));
  if (!candidateId.success || !body.success) {
    return c.json({ error: "invalid_report", message: "回報格式錯誤" }, 400);
  }

  try {
    // INSERT ... SELECT makes candidate existence and report creation one atomic statement.
    const rows = await sql`insert into reports (candidate_id, user_id, reason, note)
      select id, ${c.var.user.id}, ${body.data.reason}, ${body.data.note}
      from candidates where id = ${candidateId.data}
      returning id, candidate_id, reason, note, created_at`;
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return c.json({ error: "not_found", message: "找不到這筆紀錄" }, 404);
    return c.json(reportFromRow({ ...row, by: c.var.user.nickname }), 201);
  } catch (error) {
    console.error("reports_write_failed", error instanceof Error ? error.name : "unknown_error");
    return unavailable(c);
  }
});
