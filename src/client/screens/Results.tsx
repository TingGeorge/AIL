import { CATEGORIES, type Need } from "../../shared/need.ts";
import { ResultCard } from "../Card.tsx";
import { bucket, comparableTotal, money, type Category, type Rec } from "../records.ts";
import { go } from "../router.ts";
import { Shell } from "./Shell.tsx";

export function Results({ need, records, category, setNeed, listCount, chips }: {
  need: Need; records: Rec[]; category: Category; setNeed: (n: Need) => void; listCount: number; chips: string[];
}) {
  const inCat = records.filter((r) => r.category === category);
  const b = bucket(inCat, need);
  const relevant = need.target_categories.includes(category);
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, bucket(records.filter((r) => r.category === c), need).main.length]));
  const paidOk = records.some((r) => r.agent === "paid");
  const freeOk = records.some((r) => r.agent === "free");
  const cheapestExcluded = b.excluded.map(comparableTotal).filter((x): x is number => x !== null).sort((x, y) => x - y)[0];

  return (
    <Shell surface="white" title="確認" listCount={listCount}>
      <section className="rise">
        <p className="eyebrow">03 / 03 · 結果</p>
        <button className="chips" onClick={() => go("/confirm")} aria-label="編輯需求與限制">
          {chips.map((c) => <span key={c} className="chip">{c}</span>)}
        </button>
        <p className="status-line">
          <span className={`pip ${paidOk ? "yellow" : "red"}`} /> PAID {paidOk ? "完成" : "未接上"}
          <span className={`pip ${freeOk ? "yellow" : "red"}`} /> FREE {freeOk ? "完成" : "未接上"}
          <span className="pip blue" /> 待確認 {records.filter((r) => r.data_status !== "已驗證").length}
        </p>
      </section>

      <nav className="tabs rise" aria-label="類別">
        {CATEGORIES.map((c) => (
          <button key={c} className={`tab ${c === category ? "on" : ""} ${need.target_categories.includes(c) ? "rel" : ""}`} onClick={() => go(`/results/${c}`)}
            aria-current={c === category ? "page" : undefined}>
            {c}<b>{counts[c]}</b>
          </button>
        ))}
      </nav>

      <section className="rise">
        <div className="cat">
          <span className="idx">{String(CATEGORIES.indexOf(category) + 1).padStart(2, "0")}</span>
          <h2>{category}</h2>
          {relevant ? <span className="mark">相關</span> : <span />}
          <p>{b.main.length} 筆通過限制與證據閘門 · 依總可比成本由低至高</p>
        </div>

        {b.main.length === 0 && (
          <div className="empty">
            <p className="lead">{inCat.length === 0 ? "這一類沒有找到資料。" : b.excluded.length ? "有資料，但都被硬限制排除。" : "有資料，但都還沒有可讀證據。"}</p>
            {b.excluded.length > 0 && need.budget_total_twd !== null && cheapestExcluded !== undefined && (
              <>
                <p className="note">預算 {money(need.budget_total_twd)} 排除了 {b.excluded.length} 筆。</p>
                <button className="secondary" onClick={() => setNeed({ ...need, budget_total_twd: cheapestExcluded })}>放寬預算到 {money(cheapestExcluded)}</button>
              </>
            )}
            {need.free_only && b.excluded.length > 0 && (
              <button className="secondary" onClick={() => setNeed({ ...need, free_only: false })}>不限免費</button>
            )}
          </div>
        )}
        {b.main.map((r) => <ResultCard key={r.id} r={r} />)}
      </section>

      {b.excluded.length > 0 && b.main.length > 0 && (
        <details className="rise fold">
          <summary>超出硬限制 <b>{b.excluded.length}</b>{need.budget_total_twd !== null && cheapestExcluded !== undefined && <span className="note"> · 最低 {money(cheapestExcluded)}</span>}</summary>
          {need.budget_total_twd !== null && cheapestExcluded !== undefined && (
            <button className="secondary" onClick={() => setNeed({ ...need, budget_total_twd: cheapestExcluded })}>放寬預算到 {money(cheapestExcluded)}</button>
          )}
          {b.excluded.map((r) => <ResultCard key={r.id} r={r} />)}
        </details>
      )}
      {b.pending.length > 0 && (
        <details className="rise fold">
          <summary>待確認，不進排序 <b>{b.pending.length}</b></summary>
          <p className="note">價格、費用或有效期缺證據、過期或來源衝突。可當線索，不當推薦。</p>
          {b.pending.map((r) => <ResultCard key={r.id} r={r} />)}
        </details>
      )}
    </Shell>
  );
}
