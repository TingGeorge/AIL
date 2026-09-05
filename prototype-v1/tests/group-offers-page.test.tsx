import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GroupOffersContent,
  mergeGroupOfferProgress,
  type GroupOffersProgressState,
  type GroupOffersState,
} from "../src/client/GroupOffers.tsx";
import {
  ApiError,
  groupOfferMine,
  groupOfferStatus,
  joinGroupOffer,
  leaveGroupOffer,
  type GroupOfferParticipation,
} from "../src/client/api.ts";
import { groupOfferRefreshForError } from "../src/client/GroupOffers.tsx";
import type { Rec } from "../src/shared/records.ts";

const checkedAt = "2026-09-05T08:00:00+08:00";
const offer = (overrides: Partial<Rec> = {}): Rec => ({
  id: "group-offer",
  category: "食品",
  agent: "paid",
  title: "四人分享餐",
  provider: "官方合作店家",
  price_total_twd: 800,
  mandatory_fees_twd: 0,
  discount_twd: 0,
  price_unit: "每組",
  quantity_or_servings: "四人份",
  eligibility: [],
  registration_required: false,
  availability_or_event_time: "依官方公告",
  valid_until: null,
  address: null,
  lat: null,
  lng: null,
  distance_or_time_text: null,
  tags: null,
  source_type: "curated",
  source_authority: "provider",
  source_url: "https://offers.gov.tw/group-meal",
  evidence: [],
  collected_at: checkedAt,
  verified_at: checkedAt,
  data_status: "已驗證",
  action_url: null,
  action_label: null,
  baseline: null,
  group_offer: {
    min_people: 4,
    price_per_person: 180,
    redeem_code: "TEAM-180",
    note: "四人同行並於結帳前出示優惠碼。",
  },
  extra: {
    scope: "臺北門市內用",
    group_offer_terms: {
      redemption_method: "結帳前出示優惠碼",
      valid_until: null,
    },
    group_offer_evidence: [{
      field: "價格",
      quote: "四人同行每人180元。",
      url: "https://offers.gov.tw/group-meal",
      checked_at: checkedAt,
    }],
  },
  ...overrides,
});

const participation = (overrides: Partial<GroupOfferParticipation> = {}): GroupOfferParticipation => ({
  candidate_id: "group-offer",
  capacity: 4,
  joined_count: 1,
  remaining_count: 3,
  full: false,
  joined: false,
  members: null,
  ...overrides,
});

const progressState = (value: GroupOfferParticipation = participation()): GroupOffersProgressState => ({
  status: "ready",
  offers: { [value.candidate_id]: value },
});

type RenderOptions = {
  token?: string | null;
  progressState?: GroupOffersProgressState;
  memberOpenIds?: string[];
};

const renderState = (state: GroupOffersState, options: RenderOptions = {}) => renderToStaticMarkup(
  <GroupOffersContent
    state={state}
    onRetry={() => {}}
    onOpen={() => {}}
    token={options.token ?? null}
    onLogin={() => {}}
    onExpired={() => {}}
    progressState={options.progressState ?? { status: "loading", offers: {} }}
    onRetryProgress={() => {}}
    onToggleParticipation={() => {}}
    memberOpenIds={options.memberOpenIds}
  />,
);

test("loaded offers come from the browse catalog without requiring a login or prior search", () => {
  const visible = offer();
  const invalidMain = offer({ id: "ordinary", title: "一般方案", group_offer: null });
  const pending = offer({ id: "pending", title: "待確認優惠" });
  const html = renderState({
    status: "ready",
    result: { main: [visible, invalidMain], pending: [pending], excluded: [] },
  });

  expect(html).toContain("<h1>團購方案</h1>");
  expect(html).toContain("先瀏覽目前的團購方案");
  expect(html).toContain("登入後即可加入團購");
  expect(html).not.toContain("不提供組團");
  expect(html).toContain("lucide-ticket-percent");
  expect(html).not.toContain("lucide-users");
  expect(html).not.toContain("團購優惠");
  expect(html).not.toContain("GROUP OFFER");
  expect(html).toContain("四人分享餐");
  expect(html).not.toContain("一般方案");
  expect(html).not.toContain("待確認優惠");
});

