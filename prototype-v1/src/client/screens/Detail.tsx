import { useState } from "react";
import { DATA_REASONS, EXPERIENCE_REASONS, comparableTotal, isExperience, isExpired, money, recentExperience, saving, statusPip, type Rec, type Report } from "../../shared/records.ts";
import { go } from "../router.ts";
import { Shell } from "./Shell.tsx";

// Evidence detail (PRD FR-10, FR-11, FR-12) + 體驗回報 + 揪團 entry.
export function Detail({ r, inList, fav, toggleList, toggleFav, share, report, reports, listCount, survival }: {
  r: Rec; inList: boolean; fav: boolean; toggleList: () => void; toggleFav: () => void; share: () => void;
  report: (reason: string, note: string) => void; reports: Report[]; listCount: number; survival: boolean;
}) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<string>(EXPERIENCE_REASONS[0]);
  const [note, setNote] = useState("");
  const total = comparableTotal(r);
  const sv = saving(r);
  const mine = reports.filter((x) => x.candidate_id === r.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const recent = recentExperience(reports, r.id).length;
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  // 同一個 field 有兩條摘錄＝來源自我矛盾，並列顯示（票 11、ADR 0002）。
  const fields = [...new Set(r.evidence.map((e) => e.field))];
  const ago = (iso: string) => { const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000); return d === 0 ? "今天" : `${d} 天前`; };

  return (
    <Shell surface="black" title={r.category} listCount={listCount} survival={survival}>
      <section className="rise">
        <p className="eyebrow"><span className={`pip ${statusPip(r.data_status)}`} />{r.data_status} · {r.agent === "free" ? "白嫖獵人" : "CP值獵人"}</p>
        <h1 className="display small"><span className="outline">{r.title}</span></h1>
        <p className="lead">{r.provider}</p>
        {recent > 0 && <p className="warntag big"><span className="pip red" />{recent} 則體驗回報 · 30 天內 · 這是使用者回報，不是本平台判斷</p>}
      </section>

      {r.group_offer && (
        <section className="rise groupbox">
          <p className="eyebrow">TEAM · 揪團</p>
          <p className="lead">{r.group_offer.note}</p>
          <button className="primary" onClick={() => go(`/team/${r.id}`)}>揪團 · 滿 {r.group_offer.min_people} 人</button>
        </section>
      )}

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
          {r.valid_until && (
            <div className="row"><span className="idx">··</span><span className="row-label">有效期</span>
              <span className={`value ${isExpired(r) ? "acid" : ""}`}>{isExpired(r) ? `優惠已於 ${day(r.valid_until)} 到期，僅供參考` : `有效至 ${day(r.valid_until)}`}</span></div>
          )}
          {r.address && (
            <div className="row"><span className="idx">··</span><span className="row-label">地點</span>
              {/* ponytail: 純 URL 外部連結，不載入地圖 SDK。要顯示店家位置的內嵌地圖時再換。 */}
              <span className="value"><a className="link acid" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`} target="_blank" rel="noopener">{r.address}</a></span></div>
          )}
          <div className="row"><span className="idx">··</span><span className="row-label">登記</span><span className="value">{r.registration_required ? "需要" : "不需要"}</span></div>
          <div className="row"><span className="idx">··</span><span className="row-label">資格／限制</span><span className={`value ${r.eligibility.length ? "" : "unlimited"}`}>{r.eligibility.join("、") || "無"}</span></div>
          <div className="row"><span className="idx">··</span><span className="row-label">成分標籤</span><span className={`value ${r.tags?.length ? "" : "unlimited"}`}>{r.tags === null ? "成分未標示" : r.tags.join("、") || "無"}</span></div>
        </div>
      </section>

      <section className="rise">
        <p className="eyebrow">EVIDENCE · 證據</p>
        {fields.map((f) => {
          const same = r.evidence.filter((e) => e.field === f);
          return (
            <div key={f}>
              {same.map((e, i) => <p key={i} className="lead quote">{e.field}：{e.quote}</p>)}
              {same.length > 1 && <p className="warntag"><span className="pip red" />同一個來源對「{f}」有兩種說法 · 衝突待確認，不進主要排序</p>}
            </div>
          );
        })}
        <p className="note">{r.source_type === "curated" ? "人工整理" : "網路搜尋"} · {({ official: "官方", provider: "提供者", public: "公共機關", other: "其他" })[r.source_authority]} · 搜尋 {r.collected_at.slice(0, 10)} · 確認 {r.verified_at}</p>
        <a className="link acid" href={r.source_url} target="_blank" rel="noopener">{r.action_label}（離開 ALL in life）</a>
        <p className="note">請以原始頁面為準。不保證即時庫存、名額或營業狀態。</p>
      </section>

      <section className="rise">
        <p className="eyebrow">REPORTS · 回報 <b className="count">{mine.length}</b></p>
        {mine.length === 0 && <p className="note">還沒有人回報。</p>}
        <ul className="reports">
          {mine.map((x) => (
            <li key={x.id} className={isExperience(x) ? "exp" : ""}>
              <span className={`pip ${isExperience(x) ? "red" : "blue"}`} /><b>{x.reason}</b>{x.note && <span> · {x.note}</span>}<small>{x.by} · {ago(x.created_at)}</small>
            </li>
          ))}
        </ul>
        <p className="note">體驗回報是使用者的個人經驗，平台不做健康或安全判斷。資料回報會改變這筆資料的狀態。</p>
      </section>

      <section className="rise actions">
        <button className="primary" onClick={toggleList}>{inList ? "✓ 已在清單" : "加入清單"}</button>
        <div className="action-row">
          <button className="secondary" onClick={toggleFav}>{fav ? "★ 已收藏" : "☆ 收藏"}</button>
          <button className="secondary" onClick={share}>分享</button>
          <button className="secondary" onClick={() => setReporting((v) => !v)}>回報</button>
        </div>
        {reporting && (
          <form className="report" onSubmit={(e) => { e.preventDefault(); report(reason, note.trim()); setReporting(false); setNote(""); }}>
            <p className="eyebrow">體驗回報</p>
            <div className="chipset">{EXPERIENCE_REASONS.map((x) => <button type="button" key={x} className={`pick ${reason === x ? "on red" : ""}`} aria-pressed={reason === x} onClick={() => setReason(x)}>{x}</button>)}</div>
            <p className="eyebrow">資料回報</p>
            <div className="chipset">{DATA_REASONS.map((x) => <button type="button" key={x} className={`pick ${reason === x ? "on" : ""}`} aria-pressed={reason === x} onClick={() => setReason(x)}>{x}</button>)}</div>
            <input value={note} maxLength={40} placeholder="補充（選填，40 字內）" onChange={(e) => setNote(e.target.value)} aria-label="補充" />
            <button className="secondary" type="submit">送出回報</button>
          </form>
        )}
      </section>
    </Shell>
  );
}
