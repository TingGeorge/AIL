import { useEffect, useState } from "react";
import { Database, ShieldCheck } from "lucide-react";
import { CATEGORIES } from "../shared/need.ts";
import type { CatalogSummary } from "../shared/catalog.ts";
import type { Category } from "../shared/records.ts";
import "./compact-support.css";

export type CatalogNoticeProps = {
  initialSummary?: CatalogSummary;
};

type LoadState = "loading" | "ready" | "error";

function verifiedTime(value: string | null): string {
  if (!value) return "尚無已確認資料時間";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Taipei",
  }).format(timestamp);
}

function emptyCategory(category: Category) {
  return { category, total: 0, rankable: 0, pending: 0 };
}

export function CatalogNotice({ initialSummary }: CatalogNoticeProps = {}) {
  const [summary, setSummary] = useState<CatalogSummary | null>(initialSummary ?? null);
  const [state, setState] = useState<LoadState>(initialSummary ? "ready" : "loading");

  useEffect(() => {
    if (initialSummary) return;
    const controller = new AbortController();

    void fetch("/api/catalog", { signal: controller.signal, headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`catalog_${response.status}`);
        return await response.json() as CatalogSummary;
      })
      .then((value) => {
        setSummary(value);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setState("error");
      });

    return () => controller.abort();
  }, [initialSummary]);

  if (state === "loading") {
    return (
      <aside className="catalog-notice compact-support compact-catalog-status" aria-live="polite">
        <Database aria-hidden="true" />
        <span><b>正在確認資料</b><small>仍可先開始探索。</small></span>
      </aside>
    );
  }

  if (state === "error" || !summary) {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return (
      <aside className="catalog-notice catalog-notice-error compact-support compact-catalog-status" role="status">
        <Database aria-hidden="true" />
        <span>
          <b>{offline ? "目前離線" : "資料暫時無法更新"}</b>
          <small>探索仍可使用，恢復連線後再確認。</small>
        </span>
      </aside>
    );
  }

  const byCategory = new Map(summary.categories.map((row) => [row.category, row]));
  const categories = CATEGORIES.map((category) => byCategory.get(category) ?? emptyCategory(category));
  const scope = summary.scope.trim();
  const realTotal = Math.max(0, summary.total - summary.demonstration);

  return (
    <aside className="catalog-notice compact-support compact-catalog-notice" aria-label="目前資料覆蓋">
      <div className="compact-catalog-summary">
        <Database aria-hidden="true" />
        <div>
          <span className="compact-overline">目前資料</span>
          <strong>{summary.total === 0 ? "尚無真實資料" : `${realTotal} 筆真實資料`}</strong>
          <p className="compact-scope" title={scope || undefined}>
            {scope || "公開網頁資料快照"} · 使用前再確認
          </p>
        </div>
      </div>

      <details className="compact-disclosure compact-catalog-details">
        <summary>
          <span className="compact-summary-label">資料範圍與五類統計</span>
          <small>{summary.total} 收錄 · {summary.pending} 待確認</small>
        </summary>
        <div className="compact-disclosure-body">
          <div className="catalog-heading compact-catalog-heading">
            <span><Database aria-hidden="true" /><b>目前資料覆蓋</b></span>
            <small>最近確認 {verifiedTime(summary.latest_verified_at)}</small>
          </div>

          {summary.total === 0 ? (
            <p className="catalog-empty">目前尚無可顯示的資料；五類覆蓋會在匯入後更新。</p>
          ) : (
            <div className="catalog-totals">
              <strong>{realTotal} 筆真實資料</strong>
              <span>{summary.total} 筆總收錄</span>
              <span>{summary.rankable} 可排序</span>
              <span>{summary.pending} 待確認</span>
              <span>{summary.demonstration} 筆示範資料</span>
            </div>
          )}

          {scope && <p className="catalog-scope">範圍：{scope}</p>}

          <div className="catalog-categories">
            {categories.map((row) => (
              <div key={row.category}>
                <b>{row.category}</b>
                <span>{row.total} 筆</span>
                <small>{row.rankable} 可排序 · {row.pending} 待確認</small>
              </div>
            ))}
          </div>

          <p className="catalog-caveat">
            <ShieldCheck aria-hidden="true" />
            <span>公開網頁資料快照，不代表即時庫存、名額或費率保證；讀取與瀏覽不需要 LLM API key。</span>
          </p>
        </div>
      </details>
    </aside>
  );
}
