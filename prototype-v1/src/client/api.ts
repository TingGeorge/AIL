import type { Need } from "../shared/need.ts";

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
