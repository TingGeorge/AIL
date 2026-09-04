import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type Need } from "../shared/need.ts";
import { ApiError, parse, transcribe } from "./api.ts";
import { MAX_SECONDS, Recorder, recordingSupported } from "./recorder.ts";

// Screens and transitions follow docs/SPEC-voice-input.md §2.2.
type Screen = "landing" | "confirming" | "dashboard";
type Stage = "idle" | "recording" | "transcribing" | "parsing";

// Hard constraints in display order. `kind` drives the editor, so labels are copy only.
const HARD_FIELDS = [
  { key: "budget_total_twd", label: "預算 (TWD)", kind: "number" },
  { key: "people_or_servings", label: "人數／份量", kind: "number" },
  { key: "date", label: "日期", kind: "text" },
  { key: "time_window", label: "時段", kind: "text" },
  { key: "max_distance_km", label: "最大距離 (km)", kind: "number" },
  { key: "max_minutes", label: "最大時間 (分)", kind: "number" },
  { key: "free_only", label: "只要免費", kind: "bool" },
  { key: "registration_ok", label: "可先登記", kind: "bool" },
  { key: "eligibility_notes", label: "資格", kind: "text" },
] as const satisfies ReadonlyArray<{ key: keyof Need; label: string; kind: "number" | "text" | "bool" }>;