test("loading, empty and error are three distinct page states", () => {
  const loading = renderState({ status: "loading" });
  expect(loading).toContain("<h1>團購方案</h1>");
  expect(loading).toContain('aria-busy="true"');
  expect(loading).toContain("正在載入團購方案");
  expect(loading).toContain('aria-live="polite"');
  expect(loading).not.toContain("目前沒有可顯示的團購方案");
  expect(loading).not.toContain('role="alert"');

  const empty = renderState({ status: "ready", result: { main: [], pending: [], excluded: [] } });
  expect(empty).toContain('class="empty-state"');
  expect(empty).toContain("目前沒有可顯示的團購方案");
  expect(empty).toContain("目前沒有符合條件的團購方案");
  expect(empty).toContain("lucide-ticket-percent");
  expect(empty).not.toContain("資料庫");
  expect(empty).not.toContain("來源");
  expect(empty).not.toContain("檢查");
  expect(empty).not.toContain("正在載入團購方案");
  expect(empty).not.toContain("重新載入");

  const failed = renderState({ status: "error", message: "連線中斷" });
  expect(failed).toContain("<h1>團購方案</h1>");
  expect(failed).toContain('role="alert"');
  expect(failed).toContain("連線中斷");
  expect(failed).toContain("重新載入");
  expect(failed).not.toContain("目前沒有可顯示的團購方案");
});

test("group-offer errors use product language without exposing internal terms", () => {
  const html = renderState({ status: "error", message: "這個團購優惠目前無法使用，資料庫暫時無法連線。" });
  expect(html).toContain("這個團購方案目前無法使用，服務暫時無法連線。");
  expect(html).not.toContain("團購優惠");
  expect(html).not.toContain("資料庫");
});

test("progress uses a clear joined-count summary and keeps stale progress hidden", () => {
  const html = renderState(
    { status: "ready", result: { main: [offer()], pending: [], excluded: [] } },
    { progressState: progressState(participation({ joined_count: 1, remaining_count: 3 })) },
  );

  expect(html).toContain("目前團購進度");
  expect(html).not.toContain("1 / 4 名額");
  expect(html).toContain("尚餘 3 個名額");
  expect(html).toContain("<progress");
  expect(html).toContain('max="4"');
  expect(html).toContain('aria-label="已加入 1 人／共 4 個名額"');
  expect(html).toContain("已加入 1 人／共 4 個名額");
  expect(html).toContain("四人分享餐");
});

test("anonymous users get a login CTA and never receive a member list", () => {
  const html = renderState(
    { status: "ready", result: { main: [offer()], pending: [], excluded: [] } },
    {
      progressState: progressState(participation({
        joined: false,
        members: [{ username: "alice", nickname: "Alice", joined_at: checkedAt, is_self: false }],
      })),
    },
  );

  expect(html).toContain("登入後加入團購");
  expect(html).not.toContain("查看同團成員");
  expect(html).not.toContain("Alice");
  expect(html).not.toContain("@alice");
});

test("joined users can see nickname, username and the current-user marker", () => {
  const html = renderState(
    { status: "ready", result: { main: [offer()], pending: [], excluded: [] } },
    {
      token: "session-token",
      progressState: progressState(participation({
        joined: true,
        members: [
          { username: "alice", nickname: "小艾", joined_at: checkedAt, is_self: true },
          { username: "bob", nickname: "小波", joined_at: checkedAt, is_self: false },
        ],
      })),
      memberOpenIds: ["group-offer"],
    },
  );

  expect(html).toContain("退出團購");
  expect(html).toContain("收起同團成員");
  expect(html).toContain('aria-label="收起 四人分享餐 的團員清單"');
  expect(html).toContain("lucide-users");
  expect(html).toContain("小艾");
  expect(html).toContain("@alice");
  expect(html).toContain("小波");
  expect(html).toContain("@bob");
  expect(html).toContain(">你<");
});

