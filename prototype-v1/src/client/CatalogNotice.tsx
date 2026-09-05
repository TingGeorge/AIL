import { useEffect, useState } from "react";
import { Database, ShieldCheck } from "lucide-react";
import { CATEGORIES } from "../shared/need.ts";
import type { CatalogSummary } from "../shared/catalog.ts";
import type { Category } from "../shared/records.ts";

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
      <aside className="catalog-notice catalog-notice-loading" aria-live="polite">
        <Database aria-hidden="true" />
        <span><b>正在讀取資料覆蓋…</b><small>探索仍可先以手動條件開始。</small></span>
      </aside>
    );
  }

  if (state === "error" || !summary) {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return (
      <aside className="catalog-notice catalog-notice-error" role="status">
        <Database aria-hidden="true" />
        <span>
          <b>{offline ? "目前離線，資料覆蓋暫時無法更新" : "目前無法讀取資料覆蓋"}</b>
          <small>探索畫面仍可使用；恢復連線後重新開啟首頁即可再確認。</small>
        </span>
      </aside>
    );
  }

  const byCategory = new Map(summary.categories.map((row) => [row.category, row]));
  const categories = CATEGORIES.map((category) => byCategory.get(category) ?? emptyCategory(category));
  const scope = summary.scope.trim();
  const realTotal = Math.max(0, summary.total - summary.demonstration);

  return (
    <aside className="catalog-notice" aria-label="目前資料覆蓋">
      <div className="catalog-heading">
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
    </aside>
  );
}
