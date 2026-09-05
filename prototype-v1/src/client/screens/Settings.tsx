import { DOT_COLORS, PREFS, TAGS, money, type Profile, type Settings as S } from "../../shared/records.ts";
import { Shell } from "./Shell.tsx";

// 設定：Profile, 月預算, 生存模式, 不吃 (hard), 偏好 (soft). All session-local.
export function Settings({ profile, settings, setProfile, setSettings, listCount }: {
  profile: Profile; settings: S; setProfile: (p: Profile) => void; setSettings: (s: S) => void; listCount: number;
}) {
  const remaining = settings.monthly_budget === null ? null : settings.monthly_budget - settings.spent;
  const pct = settings.monthly_budget ? Math.min(100, Math.round((settings.spent / settings.monthly_budget) * 100)) : 0;
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <Shell surface="black" title="返回" listCount={listCount} survival={settings.survival}>
      <section className="rise">
        <p className="eyebrow">SETTINGS · 設定</p>
        <h1 className="display"><span className="outline">我的</span><br /><span className="fill">生活規則</span></h1>
        <p className="note">只存在這支手機的瀏覽工作階段；不註冊、不上傳。</p>
      </section>

      <section className="rise">
        <p className="eyebrow">PROFILE · 暱稱</p>
        <div className="profile">
          <span className="avatar" style={{ background: profile.color }} aria-hidden="true">{profile.nickname.slice(0, 1) || "?"}</span>
          <input value={profile.nickname} maxLength={12} placeholder="暱稱（揪團與回報會顯示）" onChange={(e) => setProfile({ ...profile, nickname: e.target.value })} aria-label="暱稱" />
        </div>
        <div className="dots" role="radiogroup" aria-label="顏色">
          {DOT_COLORS.map((c) => (
            <button key={c} role="radio" aria-checked={profile.color === c} className={`dot ${profile.color === c ? "on" : ""}`} style={{ background: c }} onClick={() => setProfile({ ...profile, color: c })} aria-label={c} />
          ))}
        </div>
      </section>

      <section className="rise">
        <p className="eyebrow">BUDGET · 月預算</p>
        <div className="rows">
          <div className="row"><span className="idx">01</span><label htmlFor="mb">每月預算</label>
            <input id="mb" type="number" inputMode="numeric" placeholder="例如 10000" value={settings.monthly_budget ?? ""} onChange={(e) => setSettings({ ...settings, monthly_budget: e.target.value === "" ? null : Number(e.target.value) })} /></div>
          <div className="row"><span className="idx">02</span><label htmlFor="sp">本月已花</label>
            <input id="sp" type="number" inputMode="numeric" value={settings.spent} onChange={(e) => setSettings({ ...settings, spent: Number(e.target.value) || 0 })} /></div>
          <div className="row total"><span className="idx">=</span><span className="row-label">剩餘</span>
            <span className={`value ${remaining !== null && remaining < 0 ? "over" : ""}`}>{remaining === null ? "—" : money(Math.max(0, remaining))}</span></div>
        </div>
        {settings.monthly_budget !== null && (
          <div className="meter" role="img" aria-label={`已花 ${pct}%`}><span style={{ width: `${pct}%` }} /><b>{pct}%</b></div>
        )}
        <p className="note">沒說預算時，任務預算會用剩餘金額當預設，並標示「來自設定」。清單裡「標記已買」會加進已花。</p>
      </section>

      <section className="rise">
        <p className="eyebrow">MODE · 模式</p>
        <button className={`switch ${settings.survival ? "on" : ""}`} role="switch" aria-checked={settings.survival} onClick={() => setSettings({ ...settings, survival: !settings.survival })}>
          <span className="knob" aria-hidden="true" />
          <span className="switch-text"><b>生存模式</b><small>只看最低可比成本；免費永遠排前面；偏好只當平手加分。</small></span>
        </button>
      </section>

      <section className="rise">
        <p className="eyebrow">EXCLUDE · 不吃（硬限制）</p>
        <div className="chipset">
          {TAGS.map((t) => <button key={t} className={`pick ${settings.exclude.includes(t) ? "on red" : ""}`} aria-pressed={settings.exclude.includes(t)} onClick={() => setSettings({ ...settings, exclude: toggle(settings.exclude, t) })}>{t}</button>)}
        </div>
        <p className="note">含這些標籤的選項不會出現。沒標成分的選項仍會出現，卡片會註明。</p>
      </section>

      <section className="rise">
        <p className="eyebrow">PREFER · 偏好（軟偏好）</p>
        <div className="chipset">
          {PREFS.map((t) => <button key={t} className={`pick ${settings.prefs.includes(t) ? "on" : ""}`} aria-pressed={settings.prefs.includes(t)} onClick={() => setSettings({ ...settings, prefs: toggle(settings.prefs, t) })}>{t}</button>)}
        </div>
      </section>
    </Shell>
  );
}
