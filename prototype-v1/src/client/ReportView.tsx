import { useEffect, useState } from "react";
import { ChevronDown, Flag } from "lucide-react";
import { REPORT_REASONS } from "../shared/account.ts";
import * as api from "./api.ts";

function reportErrorMessage(error: unknown): string {
  if (error instanceof api.ApiError && error.status === 401) return "登入狀態已失效，請重新登入後再試。";
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message || /database|postgres|api key|llm|gemini|fetch|network|internal/i.test(message)) {
    return "目前無法處理回報，請稍後再試。";
  }
  return message;
}

export function ReportView({
  id,
  token,
  onLogin,
  onExpired,
}: {
  id: string;
  token: string | null;
  onLogin: () => void;
  onExpired: (e: unknown) => void;
}) {
  const [items, setItems] = useState<api.CandidateReport[]>([]);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api.reports(id, controller.signal)
      .then(setItems)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(reportErrorMessage(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id]);

  return (
    <details className="reports-panel detail-disclosure" id="candidate-reports">
      <summary>
        <span><Flag aria-hidden="true" />回報與留言</span>
        <small>{loading ? "讀取中" : `${items.length} 則`}</small>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="disclosure-body">
        <p className="fine-print">回報是使用者提供的資訊，不代表已經查證；公開顯示你的暱稱。請勿填寫個人資料。</p>
        {loading ? (
          <p role="status" aria-live="polite">讀取回報中…</p>
        ) : items.length === 0 ? (
          <p className="section-copy">目前沒有公開回報。</p>
        ) : (
          <ul className="report-list">
            {items.map((item, index) => (
              <li key={`${item.created_at}-${index}`}>
                <b>{item.reason}</b>
                <span>{item.by} · {new Date(item.created_at).toLocaleDateString("zh-TW")}</span>
                <p>{item.note || "未附註記"}</p>
              </li>
            ))}
          </ul>
        )}
        {token ? (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              setMessage("");
              try {
                await api.report(token, id, reason, note);
                setNote("");
                setMessage("回報已儲存，選項資料不會因此自動改成已確認。");
                setItems(await api.reports(id));
              } catch (caught: unknown) {
                setError(reportErrorMessage(caught));
                if (caught instanceof api.ApiError && caught.status === 401) onExpired(caught);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              回報類型
              <select value={reason} onChange={(event) => setReason(event.target.value)}>
                {REPORT_REASONS.map((entry) => <option key={entry}>{entry}</option>)}
              </select>
            </label>
            <label className="field">
              補充說明（最多 500 字，公開）
              <textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="請描述你觀察到的差異" />
            </label>
            <button className="secondary-action" disabled={busy}>
              {busy ? "送出中…" : "送出回報"}
            </button>
          </form>
        ) : (
          <button className="secondary-action" onClick={onLogin}>登入後回報</button>
        )}
        {error && <p role="alert" aria-live="assertive" className="notice error">{error}</p>}
        {message && <p role="status" aria-live="polite" className="notice">{message}</p>}
      </div>
    </details>
  );
}
