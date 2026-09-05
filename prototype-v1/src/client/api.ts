import type { Need } from "../shared/need.ts";
import type { Rec } from "../shared/records.ts";

const TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(public kind: "timeout" | "failed", message: string) {
    super(message);
  }
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new ApiError((e as Error).name === "TimeoutError" ? "timeout" : "failed", "連線失敗");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error === "timeout" ? "timeout" : "failed", body.message ?? res.statusText);
  return body as T;
}

export const transcribe = (audio: Blob) => {
  const form = new FormData();
  form.append("audio", audio, "clip");
  return call<{ transcript: string }>("/api/transcribe", { method: "POST", body: form });
};

export const parse = (transcript: string, current: Need | null) =>
  call<Need>("/api/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transcript, current }),
  });

export type SearchEvent =
  | { step: "filter"; found: number; passed: number; pending: number; groups: { paid: number; free: number }; excluded_by: Record<string, number> }
  | { agent: "paid" | "free"; category: string; status: "ranking" }
  | { agent: "paid" | "free"; category: string; status: "done"; records: Rec[] }
  | { step: "done"; pending: Rec[]; excluded: Rec[] };

// 票 06 之後每一組要等 LLM 排序（30 秒），所以整體比 call() 的 30 秒寬。
const SEARCH_TIMEOUT_MS = 60_000;

// 串流不能走 call()（那個是 res.json()）。ponytail: 只解析 data: 行 —— 伺服器只送 data，
// 不送 event:／id:／retry:。要具名事件時再補；EventSource 不能 POST，所以不用它。
export async function search(
  body: { need: Need; exclude: string[]; location: { lat: number; lng: number } | null; costco_ok: boolean },
  onEvent: (e: SearchEvent) => void,
): Promise<void> {
  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError("failed", err.message ?? "搜尋失敗");
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += value;
      for (let i = buf.indexOf("\n\n"); i !== -1; i = buf.indexOf("\n\n")) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
        if (data) onEvent(JSON.parse(data) as SearchEvent);
      }
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError((e as Error).name === "TimeoutError" ? "timeout" : "failed", "連線失敗");
  }
}

// 票 11：直接開 #/card/<id> 或重整清單頁時，用這條把記憶體裡沒有的紀錄補回來。
export const candidates = (ids: string[]) =>
  call<Rec[]>(`/api/candidates?ids=${encodeURIComponent(ids.join(","))}`, { method: "GET" });
