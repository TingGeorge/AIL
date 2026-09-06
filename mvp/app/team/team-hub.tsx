'use client';

import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  Clipboard,
  Clock3,
  Copy,
  Link2,
  LoaderCircle,
  LogIn,
  MapPin,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import {
  AccountClientError,
  authenticateAccount,
  clearAccountToken,
  endAccountSession,
  readAccountToken,
  restoreAccountSession,
} from '@/lib/account-client';
import {
  ACCOUNT_PASSWORD_MIN_LENGTH,
  ACCOUNT_USERNAME_PATTERN,
  type AccountUser,
} from '@/lib/account-contract';
import { catalogCategories, type CatalogItem } from '@/lib/catalog-contract';
import {
  createTeam,
  createTeamCampaign,
  createTeamInvite,
  listTeamCampaigns,
  listTeams,
  loadCampaignPlaces,
  readTeam,
  readTeamCampaign,
  redeemTeamInvite,
  TeamClientError,
  updateTeamCommitment,
} from '@/lib/team-client';
import type {
  CampaignStatus,
  TeamCampaignDto,
  TeamDto,
  TeamInviteDto,
} from '@/lib/team-contract';
import styles from './team-hub.module.css';

type AuthPhase = 'checking' | 'anonymous' | 'authenticated';
type LoadPhase = 'idle' | 'loading' | 'ready' | 'error';
type Notice = { tone: 'success' | 'error' | 'info'; text: string };
type InviteIssue = {
  kind: 'expired' | 'full' | 'conflict' | 'invalid' | 'error';
  title: string;
  text: string;
};

const inviteTokenPattern = /^[A-Za-z0-9_-]{43}$/u;
const roleLabels = { OWNER: '團主', ADMIN: '管理員', MEMBER: '成員' } as const;
const statusLabels: Record<CampaignStatus, string> = {
  OPEN: '開放登記',
  THRESHOLD_MET: '已達門檻',
  CLOSED: '已關閉',
  CANCELLED: '已取消',
  EXPIRED: '已截止',
};

function messageFrom(error: unknown, fallback: string) {
  if (error instanceof TeamClientError || error instanceof AccountClientError) {
    return error.message;
  }
  return fallback;
}

function isUnauthorized(error: unknown) {
  return (
    (error instanceof TeamClientError || error instanceof AccountClientError) &&
    error.status === 401
  );
}

function inviteIssueFrom(error: unknown): InviteIssue {
  const code = error instanceof TeamClientError ? error.code : '';
  if (code === 'invite_expired') {
    return {
      kind: 'expired',
      title: '邀請已過期',
      text: '這份邀請已超過有效期限，請團主建立新的邀請。',
    };
  }
  if (code === 'invite_full') {
    return {
      kind: 'full',
      title: '邀請名額已滿',
      text: '這份邀請已達使用上限，請向團主索取新的邀請。',
    };
  }
  if (
    ['invite_revoked', 'invite_unavailable', 'team_archived'].includes(code)
  ) {
    return {
      kind: 'conflict',
      title: '邀請目前無法使用',
      text: messageFrom(error, '邀請狀態已變更，請向團主確認。'),
    };
  }
  if (code === 'invite_not_found' || code === 'invalid_team_input') {
    return {
      kind: 'invalid',
      title: '邀請連結無效',
      text: '請確認連結完整，或向團主重新取得邀請。',
    };
  }
  return {
    kind: 'error',
    title: '暫時無法加入團隊',
    text: messageFrom(error, '請稍後再試。'),
  };
}

function inviteFromFragment() {
  if (typeof window === 'undefined') return null;
  const token = new URLSearchParams(window.location.hash.slice(1)).get(
    'invite',
  );
  return token?.trim() || null;
}

function clearInviteFragment() {
  const nextUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, '', nextUrl);
}

