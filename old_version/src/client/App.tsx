import { useCallback, useEffect, useRef, useState } from "react";
import { CATEGORIES, type Need } from "../shared/need.ts";
import { ApiError, parse, transcribe } from "./api.ts";
import { MAX_SECONDS, Recorder, recordingSupported } from "./recorder.ts";
import { useHashRoute, go } from "./router.ts";
import { DOT_COLORS, TAGS, comparableTotal, joinCode, type Category, type Profile, type Rec, type Report, type Settings as S, type Team as T } from "./records.ts";
import { MOCK_JOINERS, MOCK_RECORDS, MOCK_REPORTS } from "./mockResults.ts"; // PREVIEW ONLY
import { Settings } from "./screens/Settings.tsx";
import { Team } from "./screens/Team.tsx";
import { Shell } from "./screens/Shell.tsx";
import { Search } from "./screens/Search.tsx";
import { Results } from "./screens/Results.tsx";
import { Detail } from "./screens/Detail.tsx";
import { ListScreen } from "./screens/ListScreen.tsx";

// Preview mode: fabricated records and simulated Agents. Never on in a real build without the flag.
const PREVIEW = import.meta.env.VITE_PREVIEW === "1" || new URLSearchParams(location.search).has("mock");

type Stage = "idle" | "recording" | "transcribing" | "parsing";

// Hard constraints in display order. `kind` drives the editor, so labels are copy only.
const HARD_FIELDS = [
  { key: "budget_total_twd", label: "預算 (TWD)", kind: "number", group: "錢" },
  { key: "free_only", label: "只要免費", kind: "bool", group: "錢" },
  { key: "people_or_servings", label: "人數／份量", kind: "number", group: "人" },
  { key: "date", label: "日期", kind: "text", group: "時間" },
  { key: "time_window", label: "時段", kind: "text", group: "時間" },
  { key: "max_distance_km", label: "最大距離 (km)", kind: "number", group: "距離" },
  { key: "max_minutes", label: "最大時間 (分)", kind: "number", group: "距離" },
  { key: "registration_ok", label: "可先登記", kind: "bool", group: "條件" },
  { key: "eligibility_notes", label: "資格", kind: "text", group: "條件" },
] as const satisfies ReadonlyArray<{ key: keyof Need; label: string; kind: "number" | "text" | "bool"; group: string }>;
const GROUPS = ["錢", "人", "時間", "距離", "條件"] as const;

