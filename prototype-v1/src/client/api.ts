import type { Need } from "../shared/need.ts";
import type { Bucket, Rec } from "../shared/records.ts";
import type { AccountData, AuthResponse, User } from "../shared/account.ts";
import { voiceResultSchema, type VoiceResult } from "../shared/voice.ts";

export class ApiError extends Error {
  constructor(
    public kind: "timeout" | "failed" | "aborted",
    message: string,
    public status = 0,
    public code?: string,
    public body?: unknown,
    public response?: Response,
  ) {
    super(message);
  }
}
const errorOf = (e: unknown): ApiError => e instanceof ApiError ? e : new ApiError(
  (e as Error).name === "TimeoutError" ? "timeout" : (e as Error).name === "AbortError" ? "aborted" : "failed",
  (e as Error).name === "TimeoutError" ? "連線逾時，請重試。" : "連線中斷，請檢查網路後重試。",
);
const signalFor = (signal?: AbortSignal, ms = 30_000) => signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
const engineeringErrorTerm = /(?:gemini|llm|api[\s_-]*key|postgres(?:ql)?|database|fetch|internal|資料庫)/i;
const statusFallback: Record<number, string> = {
  401: "登入已逾時或帳號密碼錯誤，請重新登入。",
  409: "此帳號名稱已被使用。",
  429: "嘗試次數過多，請稍後再試。",
  503: "服務尚未設定，請聯絡管理者。",
};

function contextualFallback(url: string, status: number, code?: string): string {
  const path = url.toLowerCase();
  if (path.includes("/voice")) return "語音輸入目前無法使用，請改用文字描述，或稍後再試。";
  if (path.includes("/parse")) return "需求整理目前無法完成，請回到條件頁自行設定，或稍後再試。";
  if (path.includes("/search")) return "搜尋目前無法完成，請回到條件頁重新搜尋。";
  if (status === 408 || status === 504 || code === "timeout") return "服務回應逾時，請稍後再試。";
  return statusFallback[status] ?? "操作失敗，請重試。";
}

function userVisibleMessage(url: string, status: number, code: string | undefined, message: unknown): string {
  const candidate = typeof message === "string" ? message : "";
  return candidate.trim() && !engineeringErrorTerm.test(candidate)
    ? candidate
    : contextualFallback(url, status, code);
}