test("full groups block new joins but let an existing member leave", () => {
  const full = participation({ joined_count: 4, remaining_count: 0, full: true });
  const anonymousHtml = renderState(
    { status: "ready", result: { main: [offer()], pending: [], excluded: [] } },
    { progressState: progressState(full) },
  );
  expect(anonymousHtml).toContain("已成團，名額已滿");
  expect(anonymousHtml).not.toContain("登入後加入團購");
  expect(anonymousHtml).toContain("disabled");

  const memberHtml = renderState(
    { status: "ready", result: { main: [offer()], pending: [], excluded: [] } },
    { token: "session-token", progressState: progressState({ ...full, joined: true, members: [] }) },
  );
  expect(memberHtml).toContain("退出團購");
  expect(memberHtml).not.toMatch(/disabled[^>]*>退出團購/);
});

test("only joined members can see inactive pending offers, and they can only leave", () => {
  const inactive = offer({
    id: "inactive-offer",
    title: "已失效分享餐",
    extra: {
      scope: "臺北門市內用",
      group_offer_terms: { redemption_method: "結帳前出示優惠碼", valid_until: "2020-01-01T00:00:00+08:00" },
      group_offer_evidence: [{ field: "價格", quote: "四人同行每人180元。", url: "https://offers.gov.tw/group-meal", checked_at: checkedAt }],
    },
  });
  const catalog = { status: "ready" as const, result: { main: [], pending: [inactive], excluded: [] } };
  const joinedHtml = renderState(catalog, {
    token: "session-token",
    progressState: progressState(participation({ candidate_id: inactive.id, joined: true, members: [] })),
  });
  expect(joinedHtml).toContain("已失效分享餐");
  expect(joinedHtml).toContain("此團購方案已失效，目前只能退出");
  expect(joinedHtml).toContain("退出團購");
  expect(joinedHtml).not.toMatch(/class="group-offer-leave"[^>]*disabled/);

  const nonMemberHtml = renderState(catalog, {
    token: "session-token",
    progressState: progressState(participation({ candidate_id: inactive.id, joined: false, members: null })),
  });
  expect(nonMemberHtml).not.toContain("已失效分享餐");
  expect(nonMemberHtml).not.toContain("此團購方案已失效，目前只能退出");
});

test("stale joined progress and member identities stay hidden while progress is loading or failed", () => {
  const stale = participation({
    joined: true,
    members: [{ username: "alice", nickname: "小艾", joined_at: checkedAt, is_self: true }],
  });
  const state: GroupOffersState = { status: "ready", result: { main: [offer()], pending: [], excluded: [] } };
  const loadingHtml = renderState(state, {
    token: "session-token",
    progressState: { status: "loading", offers: { [stale.candidate_id]: stale } },
    memberOpenIds: [stale.candidate_id],
  });
  const errorHtml = renderState(state, {
    token: "session-token",
    progressState: { status: "error", offers: { [stale.candidate_id]: stale }, message: "暫時無法載入" },
    memberOpenIds: [stale.candidate_id],
  });

  expect(loadingHtml).toMatch(/class="group-offer-join"[^>]*disabled/);
  expect(errorHtml).toMatch(/class="group-offer-join"[^>]*disabled/);
  expect(loadingHtml).toContain("正在載入最新團購進度");
  expect(errorHtml).toContain("無法載入進度");
  expect(loadingHtml).toContain("暫時不顯示舊資料");
  expect(errorHtml).toContain("暫時不顯示舊資料");
  expect(loadingHtml).not.toContain("1 / 4 名額");
  expect(errorHtml).not.toContain("1 / 4 名額");
  expect(loadingHtml).not.toContain("小艾");
  expect(errorHtml).not.toContain("@alice");
});