function defaultDeadlineValue() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function minimumDeadlineValue() {
  const date = new Date(Date.now() + 15 * 60 * 1_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '時間待確認';
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function updateTeamList(current: TeamDto[], team: TeamDto) {
  return [team, ...current.filter((item) => item.id !== team.id)];
}

function updateCampaignList(
  current: TeamCampaignDto[],
  campaign: TeamCampaignDto,
) {
  return [campaign, ...current.filter((item) => item.id !== campaign.id)];
}

export default function TeamHub() {
  const [authPhase, setAuthPhase] = useState<AuthPhase>('checking');
  const [accountToken, setAccountToken] = useState<string | null>(null);
  const [accountUser, setAccountUser] = useState<AccountUser | null>(null);
  const [teams, setTeams] = useState<TeamDto[]>([]);
  const [teamsPhase, setTeamsPhase] = useState<LoadPhase>('idle');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<TeamCampaignDto[]>([]);
  const [campaignsPhase, setCampaignsPhase] = useState<LoadPhase>('idle');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null,
  );
  const [catalogPlaces, setCatalogPlaces] = useState<CatalogItem[]>([]);
  const [catalogPhase, setCatalogPhase] = useState<LoadPhase>('idle');
  const [catalogWarning, setCatalogWarning] = useState('');
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  const [invitePhase, setInvitePhase] = useState<LoadPhase>('idle');
  const [inviteIssue, setInviteIssue] = useState<InviteIssue | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const attemptedInvite = useRef<string | null>(null);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;

  const expireSession = useCallback(() => {
    clearAccountToken();
    setAccountToken(null);
    setAccountUser(null);
    setAuthPhase('anonymous');
    setTeams([]);
    setCampaigns([]);
    setSelectedTeamId(null);
    setSelectedCampaignId(null);
    setNotice({
      tone: 'error',
      text: '登入工作階段已失效，請重新登入後繼續。',
    });
  }, []);

  const handleError = useCallback(
    (error: unknown, fallback: string) => {
      if (isUnauthorized(error)) {
        expireSession();
        return;
      }
      setNotice({ tone: 'error', text: messageFrom(error, fallback) });
    },
    [expireSession],
  );

  const refreshTeams = useCallback(
    async (silent = false) => {
      if (!accountToken) return;
      if (!silent) setTeamsPhase('loading');
      try {
        const nextTeams = await listTeams(accountToken);
        setTeams(nextTeams);
        setTeamsPhase('ready');
        setSelectedTeamId((current) =>
          current && nextTeams.some((team) => team.id === current)
            ? current
            : (nextTeams[0]?.id ?? null),
        );
      } catch (error) {
        setTeamsPhase('error');
        handleError(error, '團隊清單暫時無法載入。');
      }
    },
    [accountToken, handleError],
  );

  const refreshCampaign = useCallback(
    async (campaignId: string, silent = false) => {
      if (!accountToken) return;
      if (!silent) setBusyAction(`refresh-campaign:${campaignId}`);
      try {
        const campaign = await readTeamCampaign(campaignId, accountToken);
        setCampaigns((current) => updateCampaignList(current, campaign));
      } catch (error) {
        handleError(error, '活動進度暫時無法更新。');
      } finally {
        if (!silent) setBusyAction(null);
      }
    },
    [accountToken, handleError],
  );

  useEffect(() => {
    let active = true;
    window.queueMicrotask(() => {
      if (!active) return;
      const fragmentInvite = inviteFromFragment();
      if (fragmentInvite) {
        setPendingInvite(fragmentInvite);
        if (!inviteTokenPattern.test(fragmentInvite)) {
          setInviteIssue({
            kind: 'invalid',
            title: '邀請連結無效',
            text: '這份邀請連結不完整，請向團主重新取得。',
          });
        }
      }

      const token = readAccountToken();
      if (!token) {
        setAuthPhase('anonymous');
        return;
      }
      restoreAccountSession(token)
        .then((session) => {
          if (!active) return;
          setAccountToken(token);
          setAccountUser(session.user);
          setAuthPhase('authenticated');
        })
        .catch(() => {
          if (!active) return;
          clearAccountToken();
          setAuthPhase('anonymous');
        });
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleHashChange() {
      const token = inviteFromFragment();
      attemptedInvite.current = null;
      setInviteIssue(null);
      setPendingInvite(token);
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (authPhase !== 'authenticated') return;
    window.queueMicrotask(() => void refreshTeams());
  }, [authPhase, refreshTeams]);

  useEffect(() => {
    if (authPhase !== 'authenticated') return;
    const controller = new AbortController();
    window.queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setCatalogPhase('loading');
      loadCampaignPlaces(controller.signal)
        .then((response) => {
          setCatalogPlaces(response.items);
          setCatalogWarning(response.warnings[0] ?? '');
          setCatalogPhase('ready');
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === 'AbortError')
            return;
          setCatalogPhase('error');
          setCatalogWarning(messageFrom(error, '地點清單暫時無法載入。'));
        });
    });
    return () => controller.abort();
  }, [authPhase]);

  useEffect(() => {
    let active = true;
    window.queueMicrotask(() => {
      if (!active) return;
      if (!accountToken || !selectedTeamId) {
        setCampaigns([]);
        setSelectedCampaignId(null);
        setCampaignsPhase('idle');
        return;
      }
      setCampaignsPhase('loading');
      Promise.all([
        readTeam(selectedTeamId, accountToken),
        listTeamCampaigns(selectedTeamId, accountToken),
      ])
        .then(([team, nextCampaigns]) => {
          if (!active) return;
          setTeams((current) => updateTeamList(current, team));
          setCampaigns(nextCampaigns);
          setSelectedCampaignId((current) =>
            current && nextCampaigns.some((campaign) => campaign.id === current)
              ? current
              : (nextCampaigns[0]?.id ?? null),
          );
          setCampaignsPhase('ready');
        })
        .catch((error) => {
          if (!active) return;
          setCampaignsPhase('error');
          handleError(error, '團隊活動暫時無法載入。');
        });
    });
    return () => {
      active = false;
    };
  }, [accountToken, handleError, selectedTeamId]);

  const redeemPending = useCallback(async () => {
    if (!accountToken || !pendingInvite) return;
    if (!inviteTokenPattern.test(pendingInvite)) {
      setInvitePhase('error');
      setInviteIssue({
        kind: 'invalid',
        title: '邀請連結無效',
        text: '這份邀請連結不完整，請向團主重新取得。',
      });
      return;
    }
    attemptedInvite.current = pendingInvite;
    setInvitePhase('loading');
    setInviteIssue(null);
    try {
      const result = await redeemTeamInvite(pendingInvite, accountToken);
      setTeams((current) => updateTeamList(current, result.team));
      setSelectedTeamId(result.team.id);
      setPendingInvite(null);
      setInvitePhase('ready');
      clearInviteFragment();
      setNotice({
        tone: 'success',
        text: result.joined
          ? `已加入「${result.team.name}」。`
          : `你已經是「${result.team.name}」的成員。`,
      });
      void refreshTeams(true);
    } catch (error) {
      if (isUnauthorized(error)) {
        expireSession();
        return;
      }
      setInvitePhase('error');
      setInviteIssue(inviteIssueFrom(error));
    }
  }, [accountToken, expireSession, pendingInvite, refreshTeams]);

  useEffect(() => {
    if (
      authPhase === 'authenticated' &&
      pendingInvite &&
      attemptedInvite.current !== pendingInvite
    ) {
      void redeemPending();
    }
  }, [authPhase, pendingInvite, redeemPending]);

  async function handleAuthenticate(
    mode: 'login' | 'register',
    input: { username: string; password: string; nickname?: string },
  ) {
    try {
      const session = await authenticateAccount(mode, input);
      setAccountToken(session.sessionToken);
      setAccountUser(session.user);
      setAuthPhase('authenticated');
      setNotice({
        tone: 'success',
        text: pendingInvite ? '登入成功，正在兌換邀請…' : '登入成功。',
      });
      return null;
    } catch (error) {
      return messageFrom(error, '帳號服務暫時無法使用。');
    }
  }

  async function handleLogout() {
    const token = accountToken;
    setBusyAction('logout');
    try {
      await endAccountSession(token);
    } catch {
      setNotice({
        tone: 'info',
        text: '伺服器未確認登出，但此分頁的登入權杖已安全清除。',
      });
    } finally {
      clearAccountToken();
      setAccountToken(null);
      setAccountUser(null);
      setAuthPhase('anonymous');
      setTeams([]);
      setCampaigns([]);
      setSelectedTeamId(null);
      setSelectedCampaignId(null);
      setBusyAction(null);
    }
  }

  function dismissInvite() {
    clearInviteFragment();
    setPendingInvite(null);
    setInviteIssue(null);
    setInvitePhase('idle');
    attemptedInvite.current = null;
  }

  return (
    <main className={styles.page}>
      <div
        className={`${styles.ambient} ${styles.ambientOne}`}
        aria-hidden="true"
      />
      <div
        className={`${styles.ambient} ${styles.ambientTwo}`}
        aria-hidden="true"
      />

      <header className={styles.header}>
        <Link className={styles.backLink} href="/">
          <ArrowLeft aria-hidden="true" />
          回到探索
        </Link>
        <div className={styles.brandLockup}>
          <span>ALL IN LIFE</span>
          <b>Team Hub</b>
        </div>
        {accountUser && (
          <div className={styles.accountMenu}>
            <span className={styles.avatar} aria-hidden="true">
              {(accountUser.nickname || accountUser.username).slice(0, 1)}
            </span>
            <span className={styles.accountCopy}>
              <b>{accountUser.nickname || accountUser.username}</b>
              <small>@{accountUser.username}</small>
            </span>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => void handleLogout()}
              disabled={busyAction === 'logout'}
            >
              登出
            </button>
          </div>
        )}
      </header>

      <section className={styles.intro} aria-labelledby="team-hub-title">
        <span className={styles.eyebrow}>TEAM MODE · 圓山生活圈</span>
        <h1 id="team-hub-title">把「想一起」變成看得見的進度</h1>
        <p>
          建立邀請制團隊，從官方 catalog
          選地點並登記意願。這裡只協調人數與數量，
          <strong>不代付、不下單、不保證履約</strong>。
        </p>
      </section>

      {notice && (
        <output className={`${styles.notice} ${styles[notice.tone]}`}>
          {notice.tone === 'success' ? (
            <Check aria-hidden="true" />
          ) : notice.tone === 'error' ? (
            <AlertTriangle aria-hidden="true" />
          ) : (
            <Sparkles aria-hidden="true" />
          )}
          <span>{notice.text}</span>
          <button
            type="button"
            aria-label="關閉提示"
            onClick={() => setNotice(null)}
          >
            <X aria-hidden="true" />
          </button>
        </output>
      )}

      {authPhase === 'checking' && <LoadingPanel label="正在確認登入狀態…" />}

      {authPhase === 'anonymous' && (
        <AuthGate
          pendingInvite={Boolean(pendingInvite)}
          inviteIssue={inviteIssue}
          onAuthenticate={handleAuthenticate}
        />
      )}

      {authPhase === 'authenticated' && (
        <>
          {(pendingInvite || inviteIssue) && (
            <InviteBanner
              phase={invitePhase}
              issue={inviteIssue}
              onRetry={() => {
                attemptedInvite.current = null;
                void redeemPending();
              }}
              onDismiss={dismissInvite}
            />
          )}

          <div className={styles.dashboard}>
            <aside className={styles.teamRail} aria-label="團隊導覽">
              <TeamList
                teams={teams}
                phase={teamsPhase}
                selectedId={selectedTeamId}
                onSelect={setSelectedTeamId}
                onRefresh={() => void refreshTeams()}
              />
              <CreateTeamForm
                busy={busyAction === 'create-team'}
                onCreate={async (name) => {
                  if (!accountToken) return false;
                  setBusyAction('create-team');
                  try {
                    const team = await createTeam({ name }, accountToken);
                    setTeams((current) => updateTeamList(current, team));
                    setSelectedTeamId(team.id);
                    setNotice({
                      tone: 'success',
                      text: `「${team.name}」已建立，可以開始邀請成員。`,
                    });
                    return true;
                  } catch (error) {
                    handleError(error, '團隊暫時無法建立。');
                    return false;
                  } finally {
                    setBusyAction(null);
                  }
                }}
              />
            </aside>

            <section className={styles.workspace} aria-live="polite">
              {!selectedTeam && teamsPhase === 'ready' ? (
                <EmptyState
                  icon={<Users aria-hidden="true" />}
                  title="先建立你的第一個團隊"
                  text="團隊採邀請制。建立後即可分享安全的邀請連結，再從 catalog 發起意願活動。"
                />
              ) : selectedTeam ? (
                <>
                  <TeamOverview team={selectedTeam} />
                  <InviteCreator
                    key={`invite:${selectedTeam.id}`}
                    team={selectedTeam}
                    busy={busyAction === 'create-invite'}
                    onCreate={async (maxUses) => {
                      if (!accountToken) return null;
                      setBusyAction('create-invite');
                      try {
                        const invite = await createTeamInvite(
                          selectedTeam.id,
                          { maxUses },
                          accountToken,
                        );
                        setNotice({
                          tone: 'success',
                          text: '邀請已建立，token 只會放在分享網址的 fragment。',
                        });
                        return invite;
                      } catch (error) {
                        handleError(error, '邀請暫時無法建立。');
                        return null;
                      } finally {
                        setBusyAction(null);
                      }
                    }}
                    onNotice={setNotice}
                  />

                  <div className={styles.campaignGrid}>
                    <CampaignList
                      campaigns={campaigns}
                      phase={campaignsPhase}
                      selectedId={selectedCampaignId}
                      onSelect={setSelectedCampaignId}
                    />
                    {selectedCampaign ? (
                      <CampaignDetail
                        key={selectedCampaign.id}
                        campaign={selectedCampaign}
                        busyAction={busyAction}
                        onRefresh={() =>
                          void refreshCampaign(selectedCampaign.id)
                        }
                        onCommit={async (action, quantity) => {
                          if (!accountToken) return;
                          setBusyAction(`commit:${selectedCampaign.id}`);
                          try {
                            const campaign = await updateTeamCommitment(
                              selectedCampaign.id,
                              action === 'WITHDRAW'
                                ? { action: 'WITHDRAW' }
                                : {
                                    action: 'PLEDGE',
                                    quantity,
                                    maxCostTwd: null,
                                  },
                              accountToken,
                            );
                            setCampaigns((current) =>
                              updateCampaignList(current, campaign),
                            );
                            setNotice({
                              tone: 'success',
                              text:
                                action === 'WITHDRAW'
                                  ? '已撤回意願。'
                                  : '意願已更新；這不是付款或訂單。',
                            });
                            void refreshTeams(true);
                          } catch (error) {
                            if (
                              error instanceof TeamClientError &&
                              error.code === 'commitment_conflict'
                            ) {
                              setNotice({
                                tone: 'info',
                                text: '進度剛被更新，正在載入伺服器最新狀態。',
                              });
                              await refreshCampaign(selectedCampaign.id, true);
                            } else {
                              handleError(error, '意願暫時無法更新。');
                            }
                          } finally {
                            setBusyAction(null);
                          }
                        }}
                      />
                    ) : (
                      <EmptyState
                        compact
                        icon={<Clipboard aria-hidden="true" />}
                        title={
                          campaignsPhase === 'loading'
                            ? '正在載入活動…'
                            : '目前沒有意願活動'
                        }
                        text="團主或管理員可以從下方的 catalog 地點建立第一個未定價意願活動。"
                      />
                    )}
                  </div>

                  <CreateCampaignForm
                    key={`campaign-form:${selectedTeam.id}`}
                    team={selectedTeam}
                    places={catalogPlaces}
                    phase={catalogPhase}
                    warning={catalogWarning}
                    busy={busyAction === 'create-campaign'}
                    onRetryCatalog={() => {
                      const controller = new AbortController();
                      setCatalogPhase('loading');
                      loadCampaignPlaces(controller.signal)
                        .then((response) => {
                          setCatalogPlaces(response.items);
                          setCatalogWarning(response.warnings[0] ?? '');
                          setCatalogPhase('ready');
                        })
                        .catch((error) => {
                          setCatalogPhase('error');
                          setCatalogWarning(
                            messageFrom(error, '地點清單暫時無法載入。'),
                          );
                        });
                    }}
                    onCreate={async (input) => {
                      if (!accountToken) return;
                      setBusyAction('create-campaign');
                      try {
                        const campaign = await createTeamCampaign(
                          selectedTeam.id,
                          input,
                          accountToken,
                        );
                        setCampaigns((current) =>
                          updateCampaignList(current, campaign),
                        );
                        setSelectedCampaignId(campaign.id);
                        setNotice({
                          tone: 'success',
                          text: '未定價意願活動已建立；尚未產生付款或訂單。',
                        });
                        void refreshTeams(true);
                      } catch (error) {
                        handleError(error, '活動暫時無法建立。');
                      } finally {
                        setBusyAction(null);
                      }
                    }}
                  />
                </>
              ) : (
                <LoadingPanel label="正在載入團隊…" compact />
              )}
            </section>
          </div>
        </>
      )}

      <footer className={styles.footer}>
        <ShieldCheck aria-hidden="true" />
        <span>
          Team Hub
          只記錄成員意願與伺服器進度；不代付、不下單、不保證成團或履約。
        </span>
      </footer>
    </main>
  );
}

