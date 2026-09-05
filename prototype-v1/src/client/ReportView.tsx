import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { REPORT_REASONS } from "../shared/account.ts";
import * as api from "./api.ts";
export function ReportView({id,token,onLogin,onExpired}:{id:string;token:string|null;onLogin:()=>void;onExpired:(e:unknown)=>void}){
 const [items,setItems]=useState<api.CandidateReport[]>([]),[reason,setReason]=useState<string>(REPORT_REASONS[0]),[note,setNote]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{const controller=new AbortController();setLoading(true);api.reports(id,controller.signal).then(setItems).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[id]);
 return <section className="reports-panel" id="candidate-reports"><h2><Flag/>來源與使用經驗回報</h2><p className="fine-print">回報為使用者陳述，不代表已證實；公開顯示你的暱稱。請勿填寫個資。</p>
 {loading?<p role="status">讀取回報中…</p>:items.length===0?<p className="section-copy">目前沒有公開回報。</p>:<ul className="report-list">{items.map((item,i)=><li key={`${item.created_at}-${i}`}><b>{item.reason}</b><span>{item.by} · {new Date(item.created_at).toLocaleDateString("zh-TW")}</span><p>{item.note||"未附註記"}</p></li>)}</ul>}
 {token?<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");setMessage("");try{await api.report(token,id,reason,note);setNote("");setMessage("回報已儲存，候選資料不會因此自動改成已驗證。");setItems(await api.reports(id));}catch(e){setError((e as Error).message);if(e instanceof api.ApiError&&e.status===401)onExpired(e);}finally{setBusy(false);}}}><label className="field">回報類型<select value={reason} onChange={e=>setReason(e.target.value)}>{REPORT_REASONS.map(r=><option key={r}>{r}</option>)}</select></label><label className="field">補充說明（最多 500 字，公開）<textarea value={note} maxLength={500} onChange={e=>setNote(e.target.value)} placeholder="請描述你觀察到的差異"/></label><button className="secondary-action" disabled={busy}>{busy?"送出中…":"送出回報"}</button></form>:<button className="secondary-action" onClick={onLogin}>登入後回報</button>}
 {error&&<p role="alert" className="notice error">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}
 </section>;
}
