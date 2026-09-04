// Result card per PRD FR-10: name, provider, total, unit, distance, conditions, source, evidence, time, status, saving, action.
export type Card = {
  title: string;
  provider: string;
  total: number;
  unit: string | null;
  distance: string | null;
  conditions: string[];
  source: "curated" | "web-searched";
  sourceLabel: string;
  evidence: string;
  verifiedAt: string;
  status: string;
  saving: string | null;
  action: string;
};

// Badge dots: yellow = verified, blue = pending, red = expired/conflict.
const pipFor = (status: string) => (status.startsWith("已驗證") ? "yellow" : status.includes("過期") || status.includes("衝突") ? "red" : "blue");

export function ResultCard({ c }: { c: Card }) {
  return (
    <article className="card rise">
      <div className="card-head">
        <div>
          <h3>{c.title}</h3>
          <p className="provider">{c.provider}</p>
        </div>
        <div className="price">
          <span className={`num ${c.total === 0 ? "free" : ""}`}>{c.total === 0 ? "FREE" : `NT$${c.total}`}</span>
          {c.unit && <span className="unit">{c.unit}</span>}
        </div>
      </div>
      <p className="meta">{[c.distance, ...c.conditions].filter(Boolean).join(" / ")}</p>
      <p className="evidence">{c.evidence}</p>
      <p className="status-line">
        <span className={`pip ${pipFor(c.status)}`} aria-hidden="true" />
        {c.status} · {c.source === "curated" ? "人工整理" : "網路搜尋"} · {c.sourceLabel} · {c.verifiedAt}
      </p>
      {c.saving ? <p className="saving">{c.saving}</p> : c.total > 0 && <p className="note">無足夠資料計算節省</p>}
      <button className="link acid">{c.action}</button>
    </article>
  );
}