function AuthGate({
  pendingInvite,
  inviteIssue,
  onAuthenticate,
}: {
  pendingInvite: boolean;
  inviteIssue: InviteIssue | null;
  onAuthenticate: (
    mode: 'login' | 'register',
    input: { username: string; password: string; nickname?: string },
  ) => Promise<string | null>;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUsername = username.trim().toLowerCase();
    if (!ACCOUNT_USERNAME_PATTERN.test(normalizedUsername)) {
      setError('帳號需為 3–30 個小寫英數字、底線或連字號。');
      return;
    }
    if (password.length < ACCOUNT_PASSWORD_MIN_LENGTH) {
      setError(`密碼至少需要 ${ACCOUNT_PASSWORD_MIN_LENGTH} 個字元。`);
      return;
    }
    setBusy(true);
    setError('');
    const nextError = await onAuthenticate(mode, {
      username: normalizedUsername,
      password,
      ...(mode === 'register' ? { nickname: nickname.trim() } : {}),
    });
    setBusy(false);
    if (nextError) setError(nextError);
  }

  return (
    <section className={styles.authGate} aria-labelledby="team-auth-title">
      <div className={styles.authIntro}>
        <span className={styles.iconTile} aria-hidden="true">
          <Users />
        </span>
        <span className={styles.eyebrow}>會員限定協作空間</span>
        <h2 id="team-auth-title">登入後管理團隊意願</h2>
        <p>
          團隊資料由 bearer session 綁定登入者；前端不會指定 user ID 或角色。
        </p>
        {pendingInvite && (
          <div className={styles.pendingInvite}>
            <Link2 aria-hidden="true" />
            <span>
              <b>{inviteIssue?.title ?? '你有一份待加入邀請'}</b>
              <small>
                {inviteIssue?.text ?? '登入或註冊後會自動安全兌換。'}
              </small>
            </span>
          </div>
        )}
      </div>

      <div className={styles.authFormWrap}>
        <div className={styles.tabs} role="tablist" aria-label="帳號方式">
          {(['login', 'register'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              className={mode === value ? styles.activeTab : ''}
              onClick={() => {
                setMode(value);
                setError('');
              }}
            >
              {value === 'login' ? '登入' : '註冊'}
            </button>
          ))}
        </div>
        <form className={styles.form} onSubmit={submit}>
          {mode === 'register' && (
            <label>
              顯示名稱
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                maxLength={30}
                placeholder="例如：圓山小隊長（選填）"
              />
            </label>
          )}
          <label>
            帳號
            <input
              value={username}
              onChange={(event) =>
                setUsername(event.target.value.toLowerCase())
              }
              minLength={3}
              maxLength={30}
              pattern="[a-z0-9_-]{3,30}"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              placeholder="3–30 個英數字、_ 或 -"
              required
            />
          </label>
          <label>
            密碼
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
              maxLength={128}
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              placeholder={`至少 ${ACCOUNT_PASSWORD_MIN_LENGTH} 個字元`}
              required
            />
          </label>
          {error && (
            <p className={styles.formError} role="alert">
              <AlertTriangle aria-hidden="true" />
              {error}
            </p>
          )}
          <button className={styles.primaryButton} disabled={busy}>
            {busy ? <LoaderCircle className={styles.spinner} /> : <LogIn />}
            {busy
              ? '處理中…'
              : mode === 'login'
                ? '登入並繼續'
                : '建立帳號並繼續'}
            {!busy && <ChevronRight aria-hidden="true" />}
          </button>
        </form>
        <small className={styles.privacyCopy}>
          <ShieldCheck aria-hidden="true" />
          權杖只保存在本分頁 sessionStorage；邀請 token 不放 API 路徑或 query。
        </small>
      </div>
    </section>
  );
}

