import { useEffect, useState } from "react";
import { Info, Library } from "lucide-react";
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
        <Library aria-hidden="true" />
        <span><b>正在確認資料涵蓋範圍</b><small>仍可先開始探索。</small></span>
      </aside>
    );
  }

  if (state === "error" || !summary) {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return (
      <aside className="catalog-notice catalog-notice-error compact-support compact-catalog-status" role="status">
        <Library aria-hidden="true" />
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
    <aside className="catalog-notice compact-support compact-catalog-notice" aria-label="資料涵蓋範圍">
      <div className="compact-catalog-summary">
        <Library aria-hidden="true" />
        <div>
          <span className="compact-overline">資料涵蓋範圍</span>
          <strong>{summary.total === 0 ? "尚無已收錄資料" : `${realTotal} 筆已收錄資料`}</strong>
          <p className="compact-scope" title={scope || undefined}>
            {scope || "已整理的公開資料"} · 使用前再確認
          </p>
        </div>
      </div>

      <details className="compact-disclosure compact-catalog-details">
        <summary>
          <span className="compact-summary-label">資料涵蓋範圍與五類統計</span>
          <small>{summary.total} 已收錄 · {summary.pending} 需要再確認</small>
        </summary>
        <div className="compact-disclosure-body">
          <div className="catalog-heading compact-catalog-heading">
            <span><Library aria-hidden="true" /><b>資料涵蓋範圍</b></span>
            <small>最近確認 {verifiedTime(summary.latest_verified_at)}</small>
          </div>

          {summary.total === 0 ? (
            <p className="catalog-empty">目前尚無可顯示的資料；資料涵蓋範圍會在更新後顯示。</p>
          ) : (
            <div className="catalog-totals">
              <strong>{realTotal} 筆已收錄資料</strong>
              <span>{summary.total} 筆已收錄</span>
              <span>{summary.rankable} 可比較</span>
              <span>{summary.pending} 需要再確認</span>
              <span>{summary.demonstration} 筆示範資料</span>
            </div>
          )}

          {scope && <p className="catalog-scope">範圍：{scope}</p>}

          <div className="catalog-categories">
            {categories.map((row) => (
              <div key={row.category}>
                <b>{row.category}</b>
                <span>{row.total} 筆</span>
                <small>{row.rankable} 可比較 · {row.pending} 需要再確認</small>
              </div>
            ))}
          </div>

          <p className="catalog-caveat">
            <Info aria-hidden="true" />
            <span>目前顯示的是已整理的公開資料，不是即時網路搜尋；價格、名額與服務狀態請以來源最新資訊為準。</span>
          </p>
        </div>
      </details>
    </aside>
  );
}
