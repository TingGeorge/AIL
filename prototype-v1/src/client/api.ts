import type { Need } from "../shared/need.ts";
import type { Rec } from "../shared/records.ts";
import type { AccountData, AuthResponse, User } from "../shared/account.ts";

export class ApiError extends Error {
  constructor(public kind: "timeout" | "failed" | "aborted", message: string, public status = 0) { super(message); }
}
const errorOf = (e: unknown): ApiError => e instanceof ApiError ? e : new ApiError(
  (e as Error).name === "TimeoutError" ? "timeout" : (e as Error).name === "AbortError" ? "aborted" : "failed",
  (e as Error).name === "TimeoutError" ? "連線逾時，請重試。" : "連線中斷，請檢查網路後重試。",
);
const signalFor = (signal?: AbortSignal, ms = 30_000) => signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
async function responseError(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new ApiError(body.error === "timeout" ? "timeout" : "failed", body.message ?? ({401:"登入已逾時或帳號密碼錯誤，請重新登入。",409:"此帳號名稱已被使用。",429:"嘗試次數過多，請稍後再試。",503:"服務尚未設定，請聯絡管理者。"}[res.status] ?? "操作失敗，請重試。"), res.status);
}
async function call<T>(url: string, init: RequestInit = {}, token?: string, signal?: AbortSignal): Promise<T> {
  try {
    const headers = new Headers(init.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    const res = await fetch(url, { ...init, headers, signal: signalFor(signal), cache: "no-store" });
    if (!res.ok) return await responseError(res);
    if (res.status === 204) return undefined as T;
    return await res.json() as T;
  } catch (e) { throw errorOf(e); }
}
const json = (method: string, body?: unknown): RequestInit => ({method, headers:{"content-type":"application/json"}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
export const transcribe = (audio: Blob, signal?: AbortSignal) => {
  const form = new FormData(); form.append("audio", audio, "clip.webm");
  return call<{transcript:string}>("/api/transcribe", {method:"POST",body:form}, undefined, signal);
};
export const parse = (transcript: string, current: Need | null, signal?: AbortSignal) => call<Need>("/api/parse", json("POST",{transcript,current}), undefined, signal);
export const candidates = (ids: string[], signal?: AbortSignal) => call<Rec[]>(`/api/candidates?ids=${encodeURIComponent(ids.join(","))}`, {}, undefined, signal);
export type ServiceConfig = {database:boolean;parse:boolean;transcribe:boolean;ranking:boolean;support_email:string|null;area:string};
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
export async function search(body:{need:Need;exclude:string[];location:{lat:number;lng:number}|null;costco_ok:boolean},onEvent:(e:SearchEvent)=>void,signal?:AbortSignal):Promise<void> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const res = await fetch("/api/search", {...json("POST",body), signal:signalFor(signal,60_000), cache:"no-store"});
    if (!res.ok) return await responseError(res);
    if (!res.body || !res.headers.get("content-type")?.includes("text/event-stream")) throw new ApiError("failed","搜尋回應格式不正確。");
    reader = res.body.getReader(); let complete=false;
    const decoder = sseDecoder(event=>{if("step" in event && event.step==="done")complete=true;onEvent(event);});
    const utf8 = new TextDecoder();
    for (;;) {const {done,value}=await reader.read();if(done)break;decoder.push(utf8.decode(value,{stream:true}));}
    decoder.push(utf8.decode());decoder.finish();
    if(!complete)throw new ApiError("failed","搜尋串流未完成，已收到的結果僅為部分結果，請重試。");
  } catch (e) {throw errorOf(e);} finally {if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
}
