import { describe, expect, test } from "bun:test";
import type { MiddlewareHandler } from "hono";
import { app } from "../src/server/index.ts";
import {
  buildGroupOfferMineParticipations,
  createGroupOfferRouter,
  parseGroupOfferIds,
  type GroupOfferMember,
  type GroupOfferParticipation,
  type GroupOfferProgress,
  type GroupOfferStore,
} from "../src/server/group-offer-memberships.ts";
import type { AuthVariables } from "../src/server/auth.ts";
import type { User } from "../src/shared/account.ts";
import type { Rec } from "../src/shared/records.ts";

const alice: User = { id: "alice", username: "alice", nickname: "Alice" };
const bob: User = { id: "bob", username: "bob", nickname: "Bob" };

const authAs = (user: User): MiddlewareHandler<{ Variables: AuthVariables }> => async (c, next) => {
  c.set("user", user);
  c.set("authSessionId", `session-${user.id}`);
  await next();
};

const progress = (candidate_id: string, joined_count: number, capacity = 5): GroupOfferProgress => ({
  candidate_id,
  capacity,
  joined_count,
  remaining_count: Math.max(capacity - joined_count, 0),
  full: joined_count >= capacity,
});

const member = (username: string, is_self: boolean, joined_at = "2026-09-05T12:00:00.000Z"): GroupOfferMember => ({
  username,
  nickname: username === "alice" ? "Alice" : "Bob",
  joined_at,
  is_self,
});

const participation = (
  candidate_id: string,
  joined: boolean,
  joined_count: number,
  members: GroupOfferMember[] | null,
): GroupOfferParticipation => ({
  ...progress(candidate_id, joined_count),
  joined,
  members,
});

const groupOfferRecord = (id: string, valid_until: string | null): Rec => ({
  id,
  category: "食品",
  title: "團購測試優惠",
  provider: "測試商家",
  price_total_twd: 100,
  mandatory_fees_twd: 0,
  discount_twd: 0,
  price_unit: "每人",
  quantity_or_servings: "1 份",
  eligibility: [],
  registration_required: false,
  availability_or_event_time: "全天",
  distance_or_time_text: null,
  address: null,
  lat: null,
  lng: null,
  valid_until: null,
  source_url: "https://merchant.test-shop.tw/group-offer",
  source_type: "curated",
  source_authority: "provider",
  evidence: [],
  collected_at: "2026-09-05T12:00:00.000Z",
  verified_at: "2026-09-05T12:00:00.000Z",
  data_status: "已驗證",
  agent: "paid",
  action_label: null,
  action_url: null,
  extra: {
    group_offer_terms: { redemption_method: "現場核對團購人數", valid_until },
    group_offer_evidence: [{
      field: "團購優惠",
      quote: "五人同行享團購價。",
      url: "https://merchant.test-shop.tw/group-offer",
      checked_at: "2026-09-05T12:00:00.000Z",
    }],
  },
  baseline: null,
  tags: null,
  group_offer: { min_people: 5, price_per_person: 80, redeem_code: "TEAM5", note: "五人同行享優惠" },
  distance_km: null,
  reason: null,
});

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const request = (router: ReturnType<typeof createGroupOfferRouter>, path: string, init?: RequestInit) =>
  router.request(path, init);

describe("group offer membership id parsing", () => {
  test("deduplicates ids and validates the unique-id cap before database access", () => {
    expect(parseGroupOfferIds("offer-a,offer-a, offer-b")).toEqual(["offer-a", "offer-b"]);
    expect(parseGroupOfferIds(" ")).toEqual([]);
    expect(parseGroupOfferIds("not valid")).toBeNull();
    expect(parseGroupOfferIds(Array.from({ length: 101 }, (_, i) => `offer-${i}`).join(","))).toBeNull();
  });
});