type Saved = { need: Need | null; transcripts: string[]; list: string[]; favs: string[]; derived: string[]; profile: Profile; settings: S; reports: Report[]; teams: T[] };
const STORAGE_KEY = "ail.session";
const EMPTY: Saved = {
  need: null, transcripts: [], list: [], favs: [], derived: [],
  profile: { nickname: "", color: DOT_COLORS[3] },
  settings: { monthly_budget: null, spent: 0, survival: false, exclude: [], prefs: [] },
  reports: [], teams: [],
};
const load = (): Saved => {
  try { return { ...EMPTY, ...JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") }; } catch { return EMPTY; }
};
const save = (s: Saved) => { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };

const STAGE_TEXT: Record<Stage, string> = { idle: "", recording: "", transcribing: "辨識中…", parsing: "解析中…" };

export function App() {
  const route = useHashRoute();
  const [{ need, transcripts, list, favs, derived, profile, settings, reports, teams }, setSession] = useState<Saved>(load);
  const [records, setRecords] = useState<Rec[] | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [showText, setShowText] = useState(false);
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [sttFailures, setSttFailures] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const recorder = useRef(new Recorder());
  const timer = useRef<number | null>(null);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => save({ need, transcripts, list, favs, derived, profile, settings, reports, teams }), [need, transcripts, list, favs, derived, profile, settings, reports, teams]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => { window.scrollTo(0, 0); }, [route]);

  const setNeed = (n: Need | null) => setSession((s) => ({ ...s, need: n, derived: s.derived.filter((k) => n && s.need && n[k as keyof Need] === s.need[k as keyof Need]) }));
  const allReports = PREVIEW ? [...MOCK_REPORTS, ...reports] : reports;
  const exclude = [...new Set([...(need?.exclude_tags ?? []), ...settings.exclude])];
  const remaining = settings.monthly_budget === null ? null : Math.max(0, settings.monthly_budget - settings.spent);
  // Defaults from settings, applied after parsing and labeled 「來自設定」 on the confirmation screen.
  const withDefaults = (n: Need): { need: Need; derived: string[] } => {
    const d: string[] = [];
    const out = { ...n };
    if (out.budget_total_twd === null && remaining !== null) { out.budget_total_twd = remaining; d.push("budget_total_twd"); }
    if (settings.prefs.length) { const add = settings.prefs.filter((p) => !out.soft_preferences.includes(p)); if (add.length) { out.soft_preferences = [...out.soft_preferences, ...add]; d.push("soft_preferences"); } }
    return { need: out, derived: d };
  };
  const notify = (m: string) => setToast(m);
  const onSearchDone = useCallback((r: Rec[]) => { setRecords(r); go("/results"); }, []);

  // A correction on the confirmation screen is parsed against the current 需求與限制.
  const onConfirm = route === "/confirm";
  const current = onConfirm ? need : null;

  const fallbackToText = (reason: string, prefill = "") => {
    setMessage({ text: reason, error: true });
    setShowText(true);
    if (prefill) setText(prefill);
    setStage("idle");
  };

  const runParse = async (t: string) => {
    setStage("parsing");
    setMessage({ text: STAGE_TEXT.parsing });
    try {
      const parsed = await parse(t, current);
      const { need: n, derived: d } = withDefaults(parsed);
      setSession((s) => ({ ...s, need: n, derived: d, transcripts: current ? [...s.transcripts, t] : [t] }));
      setShowText(false);
      setText("");
      setMessage(null);
      go("/confirm");
    } catch (e) {
      fallbackToText((e as ApiError).kind === "timeout" ? "逾時，請改用文字" : "解析失敗，請改用文字", t);
    } finally {
      setStage("idle");
    }
  };

  const stopRecording = async () => {
    if (timer.current) clearInterval(timer.current);
    setStage("transcribing");
    setMessage({ text: STAGE_TEXT.transcribing });
    const clip = await recorder.current.stop();
    try {
      const { transcript } = await transcribe(clip);
      if (!transcript) {
        setStage("idle");
        setMessage({ text: "沒有聽到內容，再試一次", error: true });
        return;
      }
      setSttFailures(0);
      await runParse(transcript);
    } catch (e) {
      if ((e as ApiError).kind === "timeout") return fallbackToText("逾時，請改用文字");
      const n = sttFailures + 1;
      setSttFailures(n);
      if (n >= 2) return fallbackToText("辨識失敗，請改用文字");
      setStage("idle");
      setMessage({ text: "辨識失敗，再點一次麥克風重試", error: true });
    }
  };
  stopRef.current = stopRecording; // the 30 s auto-stop must call the latest closure

  const toggleMic = async () => {
    if (stage === "recording") return stopRecording();
    if (stage !== "idle") return;
    if (!recordingSupported()) return fallbackToText("此瀏覽器不支援錄音");
    try {
      await recorder.current.start();
    } catch {
      return fallbackToText("無法使用麥克風");
    }
    setStage("recording");
    setMessage(null);
    setSeconds(0);
    const startedAt = Date.now();
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) stopRef.current();
    }, 250);
  };

  const submitText = () => {
    const t = text.trim();
    if (t) runParse(t);
  };

  const mm = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const busy = stage === "transcribing" || stage === "parsing";
  const micText = stage === "recording" ? "點一下結束" : stage === "idle" ? (current ? "說修正" : "開始說") : STAGE_TEXT[stage];
  const micKicker = stage === "idle" ? (current ? "例如「改成三個人」「預算改五百」" : "點一下開始，再點一下結束，30 秒內") : "";

  const mic = (
    <button className="mic" data-recording={stage === "recording"} onClick={toggleMic} disabled={busy} aria-label={`${micText} ${micKicker}`.trim()}>
      <span className="mic-top">
        <span className="rec">
          <span className={`pip ${stage === "recording" ? "" : "off"}`} aria-hidden="true" />
          {stage === "recording" ? "REC" : busy ? "BUSY" : "MIC"}
        </span>
        <span>{stage === "recording" ? `${mm(seconds)} / ${mm(MAX_SECONDS)}` : "圓山區 · zh-TW"}</span>
      </span>
      <span>
        <span className="mic-text">{micText}</span>
        {micKicker && <span className="mic-kicker" style={{ display: "block" }}>{micKicker}</span>}
      </span>
      <span className="mic-bar" style={{ width: stage === "recording" ? `${(seconds / MAX_SECONDS) * 100}%` : 0 }} aria-hidden="true" />
    </button>
  );

  const status = <p className={`status ${message?.error ? "error" : ""}`} role="status" aria-live="polite">{message?.text}</p>;

  const textInput = showText && (
    <section className="rise">
      <p className="eyebrow">TEXT · 文字輸入</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="例如：今天晚餐兩個人預算三百，20 分鐘內，可外帶" />
      <button className="secondary" onClick={submitText} disabled={!text.trim() || stage !== "idle"}>解析</button>
    </section>
  );

  const pips = (
    <span className="pips" aria-hidden="true"><span className="pip blue" /><span className="pip red" /><span className="pip yellow" /></span>
  );

  const toastEl = toast && <div className="toast" role="status">{toast}</div>;
  const byId = (id: string) => (records ?? (PREVIEW ? MOCK_RECORDS : [])).find((r) => r.id === id);
  const shareText = (title: string, lines: string[]) =>
    `${title}\n${chips(need).join(" / ")}\n${lines.join("\n")}\n來源與時間見 ALL in life · 圓山區`;
  const share = async (t: string) => {
    try {
      if (navigator.share) await navigator.share({ text: t });
      else { await navigator.clipboard.writeText(t); notify("已複製到剪貼簿"); }
    } catch { /* user cancelled */ }
  };

  // ---- Routing ----
  if (route === "/settings") {
    return <><Settings profile={profile} settings={settings} listCount={list.length}
      setProfile={(p) => setSession((s) => ({ ...s, profile: p }))} setSettings={(st) => setSession((s) => ({ ...s, settings: st }))} />{toastEl}</>;
  }

  if (route.startsWith("/team/")) {
    const r = byId(route.slice(6));
    if (r?.group_offer) {
      const me = { name: profile.nickname || "我", color: profile.color };
      const team = teams.find((t) => t.rec_id === r.id) ?? { rec_id: r.id, code: joinCode(r.id), members: [me] };
      if (!teams.some((t) => t.rec_id === r.id)) setSession((s) => ({ ...s, teams: [...s.teams, team] }));
      return <><Team r={r} team={team} preview={PREVIEW} joiners={MOCK_JOINERS} listCount={list.length}
        join={(m) => setSession((s) => ({ ...s, teams: s.teams.map((t) => t.rec_id === r.id && !t.members.some((x) => x.name === m.name) ? { ...t, members: [...t.members, m] } : t) }))}
        share={() => share(`一起揪團：${r.title}（${r.provider}）\n加入代碼 ${team.code}\n${r.group_offer!.note}`)} />{toastEl}</>;
    }
  }

  if (route === "/search" && need) {
    return <>{<Search preview={PREVIEW} records={PREVIEW ? MOCK_RECORDS : []} onDone={onSearchDone} listCount={list.length} survival={settings.survival} />}{toastEl}</>;
  }

  if (route.startsWith("/results") && need) {
    const recs = records ?? [];
    const cat = decodeURIComponent(route.split("/")[2] ?? "") as Category;
    const category: Category = (CATEGORIES as readonly string[]).includes(cat) ? cat : (need.target_categories[0] as Category | undefined) ?? CATEGORIES[0];
    return <>
      <Results need={need} records={recs} category={category} setNeed={(n) => { setNeed(n); notify("已放寬限制"); }} listCount={list.length} chips={chips(need)} exclude={exclude} survival={settings.survival} reports={allReports} />
      {PREVIEW && <p className="note preview-note">示範資料：店家、價格與活動皆為虛構。</p>}
      {toastEl}
    </>;
  }

  if (route.startsWith("/card/")) {
    const r = byId(route.slice(6));
    if (r) return <>
      <Detail r={r} listCount={list.length} inList={list.includes(r.id)} fav={favs.includes(r.id)}
        toggleList={() => setSession((s) => ({ ...s, list: s.list.includes(r.id) ? s.list.filter((x) => x !== r.id) : [...s.list, r.id] }))}
        toggleFav={() => setSession((s) => ({ ...s, favs: s.favs.includes(r.id) ? s.favs.filter((x) => x !== r.id) : [...s.favs, r.id] }))}
        share={() => share(shareText(r.title, [`${r.provider} · ${r.data_status} · 確認 ${r.verified_at}`]))}
        reports={allReports} survival={settings.survival}
        report={(reason, note) => { setSession((s) => ({ ...s, reports: [...s.reports, { id: `u${Date.now()}`, rec_id: r.id, reason, note, at: new Date().toISOString(), by: s.profile.nickname || "匿名" }] })); notify(`已回報：${reason}`); }} />
      {toastEl}
    </>;
  }

  if (route === "/list") {
    const items = list.map(byId).filter((r): r is Rec => Boolean(r));
    const favItems = favs.map(byId).filter((r): r is Rec => Boolean(r));
    return <>
      <ListScreen need={need} items={items} favs={favItems} listCount={list.length} survival={settings.survival}
        remove={(id) => setSession((s) => ({ ...s, list: s.list.filter((x) => x !== id) }))}
        bought={(r) => { const t = comparableTotal(r) ?? 0; setSession((s) => ({ ...s, list: s.list.filter((x) => x !== r.id), settings: { ...s.settings, spent: s.settings.spent + t } })); notify(`已加進本月已花：NT$${t}`); }}
        share={() => share(shareText("清單", items.map((r) => `- ${r.title}（${r.provider}）確認 ${r.verified_at}`)))} />
      {toastEl}
    </>;
  }

  if (route === "/confirm" && need) {
    const set = <K extends keyof Need>(k: K, v: Need[K]) => setNeed({ ...need, [k]: v });
    const given = HARD_FIELDS.filter((f) => need[f.key] !== null && need[f.key] !== false);
    const missing = HARD_FIELDS.filter((f) => !given.includes(f));
    let n = 0;
    const field = (f: (typeof HARD_FIELDS)[number]) => (
      <Field key={f.key} idx={++n} label={f.label} kind={f.kind} value={need[f.key]} fromSettings={derived.includes(f.key)} onChange={(v) => set(f.key, v as Need[typeof f.key])} />
    );
    return <>
      <Shell surface="black" title="重新說" listCount={list.length} survival={settings.survival}>
        <section className="rise">
          <p className="eyebrow">{pips} 02 / 03 · 確認</p>
          <h1 className="display"><span className="outline">需求</span><br /><span className="fill">與限制</span></h1>
        </section>
        {transcripts.length > 0 && (
          <section className="rise">
            <p className="eyebrow">HEARD · 我們聽到的</p>
            {transcripts.map((t, i) => <p key={i} className="lead quote">{i > 0 ? `修正：${t}` : t}</p>)}
          </section>
        )}
        <section className="rise">
          <p className="eyebrow">NEED · 我們理解的</p>
          <div className="rows">
            <Field idx={0} label="需求" kind="text" value={need.need} onChange={(v) => set("need", String(v ?? ""))} />
            <div className="row">
              <span className="idx">··</span>
              <span className="row-label">類別</span>
              <span className={`value ${need.target_categories.length ? "" : "unlimited"}`}>{need.target_categories.join(" / ") || "全部"}</span>
            </div>
          </div>
        </section>
        <section className="rise">
          <p className="eyebrow">HARD · 硬限制{settings.survival && <span className="modechip">生存模式</span>}</p>
          {GROUPS.map((g) => {
            const rows = given.filter((f) => f.group === g);
            return rows.length ? <div key={g} className="group"><span className="group-label">{g}</span><div className="rows">{rows.map(field)}</div></div> : null;
          })}
          <div className="group"><span className="group-label">不吃</span>
            <div className="chipset">
              {TAGS.map((t) => {
                const on = exclude.includes(t), fromS = settings.exclude.includes(t);
                return <button key={t} className={`pick ${on ? "on red" : ""}`} aria-pressed={on} onClick={() => set("exclude_tags", on ? need.exclude_tags.filter((x) => x !== t) : [...need.exclude_tags, t])}>{t}{fromS && on && <small> 設定</small>}</button>;
              })}
            </div>
          </div>
          {given.length === 0 && exclude.length === 0 && <div className="rows"><div className="row"><span className="idx">··</span><span className="row-label">—</span><span className="value unlimited">無</span></div></div>}
        </section>
        <section className="rise">
          <p className="eyebrow">SOFT · 軟偏好</p>
          <div className="rows">
            <Field idx={0} label="偏好" kind="text" value={need.soft_preferences.join("、")} fromSettings={derived.includes("soft_preferences")}
              onChange={(v) => set("soft_preferences", String(v ?? "").split(/[、,，]/).map((x) => x.trim()).filter(Boolean))} />
          </div>
        </section>
        {missing.length > 0 && (
          <section className="rise">
            <p className="eyebrow">OPEN · 未提供</p>
            <div className="rows">{missing.map(field)}</div>
          </section>
        )}
        {need.unresolved.length > 0 && (
          <section className="rise">
            <p className="eyebrow">?? · 聽到但不確定</p>
            <ul>{need.unresolved.map((u) => <li key={u}>{u}</li>)}</ul>
          </section>
        )}
        <section className="rise">
          {mic}
          {status}
          {textInput}
          <button className="primary" disabled={!need.need.trim() || stage !== "idle"} onClick={() => go("/search")}>搜尋 →</button>
          {!need.need.trim() && <p className="note acid">請說明你想找什麼</p>}
          <button className="link muted" onClick={() => { setSession((s) => ({ ...s, need: null, transcripts: [] })); setRecords(null); go("/"); }}>← 重新開始</button>
        </section>
      </Shell>
      {toastEl}
    </>;
  }

  // Landing (also the fallback for any route that needs a need but has none).
  return <>
    <Shell surface="black" home listCount={list.length} survival={settings.survival}>
      <section className="rise">
        <p className="eyebrow">{pips} 01 / 03 · 說</p>
        <h1 className="display"><span className="outline">說出</span><br /><span className="fill">需求</span></h1>
        <p className="lead">預算、人數、時間、距離，一句話講完。<br />先套限制，再找最低可比成本。</p>
      </section>
      <div className="void" />
      <section className="rise">
        {mic}
        <p className="note">語音會傳送到第三方辨識服務進行辨識，不會被保存。</p>
        {status}
        {!showText && <button className="link muted" onClick={() => setShowText(true)}>改用文字輸入</button>}
        {textInput}
        {need && <button className="link acid" onClick={() => go("/confirm")}>繼續上次的需求</button>}
        {remaining !== null && <p className="note">本月剩餘 NT${remaining}{settings.survival ? " · 生存模式" : ""}</p>}
      </section>
    </Shell>
    {toastEl}
  </>;
}

