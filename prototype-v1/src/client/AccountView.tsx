import { useEffect, useRef, useState } from "react";
import { ArrowRight, LogIn, Save, ShieldCheck, UserRound } from "lucide-react";
import { DOT_COLORS, PREFS, TAGS } from "../shared/records.ts";
import { mergeAccountChanges } from "../shared/account-merge.ts";
import { currentAccountMonth } from "../shared/account.ts";
import type { useAccount } from "./useAccount.ts";
import { displayAvatarColor, displayTagLabel } from "./display.ts";
import "./compact-support.css";

type Account = ReturnType<typeof useAccount>;

type AccountViewProps = {
  account: Account;
  onDone: () => void;
  supportEmail: string | null;
};
type SettingsViewProps = {
  account: Account;
  onLogin: () => void;
  onInstall: () => void;
  installable: boolean;
};

export function AccountView({ account, onDone, supportEmail }: AccountViewProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");

  return (
    <section className="screen auth-screen compact-support compact-account">
      <h1>{account.user ? "你的帳號" : mode === "login" ? "登入生活帳號" : "建立生活帳號"}</h1>
      <p className="section-copy compact-lede">不登入也能搜尋並保存在此瀏覽器；登入後可跨裝置同步。</p>


      {account.restoring ? (
        <p role="status">正在載入帳號資料…</p>
      ) : account.user ? (
        <>
          <div className="account-card compact-account-card">
            <UserRound aria-hidden="true" />
            <div>
              <h2>{account.user.nickname}</h2>
              <p>@{account.user.username}</p>
              <small>已登入</small>
            </div>
          </div>
          <button className="primary-action" onClick={onDone}>回到生活探索<ArrowRight aria-hidden="true" /></button>
          <button
            className="secondary-action"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await account.signOut();
              } catch (caught) {
                setError((caught as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            登出
          </button>
        </>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              await account.authenticate(mode, username, password, nickname);
              setPassword("");
              onDone();
            } catch (caught) {
              setError((caught as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="segmented">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>登入</button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>註冊</button>
          </div>
          <label className="field">
            帳號
            <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required pattern="[A-Za-z0-9_-]{3,30}" minLength={3} maxLength={30} placeholder="3–30 個英數字、_ 或 -" />
          </label>
          {mode === "register" && (
            <label className="field">
              顯示名稱
              <input autoComplete="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} required />
            </label>
          )}
          <label className="field">
            密碼
            <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === "register" ? 12 : 1} maxLength={256} placeholder={mode === "register" ? "至少 12 個字元" : "輸入密碼"} />
          </label>
          <button className="primary-action" disabled={busy || account.restoring}>
            <LogIn aria-hidden="true" />
            {busy ? mode === "login" ? "登入中…" : "建立帳號中…" : mode === "login" ? "登入帳號" : "建立帳號"}
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
      )}

      {error && <p role="alert" className="notice error">{error}</p>}

      <details className="compact-disclosure compact-security-disclosure">
        <summary>
          <span className="compact-summary-label"><ShieldCheck aria-hidden="true" />登入與隱私</span>
          <small>本裝置 + 本分頁</small>
        </summary>
        <div className="compact-disclosure-body">
          <p>訪客清單與設定保留在此瀏覽器；登入時只聯集合併清單與收藏。登入憑證只保留在本分頁，預設 30 分鐘逾時。語音、逐字稿、搜尋條件和精確位置不會寫入帳號資料。</p>
        </div>
      </details>

      {supportEmail && <a className="source-link compact-support-link" href={`mailto:${supportEmail}`}>忘記密碼？聯絡支援（不會直接寄送舊密碼）</a>}
    </section>
  );
}

export function SettingsView({ account, onLogin, onInstall, installable }: SettingsViewProps) {
  const [draft, setDraftValue] = useState(account.data);
  const baseline = useRef(account.data);
  const dirty = useRef(false);
  const setDraft = (value: typeof draft) => { dirty.current = true; setDraftValue(value); };
  useEffect(() => {
    if (!dirty.current) { baseline.current = account.data; setDraftValue(account.data); }
  }, [account.data]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const settings = draft.settings;
  const set = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
    setDraft({ ...draft, settings: { ...settings, [key]: value } });
  };

  return (
    <section className="screen settings-screen compact-support compact-settings">
      <h1>我的生活設定</h1>
      <p className="section-copy compact-lede">{account.user ? "設定會同步到帳號。" : "匿名設定與清單會保留在此瀏覽器。"}</p>


      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            await account.update((latest) => mergeAccountChanges(baseline.current, draft, latest));
            dirty.current = false;
            baseline.current = draft;
            setMessage(account.user ? "設定已儲存到帳號。" : "已儲存在此瀏覽器。");
          } catch (caught) {
            // Shared account.error owns save failures and clears after a successful retry.
            setMessage("");
          } finally {
            setBusy(false);
          }
        }}
      >
        {account.user && (
          <>
            <label className="field">
              顯示名稱
              <input value={draft.profile.nickname} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, nickname: event.target.value } })} required minLength={1} maxLength={30} />
            </label>
            {/* Colour applies on click, not on submit: the avatar reads account data, so a draft-only
                pick looks like nothing happened. Merge keeps it because the draft still holds the old value. */}
            <div className="avatar-colors compact-avatar-colors">
              {DOT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  style={{ background: color }}
                  aria-label={`選擇頭像顏色 ${displayAvatarColor(color)}`}
                  aria-pressed={account.data.profile.color === color}
                  onClick={async () => {
                    try {
                      await account.update((data) => ({ ...data, profile: { ...data.profile, color } }));
                    } catch {
                      // Shared account.error owns save failures and clears after a successful retry.
                    }
                  }}
                >
                  {account.data.profile.color === color ? "✓" : ""}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="field-grid">
          <label className="field">
            本月生活預算
            <input type="number" min="0" max="100000000" step="1" value={settings.monthly_budget ?? ""} onChange={(event) => set("monthly_budget", event.target.value === "" ? null : Number(event.target.value))} placeholder="尚未設定" />
          </label>
          <label className="field">
            本月已花費（自行確認）
            <input type="number" min="0" max="100000000" step="1" value={settings.spent_month === currentAccountMonth() ? settings.spent : 0} onChange={(event) => setDraft({ ...draft, settings: { ...settings, spent: Number(event.target.value), spent_month: currentAccountMonth() } })} required />
          </label>
        </div>

        <label className="check-row"><input type="checkbox" checked={settings.survival} onChange={(event) => set("survival", event.target.checked)} />省錢模式：優先顯示免費選項（仍可能有付費）</label>

        <fieldset className="tag-picker">
          <legend>預設排除</legend>
          <div>
            {TAGS.map((tag) => (
              <button type="button" key={tag} aria-pressed={settings.exclude.includes(tag)} className={settings.exclude.includes(tag) ? "active" : ""} onClick={() => set("exclude", settings.exclude.includes(tag) ? settings.exclude.filter((value) => value !== tag) : [...settings.exclude, tag])}>{displayTagLabel(tag)}</button>
            ))}
          </div>
        </fieldset>
        <fieldset className="tag-picker">
          <legend>預設偏好</legend>
          <div>
            {PREFS.map((pref) => (
              <button type="button" key={pref} aria-pressed={settings.prefs.includes(pref)} className={settings.prefs.includes(pref) ? "active" : ""} onClick={() => set("prefs", settings.prefs.includes(pref) ? settings.prefs.filter((value) => value !== pref) : [...settings.prefs, pref])}>{pref}</button>
            ))}
          </div>
        </fieldset>

        <button className="primary-action" disabled={busy || account.restoring}><Save aria-hidden="true" />{busy ? "儲存中…" : "儲存設定"}</button>
      </form>

      {message && <p role="status" className="notice">{message}</p>}
      {!account.user && <button className="secondary-action" onClick={onLogin}>登入並同步清單與收藏</button>}

      <div className="pwa-card compact-pwa-card">
        <h2 className="compact-pwa-title">把 ALL IN LIFE 放到主畫面</h2>
        <p className="section-copy compact-pwa-copy">快速開啟介面。</p>
        <details className="compact-disclosure compact-pwa-disclosure">
          <summary>
            <span className="compact-summary-label">離線與連線需求</span>
            <small>搜尋需網路</small>
          </summary>
          <div className="compact-disclosure-body">
            <p>離線只能開啟介面；搜尋與帳號需要網路，恢復連線後即可繼續。</p>
          </div>
        </details>
        <button className="secondary-action" onClick={onInstall}>{installable ? "安裝 App" : "查看安裝方式"}</button>
      </div>

      {account.user && (
        <details className="compact-disclosure compact-password-disclosure">
          <summary>
            <span className="compact-summary-label">修改密碼</span>
            <small>會登出所有裝置</small>
          </summary>
          <div className="compact-disclosure-body">
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setMessage("");
                try {
                  await account.password(current, next);
                  setCurrent("");
                  setNext("");
                  onLogin();
                } catch (caught) {
                  setMessage((caught as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="field">目前密碼<input type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} /></label>
              <label className="field">新密碼<input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={next} onChange={(event) => setNext(event.target.value)} /></label>
              <p className="fine-print">修改後，所有裝置都會登出，請重新登入。</p>
              <button className="secondary-action" disabled={busy}>更新密碼並登出所有裝置</button>
            </form>
          </div>
        </details>
      )}
    </section>
  );
}
