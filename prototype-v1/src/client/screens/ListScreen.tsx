import type { Need } from "../../shared/need.ts";
import { comparableTotal, money, type Rec } from "../../shared/records.ts";
import { go } from "../router.ts";
import { Shell } from "./Shell.tsx";

// PRD FR-12: session-only list and favorites, share without personal data. 標記已買 feeds 本月已花.
export function ListScreen({ need, items, favs, remove, bought, share, listCount, survival }: {
  need: Need | null; items: Rec[]; favs: Rec[]; remove: (id: string) => void; bought: (r: Rec) => void; share: () => void; listCount: number; survival: boolean;
}) {
  const totals = items.map(comparableTotal);
  const known = totals.filter((t): t is number => t !== null);
  const sum = known.reduce((a, b) => a + b, 0);
  const budget = need?.budget_total_twd ?? null;
  const over = budget !== null && sum > budget;

  const row = (r: Rec, removable: boolean) => (
    <div key={r.id} className="row list-row">
      <button className="link" onClick={() => go(`/card/${r.id}`)}>{r.title}</button>
      <span className="value">{comparableTotal(r) === null ? "—" : money(comparableTotal(r)!)}</span>
      {removable ? (
        <span className="list-actions">
          <button className="link acid" onClick={() => bought(r)}>標記已買</button>
          <button className="link muted" onClick={() => remove(r.id)} aria-label={`移除 ${r.title}`}>移除</button>
        </span>
      ) : <span />}
    </div>
  );

  return (
    <Shell surface="black" title="返回" listCount={listCount} survival={survival}>
      <section className="rise">
        <p className="eyebrow">LIST · 清單</p>
        <h1 className="display"><span className="outline">這次</span><br /><span className="fill">清單</span></h1>
        <p className="note">只在這個瀏覽工作階段有效，不會跨裝置保存。</p>
      </section>
      <section className="rise">
        <div className="rows">
          {items.length === 0 && <div className="row"><span className="idx">··</span><span className="row-label">—</span><span className="value unlimited">還沒有加入任何選項</span></div>}
          {items.map((r) => row(r, true))}
          {items.length > 0 && (
            <div className="row total">
              <span className="idx">=</span>
              <span className="row-label">合計{known.length < items.length ? "（部分未知）" : ""}</span>
              <span className={`value ${over ? "over" : ""}`}>{money(sum)}{budget !== null && ` / ${money(budget)}`}</span>
            </div>
          )}
        </div>
        {over && <p className="note acid">合計超過預算。</p>}
        {items.length > 0 && <button className="primary" onClick={share}>分享清單</button>}
      </section>
      {favs.length > 0 && (
        <section className="rise">
          <p className="eyebrow">★ · 收藏</p>
          <div className="rows">{favs.map((r) => row(r, false))}</div>
        </section>
      )}
      <section className="rise">
        <button className="link muted" onClick={() => go("/results")}>← 回到結果</button>
      </section>
    </Shell>
  );
}