type Value = string | number | boolean | null;

// A null value renders as a visible 「無限制」 that becomes an editor on tap.
function Field({ idx, label, kind, value, onChange, fromSettings }: { idx: number; label: string; kind: "number" | "text" | "bool"; value: Need[keyof Need]; onChange: (v: Value) => void; fromSettings?: boolean }) {
  const [editing, setEditing] = useState(false);
  const empty = value === null || value === "" || (kind === "bool" && value === false);
  const index = <span className="idx">{idx ? String(idx).padStart(2, "0") : "··"}</span>;
  const from = fromSettings && <span className="fromtag">來自設定</span>;

  if (empty && !editing) {
    return (
      <div className="row">
        {index}
        <span className="row-label">{label}</span>
        <button className="link muted" onClick={() => setEditing(true)} aria-label={`${label}：無限制，點一下設定`}>
          {label === "需求" ? "必填，點一下輸入" : "—— 無限制"}
        </button>
      </div>
    );
  }

  if (kind === "bool") {
    return (
      <div className="row">
        {index}
        <label htmlFor={label}>{label}{from}</label>
        <select id={label} value={value ? "是" : "否"} onChange={(e) => onChange(e.target.value === "是")} onBlur={() => setEditing(false)}>
          <option>是</option><option>否</option>
        </select>
      </div>
    );
  }

  const shown = value === null ? "" : Array.isArray(value) ? value.join("、") : String(value);
  return (
    <div className="row">
      {index}
      <label htmlFor={label}>{label}{from}</label>
      <input id={label} type={kind === "number" ? "number" : "text"} inputMode={kind === "number" ? "decimal" : "text"}
        value={shown} autoFocus={editing} onBlur={() => setEditing(false)}
        onChange={(e) => {
          const s = e.target.value.trim();
          if (kind === "number") onChange(s === "" || !Number.isFinite(Number(s)) ? null : Number(s));
          else onChange(s === "" ? null : e.target.value);
        }} />
    </div>
  );
}

function chips(n: Need | null): string[] {
  if (!n) return [];
  const c = [n.need];
  if (n.people_or_servings !== null) c.push(`${n.people_or_servings} 人`);
  if (n.budget_total_twd !== null) c.push(`NT$${n.budget_total_twd}`);
  if (n.date) c.push(n.date);
  if (n.time_window) c.push(n.time_window);
  if (n.max_minutes !== null) c.push(`${n.max_minutes} 分鐘內`);
  if (n.max_distance_km !== null) c.push(`${n.max_distance_km} km 內`);
  if (n.free_only) c.push("只要免費");
  if (n.registration_ok) c.push("可先登記");
  if (n.eligibility_notes) c.push(n.eligibility_notes);
  return c.concat(n.soft_preferences).filter(Boolean);
}
