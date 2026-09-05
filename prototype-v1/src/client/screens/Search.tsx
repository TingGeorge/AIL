import { useEffect, useState } from "react";
import type { Need } from "../../shared/need.ts";
import type { Rec } from "../../shared/records.ts";
import { passesGate } from "../../shared/records.ts";
import { ApiError, search } from "../api.ts";
import { Shell } from "./Shell.tsx";

// PRD FR-05: both Agents start together; each shows its own state; one failing never hides the other.
// SPEC-backend §7.1 的兩步：硬限制篩選是共用的一次計算，排序才分 (agent, category)。
const STEPS = ["篩選硬限制（共用）", "推薦排序"] as const;
const SOURCES = {
  paid: ["店家頁面", "官方 DM", "活動與票價頁", "公開商家頁"],
  free: ["Luma 活動", "區公所與公部門活動", "慈善團體", "食品展與市集", "志工換餐"],
};
type AgentState = { step: number; found: number; passed: number; groups: number; ranked: number; done: boolean; failed: string | null };
const init: AgentState = { step: 0, found: 0, passed: 0, groups: 0, ranked: 0, done: false, failed: null };

export function Search({ preview, records, need, exclude, onDone, listCount, survival }: {
  preview: boolean; records: Rec[]; need: Need; exclude: string[];
  onDone: (r: Rec[]) => void; listCount: number; survival: boolean;
}) {
  const [paid, setPaid] = useState<AgentState>(init);
  const [free, setFree] = useState<AgentState>(init);

  // 搜尋只跑一次：這個畫面每次進來都是新掛載，need／exclude 取進場當下的值。
  useEffect(() => {
    if (preview) {
      const run = (agent: "paid" | "free", set: typeof setPaid, pace: number) => {
        const groups = new Set(records.filter((r) => r.agent === agent).map((r) => r.category)).size;
        return STEPS.map((_, i) => window.setTimeout(() => set({
          step: i, found: records.length, passed: records.filter((r) => passesGate(r)).length,   // filter 會把 index 當第二個參數傳進去，不能直接給 passesGate
          groups, ranked: i === STEPS.length - 1 ? groups : 0, done: i === STEPS.length - 1, failed: null,
        }), pace * (i + 1)));
      };
      const a = run("paid", setPaid, 520);
      const b = run("free", setFree, 700);
      const end = window.setTimeout(() => onDone(records), 700 * STEPS.length + 900);
      return () => [...a, ...b, end].forEach(clearTimeout);
    }

    let live = true;
    // 伺服器已經分好 main／pending／excluded，前端用同一組共用純函式（bucket）重新分組，結果一致。
    const all: Rec[] = [];
    search({ need, exclude, location: null }, (e) => {
      if (!live) return;
      if ("step" in e) {
        if (e.step === "filter") {
          const base = { step: 1, found: e.found, passed: e.passed, ranked: 0, failed: null };
          setPaid({ ...base, groups: e.groups.paid, done: e.groups.paid === 0 });
          setFree({ ...base, groups: e.groups.free, done: e.groups.free === 0 });
        } else all.push(...e.pending, ...e.excluded);
        return;
      }
      if (e.status !== "done") return;
      all.push(...e.records);
      (e.agent === "paid" ? setPaid : setFree)((s) => ({ ...s, ranked: s.ranked + 1, done: s.ranked + 1 >= s.groups }));
    }).then(() => {
      if (!live) return;
      setPaid((s) => ({ ...s, done: true }));
      setFree((s) => ({ ...s, done: true }));
      onDone(all);
    }).catch((err: unknown) => {
      if (!live) return;
      const failed = err instanceof ApiError ? err.message : "搜尋失敗";
      setPaid((s) => ({ ...s, failed }));
      setFree((s) => ({ ...s, failed }));
      window.setTimeout(() => { if (live) onDone(all); }, 900);
    });
    return () => { live = false; };
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
          <li key={label} className={i < s.step ? "past" : i === s.step && !s.failed ? "now" : ""}>
            <span className="idx">{String(i + 1).padStart(2, "0")}</span>{label}{i === 1 && s.step === 1 ? ` ${s.ranked}/${s.groups} 類` : ""}
          </li>
        ))}
      </ol>
      <div className="agent-foot">
        {s.failed ? <span className="note acid">{s.failed}</span>
          : <><span>候選 <b className="num">{s.found}</b></span><span>通過閘門 <b className="num">{s.step > 0 ? s.passed : "—"}</b></span></>}
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
