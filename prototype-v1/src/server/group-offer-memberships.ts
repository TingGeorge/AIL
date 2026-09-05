import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { candidateParamSchema } from "../shared/account.ts";
import { canDisplayGroupOffer } from "../shared/group-offers.ts";
import { rowToRec, type Rec } from "../shared/records.ts";
import { dbConfigured, sql } from "./db.ts";
import { requireUser, type AuthVariables } from "./auth.ts";

export const MAX_GROUP_OFFER_IDS = 100;

export type GroupOfferProgress = {
  candidate_id: string;
  capacity: number;
  joined_count: number;
  remaining_count: number;
  full: boolean;
};

export type GroupOfferMember = {
  username: string;
  nickname: string;
  joined_at: string;
  is_self: boolean;
};

export type GroupOfferParticipation = GroupOfferProgress & {
  joined: boolean;
  members: GroupOfferMember[] | null;
};

type GroupOfferJoinFailure =
  | { kind: "not_found" }
  | { kind: "unavailable" }
  | { kind: "full" };

type GroupOfferLeaveFailure = { kind: "not_found" };

export type GroupOfferStore = {
  status: (candidateIds: string[]) => Promise<GroupOfferProgress[]>;
  mine: (candidateIds: string[], userId: string) => Promise<GroupOfferParticipation[]>;
  join: (candidateId: string, userId: string) => Promise<GroupOfferParticipation | GroupOfferJoinFailure>;
  leave: (candidateId: string, userId: string) => Promise<GroupOfferParticipation | GroupOfferLeaveFailure>;
};

export type GroupOfferRouterOptions = {
  store?: GroupOfferStore;
  configured?: () => boolean;
  authenticate?: MiddlewareHandler<{ Variables: AuthVariables }>;
};

type CandidateRow = Record<string, unknown>;

type MembershipRow = CandidateRow & {
  candidate_id: unknown;
  user_id: unknown;
  username: unknown;
  nickname: unknown;
  joined_at: unknown;
};

const invalidRequest = (c: { json: (body: unknown, status: 400) => Response }) =>
  c.json({ error: "invalid_request", message: "選項資料格式錯誤，請重新整理後再試。" }, 400);

const databaseUnavailable = (c: { json: (body: unknown, status: 503) => Response }) =>
  c.json({ error: "database_unavailable", message: "團購服務暫時無法使用" }, 503);

const missingOffer = (c: { json: (body: unknown, status: 404) => Response }) =>
  c.json({ error: "not_found", message: "找不到這筆團購優惠" }, 404);

const unavailableOffer = (c: { json: (body: unknown, status: 409) => Response }) =>
  c.json({ error: "group_offer_unavailable", message: "這個團購優惠目前無法使用，請重新整理後再試。" }, 409);

const fullOffer = (c: { json: (body: unknown, status: 409) => Response }) =>
  c.json({ error: "group_full", message: "這一團已滿，請等待有人退出。" }, 409);

const asIso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);

const positiveCapacity = (record: Rec) => {
  const capacity = record.group_offer?.min_people;
  if (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity <= 0) return 0;
  return capacity;
};

const joinedCount = (value: unknown) => {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : 0;
};

const progressOf = (record: Rec, count: unknown): GroupOfferProgress => {
  const capacity = positiveCapacity(record);
  const joined_count = joinedCount(count);
  return {
    candidate_id: record.id,
    capacity,
    joined_count,
    remaining_count: Math.max(capacity - joined_count, 0),
    full: joined_count >= capacity,
  };
};

const membershipOf = (row: MembershipRow, userId: string): GroupOfferMember => ({
  username: String(row.username),
  nickname: String(row.nickname ?? row.username),
  joined_at: asIso(row.joined_at),
  is_self: String(row.user_id) === userId,
});

const sortMembers = (members: GroupOfferMember[]) => members.sort((a, b) => {
  const joinedDifference = Date.parse(a.joined_at) - Date.parse(b.joined_at);
  return (Number.isNaN(joinedDifference) ? a.joined_at.localeCompare(b.joined_at) : joinedDifference)
    || a.username.localeCompare(b.username);
});

const participationOf = (
  record: Rec,
  count: unknown,
  joined: boolean,
  members: GroupOfferMember[] | null,
): GroupOfferParticipation => ({
  ...progressOf(record, count),
  joined,
  members: joined ? sortMembers(members ?? []) : null,
});