function InviteBanner({
  phase,
  issue,
  onRetry,
  onDismiss,
}: {
  phase: LoadPhase;
  issue: InviteIssue | null;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <section
      className={`${styles.inviteBanner} ${issue ? styles.inviteProblem : ''}`}
      aria-live="polite"
    >
      {phase === 'loading' ? (
        <LoaderCircle className={styles.spinner} aria-hidden="true" />
      ) : issue ? (
        <AlertTriangle aria-hidden="true" />
      ) : (
        <Link2 aria-hidden="true" />
      )}
      <span>
        <b>{issue?.title ?? '正在兌換團隊邀請'}</b>
        <small>{issue?.text ?? '完成後會自動開啟該團隊。'}</small>
      </span>
      {issue && issue.kind === 'error' && (
        <button type="button" className={styles.smallButton} onClick={onRetry}>
          再試一次
        </button>
      )}
      {issue && (
        <button type="button" className={styles.iconButton} onClick={onDismiss}>
          <X aria-hidden="true" />
          <span className={styles.srOnly}>關閉邀請提示</span>
        </button>
      )}
    </section>
  );
}

function TeamList({
  teams,
  phase,
  selectedId,
  onSelect,
  onRefresh,
}: {
  teams: TeamDto[];
  phase: LoadPhase;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <section className={styles.panel} aria-labelledby="my-teams-title">
      <div className={styles.panelHeading}>
        <span>
          <small>MY TEAMS</small>
          <h2 id="my-teams-title">我的團隊</h2>
        </span>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="重新整理團隊"
          onClick={onRefresh}
          disabled={phase === 'loading'}
        >
          <RefreshCw className={phase === 'loading' ? styles.spinner : ''} />
        </button>
      </div>
      {phase === 'error' && teams.length === 0 ? (
        <InlineState text="無法載入團隊。" action="重試" onAction={onRefresh} />
      ) : teams.length === 0 ? (
        <p className={styles.mutedCopy}>
          {phase === 'loading' ? '正在載入…' : '尚未加入任何團隊。'}
        </p>
      ) : (
        <ul className={styles.teamList}>
          {teams.map((team) => (
            <li key={team.id}>
              <button
                type="button"
                className={`${styles.teamButton} ${selectedId === team.id ? styles.selectedTeam : ''}`}
                aria-pressed={selectedId === team.id}
                onClick={() => onSelect(team.id)}
              >
                <span className={styles.teamGlyph} aria-hidden="true">
                  {team.name.slice(0, 1)}
                </span>
                <span>
                  <b>{team.name}</b>
                  <small>
                    {roleLabels[team.role]} · {team.memberCount} 位成員
                  </small>
                </span>
                {team.activeCampaignCount > 0 && (
                  <em>{team.activeCampaignCount}</em>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CreateTeamForm({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = name.trim();
    if (!normalized || normalized.length > 60) {
      setError('團隊名稱需為 1–60 個字。');
      return;
    }
    setError('');
    if (await onCreate(normalized)) setName('');
  }

  return (
    <section className={`${styles.panel} ${styles.createTeamPanel}`}>
      <span className={styles.eyebrow}>NEW TEAM</span>
      <h2>建立邀請制團隊</h2>
      <form className={styles.compactForm} onSubmit={submit}>
        <label>
          團隊名稱
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="例如：週五圓山晚餐團"
            required
          />
        </label>
        {error && <p className={styles.formError}>{error}</p>}
        <button className={styles.secondaryButton} disabled={busy}>
          {busy ? <LoaderCircle className={styles.spinner} /> : <Plus />}
          {busy ? '建立中…' : '建立團隊'}
        </button>
      </form>
    </section>
  );
}

function TeamOverview({ team }: { team: TeamDto }) {
  return (
    <section
      className={styles.teamOverview}
      aria-labelledby="selected-team-title"
    >
      <div>
        <span className={styles.eyebrow}>SELECTED TEAM</span>
        <h2 id="selected-team-title">{team.name}</h2>
        <p>
          你的角色是 {roleLabels[team.role]}。團隊狀態：
          {team.status === 'ACTIVE' ? '使用中' : '已封存'}。
        </p>
      </div>
      <div className={styles.stats}>
        <span>
          <b>{team.memberCount}</b>
          <small>成員</small>
        </span>
        <span>
          <b>{team.activeCampaignCount}</b>
          <small>進行中</small>
        </span>
        <span>
          <b>v{team.version}</b>
          <small>伺服器版本</small>
        </span>
      </div>
    </section>
  );
}

function InviteCreator({
  team,
  busy,
  onCreate,
  onNotice,
}: {
  team: TeamDto;
  busy: boolean;
  onCreate: (maxUses: number) => Promise<TeamInviteDto | null>;
  onNotice: (notice: Notice) => void;
}) {
  const [maxUses, setMaxUses] = useState(10);
  const [inviteResult, setInviteResult] = useState<{
    teamId: string;
    invite: TeamInviteDto;
    link: string;
  } | null>(null);
  const activeInvite = inviteResult?.teamId === team.id ? inviteResult : null;
  const canInvite =
    team.status === 'ACTIVE' &&
    (team.role === 'OWNER' || team.role === 'ADMIN');

  async function create() {
    const nextInvite = await onCreate(maxUses);
    if (!nextInvite) return;
    const url = new URL('/team', window.location.origin);
    url.hash = new URLSearchParams({ invite: nextInvite.token }).toString();
    setInviteResult({
      teamId: team.id,
      invite: nextInvite,
      link: url.toString(),
    });
  }

  async function copyLink() {
    if (!activeInvite) return;
    try {
      await navigator.clipboard.writeText(activeInvite.link);
      onNotice({ tone: 'success', text: '邀請連結已複製。' });
    } catch {
      onNotice({ tone: 'error', text: '無法自動複製，請選取連結手動複製。' });
    }
  }

  async function shareLink() {
    if (!activeInvite) return;
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: `加入 ${team.name}`,
        text: `一起加入「${team.name}」登記意願。`,
        url: activeInvite.link,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      await copyLink();
    }
  }

  return (
    <section className={styles.inviteCard} aria-labelledby="invite-title">
      <div className={styles.inviteCopy}>
        <span className={styles.iconTile} aria-hidden="true">
          <UserPlus />
        </span>
        <span>
          <h2 id="invite-title">邀請可信任的夥伴</h2>
          <p>邀請預設 72 小時失效；token 只放在網址 fragment。</p>
        </span>
      </div>
      {canInvite ? (
        <div className={styles.inviteActions}>
          <label>
            使用上限
            <input
              type="number"
              min={1}
              max={50}
              value={maxUses}
              onChange={(event) => setMaxUses(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void create()}
            disabled={busy || maxUses < 1 || maxUses > 50}
          >
            {busy ? <LoaderCircle className={styles.spinner} /> : <Link2 />}
            {busy ? '建立中…' : '建立邀請'}
          </button>
        </div>
      ) : (
        <p className={styles.permissionCopy}>只有團主或管理員可以建立邀請。</p>
      )}
      {activeInvite && (
        <div className={styles.linkResult}>
          <span>
            <b>邀請已就緒</b>
            <small>
              {formatDate(activeInvite.invite.expiresAt)} 到期 · 最多{' '}
              {activeInvite.invite.maxUses} 次
            </small>
          </span>
          <input
            aria-label="邀請連結"
            readOnly
            value={activeInvite.link}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            type="button"
            className={styles.smallButton}
            onClick={() => void copyLink()}
          >
            <Copy aria-hidden="true" />
            複製
          </button>
          <button
            type="button"
            className={styles.smallButton}
            onClick={() => void shareLink()}
          >
            <Send aria-hidden="true" />
            分享
          </button>
        </div>
      )}
    </section>
  );
}

function CampaignList({
  campaigns,
  phase,
  selectedId,
  onSelect,
}: {
  campaigns: TeamCampaignDto[];
  phase: LoadPhase;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className={styles.panel} aria-labelledby="campaign-list-title">
      <div className={styles.panelHeading}>
        <span>
          <small>CAMPAIGNS</small>
          <h2 id="campaign-list-title">意願活動</h2>
        </span>
        {phase === 'loading' && <LoaderCircle className={styles.spinner} />}
      </div>
      {phase === 'error' ? (
        <p className={styles.mutedCopy}>活動清單載入失敗，請重新選擇團隊。</p>
      ) : campaigns.length === 0 ? (
        <p className={styles.mutedCopy}>目前沒有活動。</p>
      ) : (
        <ul className={styles.campaignList}>
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <button
                type="button"
                className={`${styles.campaignButton} ${selectedId === campaign.id ? styles.selectedCampaign : ''}`}
                aria-pressed={selectedId === campaign.id}
                onClick={() => onSelect(campaign.id)}
              >
                <span>
                  <b>{campaign.title}</b>
                  <small>{formatDate(campaign.deadline)} 截止</small>
                </span>
                <em data-status={campaign.status}>
                  {statusLabels[campaign.status]}
                </em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CampaignDetail({
  campaign,
  busyAction,
  onRefresh,
  onCommit,
}: {
  campaign: TeamCampaignDto;
  busyAction: string | null;
  onRefresh: () => void;
  onCommit: (action: 'PLEDGE' | 'WITHDRAW', quantity: number) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(
    campaign.myCommitment?.status === 'PLEDGED'
      ? campaign.myCommitment.quantity
      : 1,
  );
  const progress = Math.min(
    100,
    Math.round(
      (campaign.progress.pledgedPeople / campaign.progress.targetPeople) * 100,
    ),
  );
  const deadlinePassed = campaign.status === 'EXPIRED';
  const writable =
    !deadlinePassed && ['OPEN', 'THRESHOLD_MET'].includes(campaign.status);
  const pledged =
    campaign.myCommitment?.status === 'PLEDGED' ||
    campaign.myCommitment?.status === 'CONFIRMED';
  const busy = busyAction === `commit:${campaign.id}`;
  const refreshing = busyAction === `refresh-campaign:${campaign.id}`;

  return (
    <article className={styles.campaignDetail} aria-labelledby="campaign-title">
      <div className={styles.detailHeading}>
        <span>
          <em data-status={campaign.status}>{statusLabels[campaign.status]}</em>
          <h2 id="campaign-title">{campaign.title}</h2>
        </span>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="更新活動進度"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={refreshing ? styles.spinner : ''} />
        </button>
      </div>

      <div className={styles.placeSummary}>
        <MapPin aria-hidden="true" />
        <span>
          <b>{campaign.offer.title}</b>
          <small>
            {campaign.offer.verificationStatus === 'UNVERIFIED'
              ? '未查證的團隊意願地點'
              : '地點資料由伺服器回傳'}
          </small>
        </span>
      </div>

      <div className={styles.progressHeader}>
        <span>
          <b>
            {campaign.progress.pledgedPeople} / {campaign.progress.targetPeople}{' '}
            人
          </b>
          <small>伺服器即時計算</small>
        </span>
        <strong>{progress}%</strong>
      </div>
      <progress
        className={styles.progressTrack}
        aria-label="活動人數進度"
        max={campaign.progress.targetPeople}
        value={Math.min(
          campaign.progress.pledgedPeople,
          campaign.progress.targetPeople,
        )}
      />
      <div className={styles.progressMeta}>
        <span>
          <Users aria-hidden="true" />
          {campaign.progress.pledgedPeople} 人已登記
        </span>
        <span>
          <Clipboard aria-hidden="true" />
          {campaign.progress.pledgedQuantity} 份意願
          {campaign.progress.targetQuantity === null
            ? ''
            : ` / 目標 ${campaign.progress.targetQuantity}`}
        </span>
        <span>
          <CalendarClock aria-hidden="true" />
          {formatDate(campaign.deadline)} 截止
        </span>
      </div>

      <div className={styles.noPriceCallout}>
        <ShieldCheck aria-hidden="true" />
        <span>
          <b>
            {!campaign.pricingVerified || campaign.offer.type === 'TEAM_INTENT'
              ? '未定價意願，不顯示金額'
              : campaign.progress.thresholdMet
                ? '已達意願門檻，價格仍須向來源確認'
                : '驗證價格仍為條件資訊，達門檻前不視為取得'}
          </b>
          <small>
            登記不是付款、訂單或履約保證；實際交易請由成員自行確認。
          </small>
        </span>
      </div>

      {pledged && (
        <div className={styles.myCommitment}>
          <Check aria-hidden="true" />
          <span>
            <b>我的意願：{campaign.myCommitment?.quantity} 份</b>
            <small>
              狀態 {campaign.myCommitment?.status} · 更新於{' '}
              {campaign.myCommitment
                ? formatDate(campaign.myCommitment.updatedAt)
                : '—'}
            </small>
          </span>
        </div>
      )}

      {!writable ? (
        <InlineState
          tone="warning"
          text={
            deadlinePassed || campaign.status === 'EXPIRED'
              ? '活動已截止，無法再變更意願。'
              : `活動目前為「${statusLabels[campaign.status]}」，無法變更意願。`
          }
        />
      ) : (
        <div className={styles.commitActions}>
          <label>
            登記數量
            <input
              type="number"
              min={1}
              max={10_000}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void onCommit('PLEDGE', quantity)}
            disabled={busy || quantity < 1 || quantity > 10_000}
          >
            {busy ? <LoaderCircle className={styles.spinner} /> : <Check />}
            {pledged ? '更新我的意願' : '登記我的意願'}
          </button>
          {pledged && (
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() => void onCommit('WITHDRAW', quantity)}
              disabled={busy}
            >
              撤回
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function CreateCampaignForm({
  team,
  places,
  phase,
  warning,
  busy,
  onRetryCatalog,
  onCreate,
}: {
  team: TeamDto;
  places: CatalogItem[];
  phase: LoadPhase;
  warning: string;
  busy: boolean;
  onRetryCatalog: () => void;
  onCreate: (input: {
    offerId: null;
    catalogItemId: string;
    title: string;
    targetPeople: number;
    targetQuantity: number | null;
    deadline: string;
  }) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [selectedPlaceId, setSelectedPlaceId] = useState('');
  const [title, setTitle] = useState('');
  const [targetPeople, setTargetPeople] = useState(5);
  const [targetQuantity, setTargetQuantity] = useState('');
  const [deadline, setDeadline] = useState(defaultDeadlineValue);
  const [error, setError] = useState('');
  const canCreate =
    team.status === 'ACTIVE' &&
    (team.role === 'OWNER' || team.role === 'ADMIN');

  const filteredPlaces = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('zh-TW');
    return places
      .filter((place) => category === 'ALL' || place.categoryKey === category)
      .filter(
        (place) =>
          !normalized ||
          `${place.title} ${place.address ?? ''} ${place.provider}`
            .toLocaleLowerCase('zh-TW')
            .includes(normalized),
      )
      .slice(0, 18);
  }, [category, places, search]);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = places.find((place) => place.id === selectedPlaceId);
    const normalizedTitle = title.trim();
    const deadlineDate = new Date(deadline);
    const quantity = targetQuantity.trim() ? Number(targetQuantity) : null;
    if (!selected) {
      setError('請先從 catalog 選擇一個地點。');
      return;
    }
    if (!normalizedTitle || normalizedTitle.length > 120) {
      setError('活動標題需為 1–120 個字。');
      return;
    }
    if (targetPeople < 2 || targetPeople > 50) {
      setError('目標人數需為 2–50 人。');
      return;
    }
    if (quantity !== null && (quantity < 1 || quantity > 10_000)) {
      setError('目標數量需為 1–10,000，或留空。');
      return;
    }
    if (
      !Number.isFinite(deadlineDate.getTime()) ||
      deadlineDate <= new Date()
    ) {
      setError('截止時間必須在未來。');
      return;
    }
    setError('');
    await onCreate({
      offerId: null,
      catalogItemId: selected.id,
      title: normalizedTitle,
      targetPeople,
      targetQuantity: quantity,
      deadline: deadlineDate.toISOString(),
    });
  }

  return (
    <section
      className={styles.createCampaign}
      aria-labelledby="create-campaign-title"
    >
      <div className={styles.sectionHeading}>
        <span>
          <span className={styles.eyebrow}>NEW INTENT</span>
          <h2 id="create-campaign-title">從可信 catalog 發起意願</h2>
        </span>
        <div className={styles.unpricedBadge}>UNPRICED · 未定價</div>
      </div>
      {!canCreate ? (
        <InlineState
          tone="warning"
          text="只有團主或管理員可以建立活動；你仍可查看與登記現有活動。"
        />
      ) : (
        <form className={styles.campaignForm} onSubmit={submit}>
          <div className={styles.pickerColumn}>
            <div className={styles.pickerFilters}>
              <label>
                搜尋地點
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="名稱、地址或來源"
                />
              </label>
              <label>
                分類
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="ALL">全部</option>
                  {catalogCategories.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.placePicker} aria-label="Catalog 地點">
              {phase === 'loading' ? (
                <LoadingPanel label="正在載入 catalog 地點…" compact />
              ) : phase === 'error' ? (
                <InlineState
                  text={warning || '地點清單暫時無法載入。'}
                  action="重新載入"
                  onAction={onRetryCatalog}
                />
              ) : filteredPlaces.length === 0 ? (
                <InlineState text="沒有符合條件的地點，請更換搜尋或分類。" />
              ) : (
                filteredPlaces.map((place) => (
                  <button
                    type="button"
                    key={place.id}
                    className={`${styles.placeButton} ${selectedPlaceId === place.id ? styles.selectedPlace : ''}`}
                    aria-pressed={selectedPlaceId === place.id}
                    onClick={() => {
                      setSelectedPlaceId(place.id);
                      setTitle((current) => current || `${place.title} 一起去`);
                    }}
                  >
                    <span className={styles.placeIcon} aria-hidden="true">
                      <MapPin />
                    </span>
                    <span>
                      <b>{place.title}</b>
                      <small>{place.address ?? '地址待來源補充'}</small>
                      <em>
                        {place.categoryLabel} · {place.verification.label}
                      </em>
                    </span>
                    {selectedPlaceId === place.id && (
                      <Check aria-hidden="true" />
                    )}
                  </button>
                ))
              )}
            </div>
            {warning && phase === 'ready' && (
              <p className={styles.catalogWarning}>{warning}</p>
            )}
          </div>

          <div className={styles.fieldsColumn}>
            <label>
              活動標題
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                placeholder="例如：週五一起吃晚餐"
                required
              />
            </label>
            <div className={styles.fieldRow}>
              <label>
                目標人數
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={targetPeople}
                  onChange={(event) =>
                    setTargetPeople(Number(event.target.value))
                  }
                  required
                />
              </label>
              <label>
                目標數量（選填）
                <input
                  type="number"
                  min={1}
                  max={10_000}
                  value={targetQuantity}
                  onChange={(event) => setTargetQuantity(event.target.value)}
                  placeholder="留空即可"
                />
              </label>
            </div>
            <label>
              截止時間
              <input
                type="datetime-local"
                min={minimumDeadlineValue()}
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                required
              />
            </label>
            <div className={styles.intentGuardrail}>
              <AlertTriangle aria-hidden="true" />
              <span>
                <b>這是未查證、未定價的意願活動</b>
                <small>
                  系統只使用 catalogItemId
                  與標題建立意願，不接受前端價格，也不建立付款或訂單。
                </small>
              </span>
            </div>
            {error && (
              <p className={styles.formError} role="alert">
                {error}
              </p>
            )}
            <button
              className={styles.primaryButton}
              disabled={busy || phase !== 'ready'}
            >
              {busy ? <LoaderCircle className={styles.spinner} /> : <Plus />}
              {busy ? '建立中…' : '建立未定價意願活動'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function LoadingPanel({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`${styles.loadingPanel} ${compact ? styles.compactState : ''}`}
    >
      <LoaderCircle className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
  compact = false,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`${styles.emptyState} ${compact ? styles.compactState : ''}`}
    >
      <span className={styles.iconTile}>{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function InlineState({
  text,
  action,
  onAction,
  tone = 'neutral',
}: {
  text: string;
  action?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <div
      className={`${styles.inlineState} ${tone === 'warning' ? styles.warningState : ''}`}
    >
      {tone === 'warning' ? (
        <AlertTriangle aria-hidden="true" />
      ) : (
        <Clock3 aria-hidden="true" />
      )}
      <span>{text}</span>
      {action && onAction && (
        <button type="button" className={styles.smallButton} onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
