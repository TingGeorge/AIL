import { useEffect, useState } from "react";
import type { Rec } from "../../shared/records.ts";
import { passesGate } from "../../shared/records.ts";
import { Shell } from "./Shell.tsx";

// PRD FR-05: both Agents start together; each shows its own state; one failing never hides the other.
const STEPS = ["查詢來源", "讀取證據", "正規化", "證據閘門"] as const;
const SOURCES = {
  paid: ["店家頁面", "官方 DM", "活動與票價頁", "公開商家頁"],
  free: ["Luma 活動", "區公所與公部門活動", "慈善團體", "食品展與市集", "志工換餐"],
};
type AgentState = { step: number; found: number; passed: number; done: boolean; failed: string | null };
const init: AgentState = { step: 0, found: 0, passed: 0, done: false, failed: null };

export function Search({ preview, records, onDone, listCount, survival }: { preview: boolean; records: Rec[]; onDone: (r: Rec[]) => void; listCount: number; survival: boolean }) {
  const [paid, setPaid] = useState<AgentState>(init);
  const [free, setFree] = useState<AgentState>(init);

  useEffect(() => {
    if (!preview) {
      const t = setTimeout(() => {
        setPaid({ ...init, failed: "搜尋尚未接上" });
        setFree({ ...init, failed: "搜尋尚未接上" });
        setTimeout(() => onDone([]), 900);
      }, 800);
      return () => clearTimeout(t);
    }
    const run = (agent: "paid" | "free", set: (s: AgentState) => void, pace: number) => {
      const mine = records.filter((r) => r.agent === agent);
      return STEPS.map((_, i) => window.setTimeout(() => {
        const found = Math.min(mine.length, Math.ceil((mine.length * (i + 1)) / STEPS.length));
        set({ step: i, found, passed: i === STEPS.length - 1 ? mine.filter(passesGate).length : 0, done: i === STEPS.length - 1, failed: null });
      }, pace * (i + 1)));
    };
    const a = run("paid", setPaid, 520);
    const b = run("free", setFree, 700);
    const end = window.setTimeout(() => onDone(records), 700 * STEPS.length + 900);
    return () => [...a, ...b, end].forEach(clearTimeout);
  }, [preview, records, onDone]);

  const panel = (name: string, zh: string, s: AgentState, sources: string[]) => (
    <div className={`agent ${s.done ? "done" : ""} ${s.failed ? "failed" : ""}`}>
      <div className="agent-head">
        <span className="agent-name"><span className={`pip ${s.failed ? "red" : s.done ? "yellow" : "blue"} ${s.done || s.failed ? "" : "live"}`} />{name}</span>
        <span className="agent-zh">{zh}</span>
      </div>
      <div className="ticker" aria-hidden="true"><span>{[...sources, ...sources].map((x, i) => <i key={i}>{x}</i>)}</span></div>
      <ol className="steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i < s.step ? "past" : i === s.step && !s.failed ? "now" : ""}><span className="idx">{String(i + 1).padStart(2, "0")}</span>{label}</li>
        ))}
      </ol>
      <div className="agent-foot">
        {s.failed ? <span className="note acid">{s.failed}</span>
          : <><span>候選 <b className="num">{s.found}</b></span><span>通過閘門 <b className="num">{s.done ? s.passed : "—"}</b></span></>}
      </div>
      <span className="agent-bar" style={{ width: s.failed ? "100%" : `${((s.step + (s.done ? 1 : 0.5)) / STEPS.length) * 100}%` }} />
    </div>
  );

  return (
    <Shell surface="black" title="確認" listCount={listCount} survival={survival}>
      <section className="rise">
        <p className="eyebrow">02.5 / 03 · 搜尋中</p>
        <h1 className="display"><span className="outline">兩個</span><br /><span className="fill">獵人出動</span></h1>
        <p className="lead">並行搜尋。回來的資料還要過限制與證據檢查。</p>
      </section>
      <section className="rise agents">
        {panel("CP值獵人", "付費選項搜尋", paid, SOURCES.paid)}
        {panel("白嫖獵人", "免費資源搜尋", free, SOURCES.free)}
      </section>
      <p className="note rise">先套硬限制，再依總可比成本排序。無證據不排序。{survival && " 生存模式：免費永遠在前。"}</p>
    </Shell>
  );
}