export type GroupOfferMineCandidate = {
  record: Rec;
  joined_count: unknown;
};

/**
 * Project the membership rows returned by `/mine` without exposing unavailable
 * offers to users who are not already members. Joined progress deliberately
 * comes from the same member list that is returned to the requester, while a
 * non-member may still receive the public count for a currently displayable
 * offer.
 */
export const buildGroupOfferMineParticipations = (
  candidates: GroupOfferMineCandidate[],
  membersByCandidate: ReadonlyMap<string, GroupOfferMember[]>,
  now = Date.now(),
): GroupOfferParticipation[] => candidates.flatMap(({ record, joined_count }) => {
  const members = membersByCandidate.get(record.id) ?? [];
  const joined = members.some(member => member.is_self);
  if (!canDisplayGroupOffer(record, now) && !joined) return [];

  const joinedMembers = joined ? [...members] : null;
  return [participationOf(record, joined ? members.length : joined_count, joined, joinedMembers)];
});

/** Parse and validate the comma-separated candidate id query without touching the database. */
export const parseGroupOfferIds = (raw: string | undefined): string[] | null => {
  const values = (raw ?? "").split(",").map(value => value.trim()).filter(Boolean);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!candidateParamSchema.safeParse(value).success) return null;
    if (!seen.has(value)) {
      seen.add(value);
      ids.push(value);
    }
  }
  return ids.length <= MAX_GROUP_OFFER_IDS ? ids : null;
};

const candidateRowsWithCounts = async (db: typeof sql, candidateIds: string[]) =>
  db`select c.*, count(m.user_id)::int as joined_count
     from candidates c
     left join group_offer_memberships m on m.candidate_id = c.id
     where c.id = any(${sql.array(candidateIds, "text")})
     group by c.id`;

const visibleCandidates = (rows: CandidateRow[], now = Date.now()) => rows
  .map(row => ({ row, record: rowToRec(row) }))
  .filter(({ record }) => canDisplayGroupOffer(record, now));

const membershipRows = async (db: typeof sql, candidateId: string) =>
  db`select m.candidate_id, m.user_id, m.joined_at, u.username,
        coalesce(u.nickname, u.username) as nickname
     from group_offer_memberships m
     join users u on u.id = m.user_id
     where m.candidate_id = ${candidateId}
     order by m.joined_at asc, u.username asc` as unknown as MembershipRow[];

const countMemberships = async (db: typeof sql, candidateId: string) => {
  const rows = await db`select count(*)::int as joined_count
    from group_offer_memberships where candidate_id = ${candidateId}`;
  return joinedCount((rows[0] as CandidateRow | undefined)?.joined_count);
};

export const createSqlGroupOfferStore = (): GroupOfferStore => ({
  async status(candidateIds) {
    if (candidateIds.length === 0) return [];
    const visible = visibleCandidates(await candidateRowsWithCounts(sql, candidateIds) as unknown as CandidateRow[]);
    return visible.map(({ row, record }) => progressOf(record, row.joined_count));
  },

  async mine(candidateIds, userId) {
    if (candidateIds.length === 0) return [];
    const candidateRows = await candidateRowsWithCounts(sql, candidateIds) as unknown as CandidateRow[];
    const candidates = candidateRows.map(row => ({ row, record: rowToRec(row) }));
    if (candidates.length === 0) return [];

    const ids = candidates.map(({ record }) => record.id);
    const memberRows = await sql`select m.candidate_id, m.user_id, m.joined_at, u.username,
          coalesce(u.nickname, u.username) as nickname
       from group_offer_memberships m
       join users u on u.id = m.user_id
       where m.candidate_id = any(${sql.array(ids, "text")})
       order by m.candidate_id, m.joined_at asc, u.username asc` as unknown as MembershipRow[];
    const byCandidate = new Map<string, GroupOfferMember[]>();
    for (const row of memberRows) {
      const id = String(row.candidate_id);
      const members = byCandidate.get(id) ?? [];
      members.push(membershipOf(row, userId));
      byCandidate.set(id, members);
    }

    return buildGroupOfferMineParticipations(
      candidates.map(({ row, record }) => ({ record, joined_count: row.joined_count })),
      byCandidate,
    );
  },

  async join(candidateId, userId) {
    return sql.begin(async transaction => {
      const db = transaction as typeof sql;
      const rows = await db`select * from candidates where id = ${candidateId} for update`;
      const row = rows[0] as CandidateRow | undefined;
      if (!row) return { kind: "not_found" } as const;

      const record = rowToRec(row);
      if (!canDisplayGroupOffer(record)) return { kind: "unavailable" } as const;

      const existing = await db`select 1 from group_offer_memberships
        where candidate_id = ${candidateId} and user_id = ${userId}`;
      if (existing[0]) {
        const members = (await membershipRows(db, candidateId)).map(member => membershipOf(member, userId));
        return participationOf(record, members.length, true, members);
      }

      const count = await countMemberships(db, candidateId);
      if (count >= positiveCapacity(record)) return { kind: "full" } as const;

      await db`insert into group_offer_memberships (candidate_id, user_id)
        values (${candidateId}, ${userId}) on conflict (candidate_id, user_id) do nothing`;
      const members = (await membershipRows(db, candidateId)).map(member => membershipOf(member, userId));
      return participationOf(record, members.length, true, members);
    });
  },

  async leave(candidateId, userId) {
    return sql.begin(async transaction => {
      const db = transaction as typeof sql;
      const rows = await db`select * from candidates where id = ${candidateId} for update`;
      const row = rows[0] as CandidateRow | undefined;
      if (!row) return { kind: "not_found" } as const;

      await db`delete from group_offer_memberships
        where candidate_id = ${candidateId} and user_id = ${userId}`;
      const record = rowToRec(row);
      return participationOf(record, await countMemberships(db, candidateId), false, null);
    });
  },
});