type Saved = { need: Need | null; transcripts: string[]; screen: Screen };
const STORAGE_KEY = "ail.session";
const load = (): Saved => {
  try { return { need: null, transcripts: [], screen: "landing", ...JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") }; }
  catch { return { need: null, transcripts: [], screen: "landing" }; }
};
const save = (s: Saved) => { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };

const STAGE_TEXT: Record<Stage, string> = { idle: "", recording: "", transcribing: "辨識中…", parsing: "解析中…" };

export function App() {
  const [{ need, transcripts, screen }, setSession] = useState<Saved>(load);
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [showText, setShowText] = useState(false);
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [sttFailures, setSttFailures] = useState(0);
  const recorder = useRef(new Recorder());
  const timer = useRef<number | null>(null);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => save({ need, transcripts, screen }), [need, transcripts, screen]);

  const setNeed = (n: Need | null) => setSession((s) => ({ ...s, need: n }));
  const setScreen = (sc: Screen) => setSession((s) => ({ ...s, screen: sc }));
  // A correction on the confirmation screen is parsed against the current 需求與限制.
  const current = screen === "confirming" ? need : null;

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
      const n = await parse(t, current);
      setSession((s) => ({ need: n, transcripts: current ? [...s.transcripts, t] : [t], screen: "confirming" }));
      setShowText(false);
      setText("");
      setMessage(null);
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

  const mm = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const micLabel =
    stage === "recording" ? `錄音中 ${mm(seconds)} / ${mm(MAX_SECONDS)}，點一下結束`
    : stage === "idle" ? (current ? "點一下說修正，例如「改成三個人」" : "點一下開始說")
    : STAGE_TEXT[stage];

  const mic = (
    <button className="mic" data-recording={stage === "recording"} onClick={toggleMic}
      disabled={stage === "transcribing" || stage === "parsing"} aria-label={micLabel}>
      🎤 {micLabel}
    </button>
  );

  const status = <p className={`status ${message?.error ? "error" : ""}`} role="status" aria-live="polite">{message?.text}</p>;

  const textInput = showText && (
    <section>
      <h2>文字輸入</h2>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="例如：今天晚餐兩個人預算三百，20 分鐘內，可外帶" />
      <button className="primary" onClick={submitText} disabled={!text.trim() || stage !== "idle"}>解析</button>
    </section>
  );

  if (screen === "confirming" && need) {
    const set = <K extends keyof Need>(k: K, v: Need[K]) => setNeed({ ...need, [k]: v });
    const given = HARD_FIELDS.filter((f) => need[f.key] !== null && need[f.key] !== false);
    const missing = HARD_FIELDS.filter((f) => !given.includes(f));
    return (
      <main>
        <h1>確認需求與限制</h1>
        {transcripts.length > 0 && (
          <section>
            <h2>我們聽到的</h2>
            {transcripts.map((t, i) => <p key={i} className="transcript">{i > 0 ? `修正：${t}` : t}</p>)}
          </section>
        )}
        <section>
          <h2>我們理解的：需求</h2>
          <Field label="需求" kind="text" value={need.need} onChange={(v) => set("need", String(v ?? ""))} />
          <div className="field"><label>類別</label><span>{need.target_categories.join("、") || <span className="unlimited">全部</span>}</span></div>
        </section>
        <section>
          <h2>硬限制</h2>
          {given.map((f) => <Field key={f.key} label={f.label} kind={f.kind} value={need[f.key]} onChange={(v) => set(f.key, v as Need[typeof f.key])} />)}
          {given.length === 0 && <p className="unlimited">無</p>}
        </section>
        <section>
          <h2>軟偏好</h2>
          <Field label="偏好" kind="text" value={need.soft_preferences.join("、")}
            onChange={(v) => set("soft_preferences", String(v ?? "").split(/[、,，]/).map((x) => x.trim()).filter(Boolean))} />
        </section>
        {missing.length > 0 && (
          <section>
            <h2>未提供</h2>
            {missing.map((f) => <Field key={f.key} label={f.label} kind={f.kind} value={need[f.key]} onChange={(v) => set(f.key, v as Need[typeof f.key])} />)}
          </section>
        )}
        {need.unresolved.length > 0 && (
          <section><h2>聽到但不確定</h2><ul>{need.unresolved.map((u) => <li key={u}>{u}</li>)}</ul></section>
        )}
        {mic}
        {status}
        {textInput}
        <button className="primary" disabled={!need.need.trim() || stage !== "idle"} onClick={() => setScreen("dashboard")}>搜尋</button>
        {!need.need.trim() && <p className="note error">請說明你想找什麼</p>}
        <button className="secondary" onClick={() => setSession({ need: null, transcripts: [], screen: "landing" })}>重新開始</button>
      </main>
    );
  }

  if (screen === "dashboard" && need) {
    const ordered = [...CATEGORIES].sort((a, b) => Number(need.target_categories.includes(b)) - Number(need.target_categories.includes(a)));
    return (
      <main>
        <h1>結果</h1>
        <button className="chips" onClick={() => setScreen("confirming")} aria-label="編輯需求與限制">
          {chips(need).map((c) => <span key={c} className="chip">{c}</span>)}
        </button>
        {/* ponytail: dashboard placeholder. Search + five-category results are PRD scope, not voice scope. */}
        {ordered.map((c) => (
          <section key={c}><h2>{c}{need.target_categories.includes(c) ? "（相關）" : ""}</h2><p className="unlimited">搜尋尚未接上</p></section>
        ))}
      </main>
    );
  }

  return (
    <main>
      <h1>ALL in life</h1>
      <p className="area">目前區域：圓山區</p>
      {mic}
      <p className="note">語音會傳送到第三方辨識服務進行辨識，不會被保存。</p>
      {status}
      {!showText && <button className="link" onClick={() => setShowText(true)}>改用文字輸入</button>}
      {textInput}
    </main>
  );
}

type Value = string | number | boolean | null;

// A null value renders as a visible 「無限制」 that becomes an editor on tap.
function Field({ label, kind, value, onChange }: { label: string; kind: "number" | "text" | "bool"; value: Need[keyof Need]; onChange: (v: Value) => void }) {
  const [editing, setEditing] = useState(false);
  const empty = value === null || value === "" || (kind === "bool" && value === false);

  if (empty && !editing) {
    return (
      <div className="field">
        <label>{label}</label>
        <button className="link" onClick={() => setEditing(true)} aria-label={`${label}：無限制，點一下設定`}>
          {label === "需求" ? "必填，點一下輸入" : "無限制"}
        </button>
      </div>
    );
  }

  if (kind === "bool") {
    return (
      <div className="field">
        <label htmlFor={label}>{label}</label>
        <select id={label} value={value ? "是" : "否"} onChange={(e) => onChange(e.target.value === "是")} onBlur={() => setEditing(false)}>
          <option>是</option><option>否</option>
        </select>
      </div>
    );
  }

  const shown = value === null ? "" : Array.isArray(value) ? value.join("、") : String(value);
  return (
    <div className="field">
      <label htmlFor={label}>{label}</label>
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

function chips(n: Need): string[] {
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