test("joined progress and member list come from the same mine snapshot", () => {
  const merged = mergeGroupOfferProgress(
    ["group-offer"],
    [{ candidate_id: "group-offer", capacity: 4, joined_count: 4, remaining_count: 0, full: true }],
    [participation({
      joined: true,
      joined_count: 3,
      remaining_count: 1,
      full: false,
      members: [
        { username: "alice", nickname: "小艾", joined_at: checkedAt, is_self: true },
        { username: "bob", nickname: "小波", joined_at: checkedAt, is_self: false },
        { username: "carol", nickname: "小卡", joined_at: checkedAt, is_self: false },
      ],
    })],
  );

  expect(merged["group-offer"]).toMatchObject({
    joined: true,
    joined_count: 3,
    remaining_count: 1,
    full: false,
  });
  expect(merged["group-offer"]?.members).toHaveLength(3);
});

test("offer cards show the real threshold, price or discount, code status, validity and scope", () => {
  const priced = offer({
    extra: {
      scope: "臺北門市內用",
      group_offer_terms: { redemption_method: "結帳前出示優惠碼", valid_until: "2099-01-31T23:59:59+08:00" },
      group_offer_evidence: [{ field: "價格", quote: "四人同行每人180元。", url: "https://offers.gov.tw/group-meal", checked_at: checkedAt }],
    },
  });
  const discounted = offer({
    id: "group-discount",
    title: "六人同行折扣",
    category: "活動",
    group_offer: {
      min_people: 6,
      discount_pct: 15,
      redeem_code: null,
      note: "六人同行享原價85折。",
    },
    extra: {
      scope: "限週末指定場次",
      group_offer_terms: { redemption_method: "現場核對同行人數", valid_until: null },
      group_offer_evidence: [{ field: "價格", quote: "六人同行享85折。", url: "https://offers.gov.tw/group-meal", checked_at: checkedAt }],
    },
  });
  const html = renderState({ status: "ready", result: { main: [priced, discounted], pending: [], excluded: [] } });

  expect(html).toContain("一般價格：NT$800 · 計價單位：每組");
  expect(html).toContain("至少 4 人");
  expect(html).toContain("團購價：每人 NT$180");
  expect(html).toContain("TEAM-180");
  expect(html).toContain("2099/01/31");
  expect(html).toContain("臺北門市內用");
  expect(html).toContain("至少 6 人");
  expect(html).toContain("團購價：原價 8.5 折（省 15%）");
  expect(html).toContain("官方未提供優惠碼");
  expect(html).toContain("未公告截止日，以官方公告為準");
  expect(html).toContain("限週末指定場次");
  expect(html).toContain("六人同行享原價85折");

  const perPersonHtml = renderState({
    status: "ready",
    result: { main: [offer({ price_unit: "每人" })], pending: [], excluded: [] },
  });
  expect(perPersonHtml).toContain("一般價格：NT$800 · 計價單位：每人");
  expect(perPersonHtml).toContain("團購價：每人 NT$180");

  const freeHtml = renderState({
    status: "ready",
    result: {
      main: [offer({
        price_total_twd: 0,
        group_offer: { ...offer().group_offer!, price_per_person: 0 },
      })],
      pending: [],
      excluded: [],
    },
  });
  expect(freeHtml).toContain("一般價格：免費");
  expect(freeHtml).toContain("團購價：每人 免費");
  expect(freeHtml).not.toContain("NT$免費");

  const missingUnitHtml = renderState({
    status: "ready",
    result: { main: [offer({ price_unit: null })], pending: [], excluded: [] },
  });
  expect(missingUnitHtml).toContain("一般價格：NT$800");
  expect(missingUnitHtml).not.toContain("計價單位：");
});

