import { useEffect, useState } from "react";
import { isDemoRecord, type Bucket } from "../shared/records.ts";
import { browse } from "./api.ts";
import { ResultsView, type ResultsViewProps } from "./ResultsView.tsx";

type BrowseProps = Pick<ResultsViewProps, "list" | "onOpen" | "onList" | "onAdjust">;
export type BrowseState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: Bucket };

function browseErrorMessage(message: string): string {
  const normalized = message.trim();
  if (!normalized || /database|postgres|api key|llm|gemini|fetch|network|internal/i.test(normalized)) {
    return "目前無法載入生活選項，請稍後再試。";
  }
  return normalized;
}

export function BrowseResultsContent({ state, onRetry, ...actions }: BrowseProps & { state: BrowseState; onRetry: () => void }) {
  if (state.status === "loading") return (
    <section className="screen" aria-busy="true"><p className="notice" role="status" aria-live="polite">正在載入所有生活選項…</p></section>
  );
  if (state.status === "error") return (
    <section className="screen"><div className="notice error" role="alert">{browseErrorMessage(state.message)}<button type="button" onClick={onRetry}>重新載入</button></div></section>
  );
  const { main, pending, excluded } = state.result;
  return (
    <div className="results-page">
      <div className="result-notices" aria-live="polite">{[...main, ...pending].some(isDemoRecord) && <p className="notice warning">目前包含示範測試資料，請勿據此購買或前往。</p>}</div>
      <ResultsView {...actions} browsing records={main} pending={pending} excluded={excluded} survival={false} />
    </div>
  );
}

export function BrowseResults(props: BrowseProps) {
  const [state, setState] = useState<BrowseState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void browse(controller.signal).then(result => {
      if (!controller.signal.aborted) setState({ status: "ready", result });
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setState({ status: "error", message: error.message });
    });
    return () => controller.abort();
  }, [attempt]);
  return <BrowseResultsContent {...props} state={state} onRetry={() => setAttempt(value => value + 1)} />;
}