export function createGroupOfferRouter(options: GroupOfferRouterOptions = {}) {
  const store = options.store ?? createSqlGroupOfferStore();
  const configured = options.configured ?? dbConfigured;
  const authenticate = options.authenticate ?? requireUser;
  const router = new Hono<{ Variables: AuthVariables }>();

  router.get("/api/group-offers/status", async c => {
    const ids = parseGroupOfferIds(c.req.query("ids"));
    if (ids === null) return invalidRequest(c);
    if (ids.length === 0) return c.json({ offers: [] });
    if (!configured()) return databaseUnavailable(c);
    try {
      return c.json({ offers: await store.status(ids) });
    } catch (error) {
      console.error("group_offer_status_failed", error instanceof Error ? error.name : "unknown_error");
      return databaseUnavailable(c);
    }
  });

  router.get("/api/group-offers/mine", authenticate, async c => {
    const ids = parseGroupOfferIds(c.req.query("ids"));
    if (ids === null) return invalidRequest(c);
    if (ids.length === 0) return c.json({ offers: [] });
    if (!configured()) return databaseUnavailable(c);
    try {
      return c.json({ offers: await store.mine(ids, c.var.user.id) });
    } catch (error) {
      console.error("group_offer_mine_failed", error instanceof Error ? error.name : "unknown_error");
      return databaseUnavailable(c);
    }
  });

  router.post("/api/group-offers/:id/join", authenticate, async c => {
    const candidateId = candidateParamSchema.safeParse(c.req.param("id"));
    if (!candidateId.success) return invalidRequest(c);
    if (!configured()) return databaseUnavailable(c);
    try {
      const result = await store.join(candidateId.data, c.var.user.id);
      if ("kind" in result) {
        if (result.kind === "not_found") return missingOffer(c);
        if (result.kind === "unavailable") return unavailableOffer(c);
        return fullOffer(c);
      }
      return c.json(result);
    } catch (error) {
      console.error("group_offer_join_failed", error instanceof Error ? error.name : "unknown_error");
      return databaseUnavailable(c);
    }
  });

  router.delete("/api/group-offers/:id/join", authenticate, async c => {
    const candidateId = candidateParamSchema.safeParse(c.req.param("id"));
    if (!candidateId.success) return invalidRequest(c);
    if (!configured()) return databaseUnavailable(c);
    try {
      const result = await store.leave(candidateId.data, c.var.user.id);
      if ("kind" in result && result.kind === "not_found") return missingOffer(c);
      return c.json(result);
    } catch (error) {
      console.error("group_offer_leave_failed", error instanceof Error ? error.name : "unknown_error");
      return databaseUnavailable(c);
    }
  });

  return router;
}

export const groupOffers = createGroupOfferRouter();
