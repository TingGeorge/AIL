import "./group-offers.css";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, LogIn, LogOut, TicketPercent, Users } from "lucide-react";
import { canDisplayGroupOffer, groupOfferTerms } from "../shared/group-offers.ts";
import { money } from "../shared/records.ts";
import type { Bucket, Rec } from "../shared/records.ts";
import * as api from "./api.ts";
import type { GroupOfferMember, GroupOfferParticipation, GroupOfferProgress } from "./api.ts";

export type GroupOffersState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: Bucket };

export type GroupOffersProgressState =
  | { status: "loading"; offers: Record<string, GroupOfferParticipation> }
  | { status: "ready"; offers: Record<string, GroupOfferParticipation>; message?: string }
  | { status: "error"; offers: Record<string, GroupOfferParticipation>; message: string };

export type GroupOffersProps = {
  onOpen: (record: Rec) => void;
  token: string | null;
  onLogin: () => void;
  onExpired: (error: unknown) => void;
};

type GroupOffersContentProps = {
  state: GroupOffersState;
  onRetry: () => void;
  onOpen: (record: Rec) => void;
  token?: string | null;
  onLogin?: () => void;
  onExpired?: (error: unknown) => void;
  progressState?: GroupOffersProgressState;
  progressToken?: string | null;
  onRetryProgress?: () => void;
  onToggleParticipation?: (candidateId: string, joined: boolean) => void;
  pendingId?: string | null;
  actionErrors?: Record<string, string | undefined>;
  memberOpenIds?: string[];
};

const emptyProgressOffers: Record<string, GroupOfferParticipation> = {};
const initialProgressState: GroupOffersProgressState = { status: "loading", offers: emptyProgressOffers };
const noop = () => {};

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Taipei",
  }).format(new Date(value));
}

function extraText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function offerPrice(record: Rec): string {
  const offer = record.group_offer!;
  if (offer.price_per_person !== undefined) return `團購價：每人 ${money(offer.price_per_person)}`;
  const rate = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format((100 - offer.discount_pct!) / 10);
  return `團購價：原價 ${rate} 折（省 ${offer.discount_pct}%）`;
}

function progressText(progress: GroupOfferParticipation): string {
  const summary = `已加入 ${progress.joined_count} 人／共 ${progress.capacity} 個名額`;
  if (progress.full) return `${summary} · 已成團，名額已滿`;
  return `${summary} · 尚餘 ${progress.remaining_count} 個名額`;
}

function userFacingMessage(value: unknown, fallback: string): string {
  const message = value instanceof Error
    ? value.message
    : typeof value === "string"
      ? value
      : "";
  const text = message.trim();
  if (!text) return fallback;
  return text
    .replaceAll("團購優惠", "團購方案")
    .replaceAll("團購服務", "團購方案")
    .replaceAll("資料庫", "服務")
    .replaceAll("來源、效期與優惠條件檢查", "相關條件確認");
}

function progressValue(progress: GroupOfferParticipation): number {
  return Math.max(0, Math.min(progress.capacity, progress.joined_count));
}

function memberName(member: GroupOfferMember): string {
  return member.nickname.trim() || "未設定暱稱";
}

function isGroupOfferCandidate(record: Rec): boolean {
  return Boolean(record.group_offer && groupOfferTerms(record));
}

function groupOfferCatalog(result: Bucket): Rec[] {
  const records = new Map<string, Rec>();
  for (const record of [...result.main, ...result.pending]) {
    if (isGroupOfferCandidate(record) && !records.has(record.id)) records.set(record.id, record);
  }
  return [...records.values()];
}

function activeGroupOfferIds(result: Bucket): ReadonlySet<string> {
  return new Set(result.main
    .filter(record => isGroupOfferCandidate(record) && canDisplayGroupOffer(record))
    .map(record => record.id));
}

function GroupOfferMembers({ members }: { members: GroupOfferMember[] | null }) {
  if (members === null) {
    return <p className="group-members-private" role="status">目前無法取得團員資料，請稍後再試。</p>;
  }
  if (members.length === 0) {
    return <p className="group-members-private" role="status">目前還沒有可顯示的團員。</p>;
  }
  return (
    <ul className="group-members-list" aria-label="同團成員">
      {members.map(member => (
        <li key={`${member.username}:${member.joined_at}`}>
          <span className="group-member-identity">
            <b>{memberName(member)}</b>
            <small>@{member.username}</small>
          </span>
          {member.is_self && <span className="group-member-self">你</span>}
        </li>
      ))}
    </ul>
  );
}

