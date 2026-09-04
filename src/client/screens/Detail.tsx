import { useState } from "react";
import { comparableTotal, money, saving, statusPip, type Rec } from "../records.ts";
import { Shell } from "./Shell.tsx";

const REASONS = ["價格過期", "條件錯誤", "來源失效", "分類錯誤"] as const;

// Evidence detail (PRD FR-10, FR-11, FR-12).
export function Detail({ r, inList, fav, toggleList, toggleFav, share, report, listCount }: {
  r: Rec; inList: boolean; fav: boolean; toggleList: () => void; toggleFav: () => void; share: () => void; report: (reason: string) => void; listCount: number;
}) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const total = comparableTotal(r);
  const sv = saving(r);

  return (
    <Shell surface="black" title={r.category} listCount={listCount}>
      <section className="rise">
        <p className="eyebrow"><span className={`pip ${statusPip(r.data_status)}`} />{r.data_status} · {r.agent === "free" ? "FREE AGENT" : "PAID AGENT"}</p>
        <h1 className="display small"><span className="outline">{r.title}</span></h1>
        <p className="lead">{r.provider}</p>
      </section>

      <section className="rise">
        <p className="eyebrow">COST · 總可比成本</p>
        <div className="rows">
          <div className="row"><span className="idx">01</span><span className="row-label">價格</span><span className="value">{r.price_total_twd === null ? "未列" : money(r.price_total_twd)}</span></div>
          <div className="row"><span className="idx">02</span><span className="row-label">必要費用</span><span className="value">{r.mandatory_fees_twd ? `+ NT$${r.mandatory_fees_twd}` : "未知不當 0"}</span></div>
          <div className="row"><span className="idx">03</span><span className="row-label">適用折扣</span><span className="value">{r.discount_twd ? `− NT$${r.discount_twd}` : "無"}</span></div>
          <div className="row total"><span className="idx">=</span><span className="row-label">總可比成本</span><span className={`value ${total === 0 ? "free" : ""}`}>{total === null ? "無法計算" : money(total)}</span></div>
          {r.price_unit && <div className="row"><span className="idx">··</span><span className="row-label">單位成本</span><span className="value">{r.price_unit}</span></div>}
          {r.quantity_or_servings && <div className="row"><span className="idx">··</span><span className="row-label">份量／數量</span><span className="value">{r.quantity_or_servings}</span></div>}
        </div>
      </section>

      <section className="rise">
        <p className="eyebrow">SAVING · 節省比較</p>
        {sv ? (
          <div className="rows">
            <div className="row"><span className="idx">··</span><span className="row-label">基準</span><span className="value">{r.baseline!.name}</span></div>
            <div className="row"><span className="idx">··</span><span className="row-label">基準價</span><span className="value">{money(r.baseline!.total_twd)}</span></div>
            <div className="row"><span className="idx">··</span><span className="row-label">比較條件</span><span className="value">{r.baseline!.basis}</span></div>
            <div className="row"><span className="idx">··</span><span className="row-label">資料時間</span><span className="value">{r.baseline!.as_of}</span></div>
            <div className="row total"><span className="idx">=</span><span className="row-label">節省</span>
              <span className="value">{sv.amount >= 0 ? <span className="saving">省 NT${sv.amount}（{sv.pct}%）</span> : `貴 NT$${-sv.amount}`}</span></div>
          </div>
        ) : <p className="note acid">無足夠資料計算節省：缺少同份量的基準或價格不完整。</p>}
      </section>

      <section className="rise">
        <p className="eyebrow">TERMS · 條件</p>
        <div className="rows">
          <div className="row"><span className="idx">··</span><span className="row-label">時間</span><span className="value">{r.availability_or_event_time ?? "未列"}</span></div>
          <div className="row"><span className="idx">··</span><span className="row-label">距離／時間</span><span className="value">{r.distance_or_time_text ?? "未列"}</span></div>
          <div className="row"><span className="idx">··</span><span className="row-label">登記</span><span className="value">{r.registration_required ? "需要" : "不需要"}</span></div>
          <div className="row"><span className="idx">··</span><span className="row-label">資格／限制</span><span className={`value ${r.eligibility.length ? "" : "unlimited"}`}>{r.eligibility.join("、") || "無"}</span></div>
        </div>
      </section>

      <section className="rise">
        <p className="eyebrow">EVIDENCE · 證據</p>
        <p className="lead quote">{r.evidence_quote}</p>
        <p className="note">{r.source_type === "curated" ? "人工整理" : "網路搜尋"} · {({ official: "官方", provider: "提供者", public: "公共機關", other: "其他" })[r.source_authority]} · 搜尋 {r.collected_at.slice(0, 10)} · 確認 {r.verified_at}</p>
        <a className="link acid" href={r.source_url} target="_blank" rel="noopener">{r.action_label}（離開 ALL in life）</a>
        <p className="note">請以原始頁面為準。不保證即時庫存、名額或營業狀態。</p>
      </section>

      <section className="rise actions">
        <button className="primary" onClick={toggleList}>{inList ? "✓ 已在清單" : "加入清單"}</button>
        <div className="action-row">
          <button className="secondary" onClick={toggleFav}>{fav ? "★ 已收藏" : "☆ 收藏"}</button>
          <button className="secondary" onClick={share}>分享</button>
          <button className="secondary" onClick={() => setReporting((v) => !v)}>回報</button>
        </div>
        {reporting && (
          <form className="report" onSubmit={(e) => { e.preventDefault(); report(reason); setReporting(false); }}>
            <p className="eyebrow">REPORT · 回報資料問題</p>
            {REASONS.map((x) => (
              <label key={x} className="radio"><input type="radio" name="reason" value={x} checked={reason === x} onChange={() => setReason(x)} />{x}</label>
            ))}
            <button className="secondary" type="submit">送出回報</button>
          </form>
        )}
      </section>
    </Shell>
  );
}
