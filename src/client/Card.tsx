import { comparableTotal, money, saving, statusPip, type Rec } from "./records.ts";
import { go } from "./router.ts";

// Compact result card (PRD FR-10). Tapping opens the evidence detail.
export function ResultCard({ r }: { r: Rec }) {
  const total = comparableTotal(r);
  const sv = saving(r);
  return (
    <article className="card rise" onClick={() => go(`/card/${r.id}`)} role="link" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && go(`/card/${r.id}`)}>
      <div className="card-head">
        <div>
          <h3>{r.title}</h3>
          <p className="provider">{r.provider}</p>
        </div>
        <div className="price">
          <span className={`num ${total === 0 ? "free" : ""}`}>{total === null ? "—" : money(total)}</span>
          {r.price_unit && <span className="unit">{r.price_unit}</span>}
        </div>
      </div>
      <p className="meta">{[r.distance_or_time_text, r.availability_or_event_time, ...r.eligibility].filter(Boolean).join(" / ")}</p>
      <p className="status-line">
        <span className={`pip ${statusPip(r.data_status)}`} aria-hidden="true" />
        {r.data_status} · {r.source_type === "curated" ? "人工整理" : "網路搜尋"} · {r.verified_at}
      </p>
      {sv && sv.amount > 0 && <p className="saving">省 NT${sv.amount}（{sv.pct}%）vs {r.baseline!.name}</p>}
      {sv && sv.amount <= 0 && <p className="note">比基準貴 NT${-sv.amount}</p>}
      {!sv && total !== null && total > 0 && <p className="note">無足夠資料計算節省</p>}
    </article>
  );
}
