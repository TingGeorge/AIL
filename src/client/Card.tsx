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

export function ResultCard({ c }: { c: Card }) {
  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h3>{c.title}</h3>
          <p className="label">{c.provider}</p>
        </div>
        <div className="price">
          <span className="num">{c.total === 0 ? "免費" : `NT$${c.total}`}</span>
          {c.unit && <span className="label">{c.unit}</span>}
        </div>
      </div>
      <p className="meta">{[c.distance, ...c.conditions].filter(Boolean).join(" / ")}</p>
      <p className="evidence">{c.evidence}</p>
      <p className="label">{c.source === "curated" ? "人工整理" : "網路搜尋"} · {c.sourceLabel} · 確認 {c.verifiedAt} · {c.status}</p>
      {c.saving && <p className="saving">{c.saving}</p>}
      {!c.saving && c.total > 0 && <p className="label">無足夠資料計算節省</p>}
      <button className="link">{c.action} ↗</button>
    </article>
  );
}