describe("group offer membership router", () => {
  test("mine keeps an expired joined offer for leaving but hides an expired non-member", () => {
    const now = Date.parse("2026-09-05T15:30:00.000Z");
    const offers = buildGroupOfferMineParticipations(
      [
        { record: groupOfferRecord("offer-expired-joined", "2026-09-04T00:00:00.000Z"), joined_count: 1 },
        { record: groupOfferRecord("offer-expired-not-joined", "2026-09-04T00:00:00.000Z"), joined_count: 1 },
      ],
      new Map([
        ["offer-expired-joined", [member("alice", true), member("bob", false, "2026-09-05T12:01:00.000Z")]],
        ["offer-expired-not-joined", [member("bob", false)]],
      ]),
      now,
    );

    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      candidate_id: "offer-expired-joined",
      joined: true,
      joined_count: 2,
    });
    expect(offers[0]?.members).toHaveLength(2);
    expect(offers[0]?.members?.some(member => member.username === "bob")).toBe(true);
  });

  test("mine uses members.length for joined progress but keeps public count for non-members", () => {
    const now = Date.parse("2026-09-05T15:30:00.000Z");
    const offers = buildGroupOfferMineParticipations(
      [
        { record: groupOfferRecord("offer-joined", null), joined_count: 1 },
        { record: groupOfferRecord("offer-public", null), joined_count: 3 },
      ],
      new Map([
        ["offer-joined", [member("alice", true), member("bob", false, "2026-09-05T12:01:00.000Z")]],
        ["offer-public", [member("bob", false)]],
      ]),
      now,
    );

    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ candidate_id: "offer-joined", joined: true, joined_count: 2 });
    expect(offers[0]?.members).toHaveLength(2);
    expect(offers[1]).toEqual(participation("offer-public", false, 3, null));
  });

  test("public status returns progress only and never member identity", async () => {
    let requested: string[] = [];
    const store: GroupOfferStore = {
      status: async ids => {
        requested = ids;
        return [progress("offer-a", 1)];
      },
      mine: async () => [],
      join: async () => ({ kind: "not_found" }),
      leave: async () => ({ kind: "not_found" }),
    };
    const router = createGroupOfferRouter({ store, configured: () => true });

    const response = await request(router, "/api/group-offers/status?ids=offer-a,offer-a,offer-b");
    expect(response.status).toBe(200);
    expect(requested).toEqual(["offer-a", "offer-b"]);
    expect(await response.json()).toEqual({ offers: [progress("offer-a", 1)] });
    expect(await response.text().catch(() => "")).toBe("");
  });

  test("invalid ids and more than 100 unique ids are rejected without querying the store", async () => {
    let reads = 0;
    const store: GroupOfferStore = {
      status: async () => { reads += 1; return []; },
      mine: async () => { reads += 1; return []; },
      join: async () => ({ kind: "not_found" }),
      leave: async () => ({ kind: "not_found" }),
    };
    const router = createGroupOfferRouter({ store, configured: () => true, authenticate: authAs(alice) });

    const invalid = await request(router, "/api/group-offers/status?ids=bad%20id");
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe("invalid_request");

    const tooMany = await request(router, `/api/group-offers/mine?ids=${Array.from({ length: 101 }, (_, i) => `x${i}`).join(",")}`, {
      headers: { authorization: "Bearer test-token-that-is-not-used" },
    });
    expect(tooMany.status).toBe(400);
    expect((await tooMany.json()).error).toBe("invalid_request");
    expect(reads).toBe(0);
  });

  test("mine exposes members only after the requester has joined", async () => {
    const store: GroupOfferStore = {
      status: async () => [],
      mine: async (_ids, userId) => [
        participation("offer-not-joined", false, 1, null),
        participation("offer-joined", true, 2, [member("alice", userId === alice.id), member("bob", false, "2026-09-05T12:01:00.000Z")]),
      ],
      join: async () => ({ kind: "not_found" }),
      leave: async () => ({ kind: "not_found" }),
    };
    const router = createGroupOfferRouter({ store, configured: () => true, authenticate: authAs(alice) });

    const response = await request(router, "/api/group-offers/mine?ids=offer-not-joined,offer-joined");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      offers: [
        participation("offer-not-joined", false, 1, null),
        participation("offer-joined", true, 2, [member("alice", true), member("bob", false, "2026-09-05T12:01:00.000Z")]),
      ],
    });
    const joinedPayload = await (await request(router, "/api/group-offers/mine?ids=offer-joined")).json() as { offers: GroupOfferParticipation[] };
    expect(Object.keys(joinedPayload.offers[1]?.members?.[0] ?? {})).toEqual(["username", "nickname", "joined_at", "is_self"]);
  });

  test("join maps full, unavailable, and missing outcomes and keeps the full message stable", async () => {
    const store: GroupOfferStore = {
      status: async () => [],
      mine: async () => [],
      join: async id => id === "full"
        ? { kind: "full" }
        : id === "unavailable"
          ? { kind: "unavailable" }
          : { kind: "not_found" },
      leave: async () => ({ kind: "not_found" }),
    };
    const router = createGroupOfferRouter({ store, configured: () => true, authenticate: authAs(alice) });

    const full = await request(router, "/api/group-offers/full/join", json(null));
    expect(full.status).toBe(409);
    expect(await full.json()).toEqual({ error: "group_full", message: "這一團已滿，請等待有人退出。" });

    const unavailable = await request(router, "/api/group-offers/unavailable/join", json(null));
    expect(unavailable.status).toBe(409);
    expect((await unavailable.json()).message).toContain("目前無法使用");

    const missing = await request(router, "/api/group-offers/missing/join", json(null));
    expect(missing.status).toBe(404);
  });

  test("join is idempotent and leave is idempotent in a small in-memory store", async () => {
    const members = new Set<string>();
    const build = (userId: string, joined: boolean): GroupOfferParticipation => participation(
      "offer-a",
      joined,
      members.size,
      joined ? [...members].map(id => member(id, id === userId)) : null,
    );
    const store: GroupOfferStore = {
      status: async () => [progress("offer-a", members.size)],
      mine: async (_ids, userId) => [build(userId, members.has(userId))],
      join: async (_id, userId) => {
        if (members.size >= 2 && !members.has(userId)) return { kind: "full" };
        members.add(userId);
        return build(userId, true);
      },
      leave: async (_id, userId) => {
        members.delete(userId);
        return build(userId, false);
      },
    };
    const router = createGroupOfferRouter({ store, configured: () => true, authenticate: authAs(alice) });

    const first = await request(router, "/api/group-offers/offer-a/join", json(null));
    const duplicate = await request(router, "/api/group-offers/offer-a/join", json(null));
    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json()).joined_count).toBe(1);

    const left = await request(router, "/api/group-offers/offer-a/join", { method: "DELETE" });
    const duplicateLeave = await request(router, "/api/group-offers/offer-a/join", { method: "DELETE" });
    expect(left.status).toBe(200);
    expect(duplicateLeave.status).toBe(200);
    expect(await duplicateLeave.json()).toMatchObject({ joined: false, members: null, joined_count: 0 });
  });

  test("protected routes require authentication and database failures are sanitized", async () => {
    const store: GroupOfferStore = {
      status: async () => { throw new Error("private connection string"); },
      mine: async () => [],
      join: async () => ({ kind: "not_found" }),
      leave: async () => ({ kind: "not_found" }),
    };
    const router = createGroupOfferRouter({ store, configured: () => true });

    const unauthorized = await request(router, "/api/group-offers/mine?ids=offer-a");
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ error: "unauthorized", message: "請重新登入" });

    const failing = createGroupOfferRouter({ store, configured: () => true, authenticate: authAs(alice) });
    const response = await request(failing, "/api/group-offers/status?ids=offer-a");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "database_unavailable", message: "團購服務暫時無法使用" });
  });

  test("the production app wires the route before its API catch-all", async () => {
    const response = await app.request("/api/group-offers/status?ids=bad%20id");
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_request");
  });
});