type GroupOfferCardProps = {
  record: Rec;
  progress: GroupOfferParticipation | undefined;
  progressState: GroupOffersProgressState;
  token: string | null;
  onOpen: (record: Rec) => void;
  onLogin: () => void;
  onToggleParticipation: (candidateId: string, joined: boolean) => void;
  pending: boolean;
  progressSessionMatches: boolean;
  progressReadyForActions: boolean;
  inactive: boolean;
  actionError?: string;
  memberOpen?: boolean;
};

function GroupOfferCard({
  record,
  progress,
  progressState,
  token,
  onOpen,
  onLogin,
  onToggleParticipation,
  pending,
  progressSessionMatches,
  progressReadyForActions,
  inactive,
  actionError,
  memberOpen: controlledMemberOpen,
}: GroupOfferCardProps) {
  const [localMemberOpen, setLocalMemberOpen] = useState(false);
  const offer = record.group_offer!;
  const terms = groupOfferTerms(record)!;
  const scope = extraText(record.extra.scope) ?? "未提供適用範圍";
  const code = offer.redeem_code?.trim() || "官方未提供優惠碼";
  const validity = terms.valid_until === null
    ? "未公告截止日，以官方公告為準"
    : dateLabel(terms.valid_until);
  const ordinaryPrice = record.price_total_twd === null ? "未提供" : money(record.price_total_twd);
  const priceUnit = extraText(record.price_unit);
  const progressIsCurrent = progressState.status === "ready";
  const currentProgress = progressIsCurrent ? progress : undefined;
  const joined = Boolean(token) && progressSessionMatches && currentProgress?.joined === true;
  const full = currentProgress?.full === true;
  const memberOpen = controlledMemberOpen ?? localMemberOpen;
  const progressUnavailable = currentProgress === undefined;
  const actionDisabled = !progressReadyForActions || pending || (inactive && !joined) || (!joined && full) || (!joined && Boolean(token) && progressUnavailable);
  const actionLabel = pending
    ? "處理中…"
    : progressState.status === "loading"
      ? "正在載入進度…"
      : progressState.status === "error"
        ? "無法載入進度"
        : !progressReadyForActions
          ? "正在載入進度…"
          : joined
            ? "退出團購"
            : progressUnavailable
              ? "暫無進度"
              : full
                ? "已額滿"
                : !token
                  ? "登入後加入團購"
                  : "加入團購";

  function toggleParticipation() {
    if (pending) return;
    if (!token) {
      onLogin();
      return;
    }
    if (actionDisabled || progressState.status !== "ready") return;
    onToggleParticipation(record.id, joined);
  }

  function toggleMembers() {
    if (controlledMemberOpen === undefined) setLocalMemberOpen(open => !open);
  }

  return (
    <article className={`quick-team${joined ? " is-joined" : ""}${full ? " is-full" : ""}`}>
      <div className="quick-team-heading">
        <span className="quick-icon"><TicketPercent aria-hidden="true" /></span>
        <div className="quick-team-title">
          <b>{record.title}</b>
          <small>{record.provider} · {record.category}</small>
        </div>
        <button className="group-offer-detail" type="button" onClick={() => onOpen(record)} aria-label={`查看 ${record.title} 的團購方案詳情`}>
          查看詳情 <ArrowRight aria-hidden="true" />
        </button>
      </div>
      <div className="quick-team-details">
        {inactive && <small className="group-offer-unavailable">此團購方案已失效，目前只能退出</small>}
        <small>一般價格：{ordinaryPrice}{priceUnit ? ` · 計價單位：${priceUnit}` : ""}</small>
        <small className="group-offer-threshold">人數門檻：至少 {offer.min_people} 人 · {offerPrice(record)}</small>
        <small>優惠條件：{offer.note}</small>
        <small>兌換方式：{terms.redemption_method}</small>
        <small>優惠碼：{code}</small>
        <small>有效期限：{validity}</small>
        <small>適用範圍：{scope}</small>
      </div>
      <div className="group-offer-progress-wrap">
        <div className="group-offer-progress-heading">
          <b>目前團購進度</b>
          {currentProgress && <span>{currentProgress.full ? "已成團，名額已滿" : `尚餘 ${currentProgress.remaining_count} 個名額`}</span>}
        </div>
        {currentProgress ? (
          <>
            <progress
              className="group-offer-progress"
              value={progressValue(currentProgress)}
              max={Math.max(1, currentProgress.capacity)}
              aria-label={`已加入 ${currentProgress.joined_count} 人／共 ${currentProgress.capacity} 個名額`}
            />
            <small className="group-offer-progress-text">{progressText(currentProgress)}</small>
          </>
        ) : (
          <small className="group-offer-progress-text">
            {progressState.status === "error"
              ? "目前無法載入最新團購進度，暫時不顯示舊資料。"
              : "正在載入最新團購進度，暫時不顯示舊資料。"}
          </small>
        )}
      </div>
      <div className="group-offer-actions">
        <button
          className={joined ? "group-offer-leave" : "group-offer-join"}
          type="button"
          onClick={toggleParticipation}
          disabled={actionDisabled}
          aria-busy={pending}
        >
          {joined ? <LogOut aria-hidden="true" /> : <LogIn aria-hidden="true" />}
          {actionLabel}
        </button>
        {joined && (
          <button
            className="group-members-toggle"
            type="button"
            onClick={toggleMembers}
            aria-expanded={memberOpen}
            aria-label={`${memberOpen ? "收起" : "查看"} ${record.title} 的團員清單`}
          >
            <Users aria-hidden="true" />
            {memberOpen ? "收起同團成員" : "查看同團成員"}
            {memberOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          </button>
        )}
      </div>
      {actionError && <p className="group-offer-action-error" role="alert">{userFacingMessage(actionError, "操作失敗，請重試。")}</p>}
      {joined && memberOpen && (
        <div className="group-members-panel">
          <div className="group-members-heading">
            <b>一起加入這個方案的人</b>
            <span>{currentProgress?.members?.length ?? 0} 人</span>
          </div>
          <GroupOfferMembers members={currentProgress?.members ?? null} />
        </div>
      )}
    </article>
  );
}

function ProgressNotice({
  progressState,
  onRetryProgress,
}: {
  progressState: GroupOffersProgressState;
  onRetryProgress: () => void;
}) {
  if (progressState.status === "loading") {
    return <p className="notice group-progress-notice" role="status" aria-live="polite">正在載入目前團購進度…</p>;
  }
  if (progressState.status === "error") {
    return (
      <div className="notice error group-progress-notice" role="alert">
        無法載入團購進度：{userFacingMessage(progressState.message, "請稍後再試。")}
        <button type="button" onClick={onRetryProgress}>重新載入進度</button>
      </div>
    );
  }
  if (progressState.message) {
    return (
      <div className="notice warning group-progress-notice" role="status" aria-live="polite">
        {userFacingMessage(progressState.message, "團購進度可能不是最新資料。")}
        <button type="button" onClick={onRetryProgress}>重新載入進度</button>
      </div>
    );
  }
  return null;
}

export function GroupOffersContent({
  state,
  onRetry,
  onOpen,
  token = null,
  onLogin = noop,
  progressState = initialProgressState,
  progressToken,
  onRetryProgress = noop,
  onToggleParticipation = noop,
  pendingId = null,
  actionErrors = {},
  memberOpenIds,
}: GroupOffersContentProps) {
  if (state.status === "loading") return (
    <section className="screen team-screen group-offers-screen" aria-busy="true">
      <h1>團購方案</h1>
      <p className="notice" role="status" aria-live="polite">正在載入團購方案…</p>
    </section>
  );

  if (state.status === "error") return (
    <section className="screen team-screen group-offers-screen">
      <h1>團購方案</h1>
      <div className="notice error" role="alert">
        目前無法載入團購方案：{userFacingMessage(state.message, "請稍後再試。")}
        <button type="button" onClick={onRetry}>重新載入</button>
      </div>
    </section>
  );

  const catalogOffers = groupOfferCatalog(state.result);
  const activeOfferIds = activeGroupOfferIds(state.result);
  const progressSessionMatches = !token || (progressToken ?? token) === token;
  const offers = catalogOffers.filter(record =>
    activeOfferIds.has(record.id) || (Boolean(token) && progressSessionMatches && progressState.offers[record.id]?.joined === true),
  );
  return (
    <section className="screen team-screen group-offers-screen" aria-busy={progressState.status === "loading"}>
      <h1>團購方案</h1>
      <p className="notice">
        先瀏覽目前的團購方案；登入後即可加入團購並占用一個名額。預約、付款與兌換仍依商家流程在 App 外完成。
      </p>
      <ProgressNotice progressState={progressState} onRetryProgress={onRetryProgress} />
      {offers.length === 0 ? (
        <div className="empty-state">
          <TicketPercent aria-hidden="true" />
          <h2>目前沒有可顯示的團購方案</h2>
          <p>目前沒有符合條件的團購方案，請稍後再試，或回到結果頁查看其他選項。</p>
        </div>
      ) : offers.map(record => (
        <GroupOfferCard
          key={record.id}
          record={record}
          progress={progressState.offers[record.id]}
          progressState={progressState}
          token={token}
          progressSessionMatches={progressSessionMatches}
          progressReadyForActions={progressState.status === "ready" && progressSessionMatches}
          inactive={!activeOfferIds.has(record.id)}
          onOpen={onOpen}
          onLogin={onLogin}
          onToggleParticipation={onToggleParticipation}
          pending={pendingId === record.id}
          actionError={actionErrors[record.id]}
          memberOpen={memberOpenIds?.includes(record.id)}
        />
      ))}
    </section>
  );
}

export function mergeGroupOfferProgress(
  ids: string[],
  publicOffers: GroupOfferProgress[],
  mineOffers: GroupOfferParticipation[],
  previousOffers: Record<string, GroupOfferParticipation> = {},
  preserveJoinedIds: ReadonlySet<string> = new Set(),
): Record<string, GroupOfferParticipation> {
  const publicById = new Map(publicOffers.map(offer => [offer.candidate_id, offer]));
  const mineById = new Map(mineOffers.map(offer => [offer.candidate_id, offer]));
  return Object.fromEntries(ids.flatMap(id => {
    const publicOffer = publicById.get(id);
    const mineOffer = mineById.get(id);
    const previousOffer = previousOffers[id];
    const previousJoined = preserveJoinedIds.has(id) && previousOffer?.joined === true;
    if (mineOffer?.joined === true) return [[id, participationAsView(mineOffer)]];
    const base = publicOffer ?? mineOffer ?? (previousJoined ? previousOffer : undefined);
    if (!base) return [];
    return [[id, {
      ...base,
      joined: !publicOffer && !mineOffer && previousJoined,
      members: !publicOffer && !mineOffer && previousJoined ? previousOffer.members : null,
    }]];
  }));
}

function participationAsView(value: GroupOfferParticipation): GroupOfferParticipation {
  return {
    ...value,
    joined: value.joined === true,
    members: value.joined === true ? value.members : null,
  };
}

export function groupOfferRefreshForError(error: unknown): "progress" | "catalog" | null {
  if (!(error instanceof api.ApiError)) return null;
  if (error.code === "group_full") return "progress";
  if (error.code === "group_offer_unavailable" || error.code === "not_found" || error.status === 404) return "catalog";
  return null;
}

export function GroupOffers({ onOpen, token, onLogin, onExpired }: GroupOffersProps) {
  const [state, setState] = useState<GroupOffersState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [progressAttempt, setProgressAttempt] = useState(0);
  const [progressState, setProgressState] = useState<GroupOffersProgressState>(initialProgressState);
  const [progressToken, setProgressToken] = useState<string | null>(token);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void api.browse(controller.signal).then(result => {
      if (!controller.signal.aborted) setState({ status: "ready", result });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setState({ status: "error", message: userFacingMessage(error, "載入團購方案失敗，請重試。") });
      }
    });
    return () => controller.abort();
  }, [attempt]);

  const catalogOffers = state.status === "ready" ? groupOfferCatalog(state.result) : [];
  const offerIds = catalogOffers.map(record => record.id);
  const offerIdsKey = offerIds.join(",");
  const activeOfferIds = state.status === "ready" ? activeGroupOfferIds(state.result) : new Set<string>();
  const inactiveOfferIds = new Set(catalogOffers
    .filter(record => !activeOfferIds.has(record.id))
    .map(record => record.id));

  useEffect(() => {
    if (state.status !== "ready") return;
    const ids = offerIdsKey ? offerIdsKey.split(",") : [];
    const preserveStaleOffers = progressToken === token;
    setProgressToken(token);
    if (ids.length === 0) {
      setProgressState({ status: "ready", offers: {} });
      setActionErrors({});
      return;
    }

    const controller = new AbortController();
    setProgressState(previous => ({ status: "loading", offers: preserveStaleOffers ? previous.offers : {} }));
    void (async () => {
      const [publicResult, mineResult] = await Promise.allSettled([
        api.groupOfferStatus(ids, controller.signal),
        token ? api.groupOfferMine(token, ids, controller.signal) : Promise.resolve({ offers: [] as GroupOfferParticipation[] }),
      ]);
      if (controller.signal.aborted) return;

      if (publicResult.status === "rejected") {
        const error = publicResult.reason;
        if (error instanceof api.ApiError && error.status === 401) {
          onExpired(error);
          onLogin();
        }
        setProgressState(previous => ({
          status: "error",
          offers: previous.offers,
          message: userFacingMessage(error, "無法載入團購進度，請重試。"),
        }));
        return;
      }

      let mineOffers: GroupOfferParticipation[] = [];
      if (mineResult.status === "fulfilled") {
        mineOffers = mineResult.value.offers;
      } else {
        const error = mineResult.reason;
        if (error instanceof api.ApiError && error.status === 401) {
          onExpired(error);
          onLogin();
        }
        setProgressState(previous => ({
          status: "error",
          offers: mergeGroupOfferProgress(ids, publicResult.value.offers, [], preserveStaleOffers ? previous.offers : {}, inactiveOfferIds),
          message: userFacingMessage(error, "無法載入你加入的團購狀態。"),
        }));
        return;
      }

      setProgressState(previous => ({
        status: "ready",
        offers: mergeGroupOfferProgress(ids, publicResult.value.offers, mineOffers, preserveStaleOffers ? previous.offers : {}, inactiveOfferIds),
      }));
      setActionErrors(previous => {
        const next = { ...previous };
        for (const id of ids) delete next[id];
        return next;
      });
    })().catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setProgressState(previous => ({
          status: "error",
          offers: previous.offers,
          message: userFacingMessage(error, "無法載入團購進度，請重試。"),
        }));
      }
    });
    return () => controller.abort();
    // The IDs and session token are the data dependencies. Callback props are intentionally
    // read from the request's render so an auth failure can be handled without refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, offerIdsKey, progressAttempt, state.status, token]);

  async function toggleParticipation(candidateId: string, joined: boolean) {
    if (!token) {
      onLogin();
      return;
    }
    if (pendingId) return;
    if (progressState.status !== "ready" || progressToken !== token) return;
    setPendingId(candidateId);
    setActionErrors(previous => ({ ...previous, [candidateId]: undefined }));
    try {
      const result = joined
        ? await api.leaveGroupOffer(token, candidateId)
        : await api.joinGroupOffer(token, candidateId);
      setProgressState(previous => ({
        status: "ready",
        offers: { ...previous.offers, [candidateId]: participationAsView(result) },
        ...(previous.status === "ready" && previous.message ? { message: previous.message } : {}),
      }));
    } catch (error: unknown) {
      if (error instanceof api.ApiError && error.status === 401) {
        onExpired(error);
        onLogin();
      } else {
        const message = userFacingMessage(error, "操作失敗，請重試。");
        const refresh = groupOfferRefreshForError(error);
        if (refresh === "catalog") {
          setActionErrors(previous => {
            const next = { ...previous };
            delete next[candidateId];
            return next;
          });
          setState({ status: "loading" });
          setProgressState(previous => ({ status: "loading", offers: previous.offers }));
          setAttempt(value => value + 1);
        } else {
          setActionErrors(previous => ({ ...previous, [candidateId]: message }));
          if (refresh === "progress") {
            setProgressState(previous => ({ status: "loading", offers: previous.offers }));
            setProgressAttempt(value => value + 1);
          }
        }
      }
    } finally {
      setPendingId(null);
    }
  }

  return (
    <GroupOffersContent
      state={state}
      onRetry={() => {
        setState({ status: "loading" });
        setProgressState(previous => ({ status: "loading", offers: previous.offers }));
        setAttempt(value => value + 1);
      }}
      onOpen={onOpen}
      token={token}
      onLogin={onLogin}
      progressState={progressState}
      progressToken={progressToken}
      onRetryProgress={() => {
        setProgressState(previous => ({ status: "loading", offers: previous.offers }));
        setProgressAttempt(value => value + 1);
      }}
      onToggleParticipation={toggleParticipation}
      pendingId={pendingId}
      actionErrors={actionErrors}
    />
  );
}