async function responseError(res: Response, url: string): Promise<never> {
  const body = await res.json().catch(() => ({}));
  const payload = body !== null && typeof body === "object" ? body as { error?: unknown; message?: unknown } : {};
  const code = typeof payload.error === "string" ? payload.error : undefined;
  const message = userVisibleMessage(url, res.status, code, payload.message);
  throw new ApiError(code === "timeout" ? "timeout" : "failed", message, res.status, code, body, res);
}
async function call<T>(url: string, init: RequestInit = {}, token?: string, signal?: AbortSignal): Promise<T> {
  try {
    const headers = new Headers(init.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    const res = await fetch(url, { ...init, headers, signal: signalFor(signal), cache: "no-store" });
    if (!res.ok) return await responseError(res, url);
    if (res.status === 204) return undefined as T;
    return await res.json() as T;
  } catch (e) { throw errorOf(e); }
}
const json = (method: string, body?: unknown): RequestInit => ({method, headers:{"content-type":"application/json"}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
export async function voice(audio: File, signal?: AbortSignal): Promise<VoiceResult> {
  const form = new FormData(); form.append("audio", audio);
  const result = voiceResultSchema.safeParse(await call<unknown>("/api/voice", {method:"POST",body:form}, undefined, signal));
  if (!result.success) throw new ApiError("failed", "語音服務回應格式不正確。");
  return result.data;
}
export const parse = (transcript: string, current: Need | null, signal?: AbortSignal) => call<Need>("/api/parse", json("POST",{transcript,current}), undefined, signal);
export const browse = (signal?: AbortSignal) => call<Bucket>("/api/browse", {}, undefined, signal);

export type GroupOfferProgress = {
  candidate_id: string;
  capacity: number;
  joined_count: number;
  remaining_count: number;
  full: boolean;
};
export type GroupOfferMember = {
  username: string;
  nickname: string;
  joined_at: string;
  is_self: boolean;
};
export type GroupOfferParticipation = GroupOfferProgress & {
  joined: boolean;
  members: GroupOfferMember[] | null;
};
const MAX_GROUP_OFFER_IDS = 100;
const groupOfferIds = (ids: string[]) => ids.map(id => encodeURIComponent(id)).join(",");
const groupOfferBatches = (ids: string[]) => {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return [];
  const batches: string[][] = [];
  for (let index = 0; index < uniqueIds.length; index += MAX_GROUP_OFFER_IDS) {
    batches.push(uniqueIds.slice(index, index + MAX_GROUP_OFFER_IDS));
  }
  return batches;
};

export async function groupOfferStatus(ids: string[], signal?: AbortSignal): Promise<{offers: GroupOfferProgress[]}> {
  const batches = groupOfferBatches(ids);
  if (batches.length === 0) return { offers: [] };
  const results = await Promise.all(batches.map(batch =>
    call<{offers: GroupOfferProgress[]}>(`/api/group-offers/status?ids=${groupOfferIds(batch)}`, {}, undefined, signal),
  ));
  return { offers: results.flatMap(result => result.offers) };
}

export async function groupOfferMine(token: string, ids: string[], signal?: AbortSignal): Promise<{offers: GroupOfferParticipation[]}> {
  const batches = groupOfferBatches(ids);
  if (batches.length === 0) return { offers: [] };
  const results = await Promise.all(batches.map(batch =>
    call<{offers: GroupOfferParticipation[]}>(`/api/group-offers/mine?ids=${groupOfferIds(batch)}`, {}, token, signal),
  ));
  return { offers: results.flatMap(result => result.offers) };
}
export const joinGroupOffer = (token: string, id: string, signal?: AbortSignal) =>
  call<GroupOfferParticipation>(`/api/group-offers/${encodeURIComponent(id)}/join`, json("POST"), token, signal);
export const leaveGroupOffer = (token: string, id: string, signal?: AbortSignal) =>
  call<GroupOfferParticipation>(`/api/group-offers/${encodeURIComponent(id)}/join`, {method: "DELETE"}, token, signal);
export const candidates = (ids: string[], signal?: AbortSignal) => call<Rec[]>(`/api/candidates?ids=${encodeURIComponent(ids.join(","))}`, {}, undefined, signal);
export type ServiceConfig = {database:boolean;parse:boolean;voice:boolean;ranking:boolean;support_email:string|null;area:string};
export const config = () => call<ServiceConfig>("/api/config");
export const register = (username:string,password:string,nickname:string) => call<AuthResponse>("/api/auth/register",json("POST",{username,password,nickname}));
export const login = (username:string,password:string) => call<AuthResponse>("/api/auth/login",json("POST",{username,password}));
export const me = (token:string) => call<{user:User;data:AccountData}>("/api/auth/me",{},token);
export const logout = (token:string) => call<void>("/api/auth/logout",json("POST"),token);
export const changePassword = (token:string,current_password:string,new_password:string) => call<void>("/api/auth/change-password",json("POST",{current_password,new_password}),token);
export const saveData = (token:string,data:AccountData) => call<AccountData>("/api/me/data",json("PUT",data),token);
export type CandidateReport = {reason:string;note:string;created_at:string;by:string};
export const reports = (id:string, signal?:AbortSignal) => call<CandidateReport[]>(`/api/candidates/${encodeURIComponent(id)}/reports`,{},undefined,signal);
export const report = (token:string,id:string,reason:string,note:string) => call<unknown>(`/api/candidates/${encodeURIComponent(id)}/reports`,json("POST",{reason,note}),token);

import type { SearchEvent } from "../shared/search.ts";
export type { SearchEvent } from "../shared/search.ts";

// Stateful line parser handles arbitrary UTF-8 chunks, CRLF, comments and multiline data.
export function sseDecoder(onEvent:(event:SearchEvent)=>void) {
  let buffer = "", data: string[] = [];
  const line = (value:string) => {
    if (value === "") { if (data.length) { onEvent(JSON.parse(data.join("\n")) as SearchEvent); data = []; } }
    else if (value.startsWith("data:")) data.push(value.slice(5).replace(/^ /,""));
  };
  return {push(chunk:string){buffer += chunk; let end: number; while ((end=buffer.indexOf("\n"))>=0) {line(buffer.slice(0,end).replace(/\r$/,"")); buffer=buffer.slice(end+1);}}, finish(){if(buffer) line(buffer.replace(/\r$/,""));line("");buffer="";}};
}
export async function search(body:{need:Need;exclude:string[];location:{lat:number;lng:number}|null},onEvent:(e:SearchEvent)=>void,signal?:AbortSignal):Promise<void> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const res = await fetch("/api/search", {...json("POST",body), signal:signalFor(signal,60_000), cache:"no-store"});
    if (!res.ok) return await responseError(res, "/api/search");
    if (!res.body || !res.headers.get("content-type")?.includes("text/event-stream")) throw new ApiError("failed","搜尋回應格式不正確。");
    reader = res.body.getReader(); let complete=false;
    const decoder = sseDecoder(event=>{if("step" in event && event.step==="done")complete=true;onEvent(event);});
    const utf8 = new TextDecoder();
    for (;;) {const {done,value}=await reader.read();if(done)break;decoder.push(utf8.decode(value,{stream:true}));}
    decoder.push(utf8.decode());decoder.finish();
    if(!complete)throw new ApiError("failed","搜尋串流未完成，已收到的結果僅為部分結果，請重試。");
  } catch (e) {throw errorOf(e);} finally {if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
}