test("group-offer API batches status and mine reads and uses bearer auth for join/leave", async () => {
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const normalized = String(url);
    calls.push({ url: normalized, init });
    if (normalized.startsWith("/api/group-offers/status")) {
      return Response.json({ offers: [{ candidate_id: "a", capacity: 5, joined_count: 2, remaining_count: 3, full: false }] });
    }
    if (normalized.startsWith("/api/group-offers/mine")) {
      return Response.json({ offers: [{ ...participation({ candidate_id: "a" }), joined: true, members: [] }] });
    }
    return Response.json({ ...participation({ candidate_id: "a" }), joined: normalized.includes("/join") && init?.method !== "DELETE", members: [] });
  }) as typeof fetch;

  try {
    await groupOfferStatus(["a", "b"]);
    await groupOfferMine("token", ["a", "b"]);
    await joinGroupOffer("token", "a");
    await leaveGroupOffer("token", "a");
  } finally {
    globalThis.fetch = previousFetch;
  }

  expect(calls.map(call => call.url)).toEqual([
    "/api/group-offers/status?ids=a,b",
    "/api/group-offers/mine?ids=a,b",
    "/api/group-offers/a/join",
    "/api/group-offers/a/join",
  ]);
  expect(calls[0]?.init?.cache).toBe("no-store");
  expect(new Headers(calls[1]?.init?.headers).get("authorization")).toBe("Bearer token");
  expect(calls[2]?.init?.method).toBe("POST");
  expect(calls[3]?.init?.method).toBe("DELETE");
});

test("empty group-offer reads return immediately without making a request", async () => {
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    return Response.json({ offers: [] });
  }) as unknown as typeof fetch;

  try {
    expect(await groupOfferStatus([])).toEqual({ offers: [] });
    expect(await groupOfferMine("token", [])).toEqual({ offers: [] });
    expect(requests).toBe(0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("group-offer status and mine split large reads into batches of at most 100 IDs", async () => {
  const previousFetch = globalThis.fetch;
  const calls: Array<{ path: string; ids: string[]; signal?: AbortSignal }> = [];
  const ids = Array.from({ length: 205 }, (_, index) => `offer-${index}`);
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url), "https://example.test");
    const batch = parsed.searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
    calls.push({ path: parsed.pathname, ids: batch, signal: init?.signal as AbortSignal | undefined });
    return parsed.pathname.endsWith("/mine")
      ? Response.json({ offers: [] })
      : Response.json({ offers: batch.map(candidate_id => ({ candidate_id, capacity: 5, joined_count: 0, remaining_count: 5, full: false })) });
  }) as typeof fetch;

  try {
    const controller = new AbortController();
    const [status, mine] = await Promise.all([
      groupOfferStatus(ids, controller.signal),
      groupOfferMine("token", ids, controller.signal),
    ]);
    controller.abort();

    const statusCalls = calls.filter(call => call.path.endsWith("/status"));
    const mineCalls = calls.filter(call => call.path.endsWith("/mine"));
    expect(statusCalls.map(call => call.ids.length)).toEqual([100, 100, 5]);
    expect(mineCalls.map(call => call.ids.length)).toEqual([100, 100, 5]);
    expect(status.offers).toHaveLength(205);
    expect(mine.offers).toEqual([]);
    expect(calls.every(call => call.signal instanceof AbortSignal)).toBe(true);
    expect(calls.every(call => call.signal?.aborted)).toBe(true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("aborting a batched group-offer read aborts every request", async () => {
  const previousFetch = globalThis.fetch;
  const signals: AbortSignal[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal;
    signals.push(signal);
    return await new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
  }) as typeof fetch;

  try {
    const controller = new AbortController();
    const pending = groupOfferStatus(Array.from({ length: 101 }, (_, index) => `offer-${index}`), controller.signal);
    controller.abort();
    const error = await pending.catch(value => value);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("aborted");
    expect(signals).toHaveLength(2);
    expect(signals.every(signal => signal.aborted)).toBe(true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("ApiError preserves backend error codes and refresh policy is code-specific", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json(
    { error: "group_offer_unavailable", message: "優惠已失效" },
    { status: 409 },
  )) as unknown as typeof fetch;

  try {
    const error = await joinGroupOffer("token", "offer-a").catch(value => value);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("group_offer_unavailable");
    expect(groupOfferRefreshForError(error)).toBe("catalog");
    expect(groupOfferRefreshForError(new ApiError("failed", "已滿", 409, "group_full"))).toBe("progress");
    expect(groupOfferRefreshForError(new ApiError("failed", "已刪除", 404, "not_found"))).toBe("catalog");
    expect(groupOfferRefreshForError(new ApiError("failed", "其他衝突", 409, "other_conflict"))).toBeNull();
  } finally {
    globalThis.fetch = previousFetch;
  }
});
