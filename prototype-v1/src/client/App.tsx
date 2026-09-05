import { GroupOffers } from "./GroupOffers.tsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bookmark, Check, CircleDollarSign, Compass, Gift, Heart, Home, Info, LogIn, MapPin, Mic, Pencil, Radar, Search, Settings, SlidersHorizontal, Sparkles, Square, TicketPercent, UserRound, WalletCards, X } from "lucide-react";
import { EMPTY_NEED, needSchema, type Need } from "../shared/need.ts";
import { currentAccountMonth, type AccountSettings } from "../shared/account.ts";
import type { VoiceResult } from "../shared/voice.ts";
import { isDemoRecord, type Rec } from "../shared/records.ts";
import * as api from "./api.ts";
import { Recorder, scheduleRecordingLimit, recordingSupported } from "./recorder.ts";
import { detailRecord, initialSearch, rankedRecords, reduceSearch } from "./search-state.ts";
import { useAccount } from "./useAccount.ts";
import { applyBudgetDefault } from "./need-defaults.ts";
import { canMarkBought, markBought } from "./purchases.ts";
import { NeedEditor } from "./NeedEditor.tsx";
import { AccountView, SettingsView } from "./AccountView.tsx";
import { ReportView } from "./ReportView.tsx";
import { ResultsView, DetailView } from "./ResultsView.tsx";
import { BrowseResults } from "./BrowseResults.tsx";
import { CatalogNotice } from "./CatalogNotice.tsx";
import { displayDataStatus, displayTagLabel } from "./display.ts";
import { APP_ROUTE_CHANGE_EVENT, backAppRoute, pushAppRoute, replaceAppRoute } from "./navigation.ts";
import { locationFailureStatus, requestUserPosition, type LocationStatus } from "./location.ts";
import "./mvp.css";
import "./integration.css";

type View="welcome"|"home"|"filters"|"search"|"results"|"detail"|"saved"|"account"|"settings"|"offers";
type Mode="daily"|"team"|"zero";
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
const views:View[]=["welcome","home","filters","search","results","detail","saved","account","settings","offers"];
function safeDecode(value:string){try{return decodeURIComponent(value);}catch{return value;}}
function route(){const [raw,id]=location.hash.replace(/^#\/?/,"").split("/");return {view:views.includes(raw as View)?raw as View:"welcome",id:id?safeDecode(id):null};}
const routePath=(view:View,id?:string)=>`/${view}${id?`/${encodeURIComponent(id)}`:""}`;
const navigate=(view:View,id?:string)=>pushAppRoute(routePath(view,id));
const replaceRoute=(view:View,id?:string)=>replaceAppRoute(routePath(view,id));
const fallbackRoute=(view:View)=>view==="home"?"/welcome":view==="detail"?"/results":"/home";
const money=(value:number)=>new Intl.NumberFormat("zh-TW",{maximumFractionDigits:0}).format(value);
const modes={daily:{short:"日常",title:"精打細算",description:"依目前資料與來源說明探索",color:"var(--lime)"},team:{short:"優惠",title:"一起省更多",description:"商家團購條件與兌換資訊",color:"var(--violet)"},zero:{short:"零元",title:"零元探索",description:"只看預估總費用為 0 的選項",color:"var(--coral)"}};
export function prepareVoiceReview(result:VoiceResult,settings:AccountSettings,now=new Date()){
 const prepared=applyBudgetDefault(result.need,settings,now);
 return {transcript:result.transcript,need:prepared.need,budgetFromSettings:prepared.fromSettings,parsed:true,reviewStarted:true,mode:prepared.need.free_only?"zero" as const:"daily" as const};
}
// The browser only says why via error.code; a single generic message hides a fixable OS/browser permission.
export function locateErrorMessage(error:{code:number}){
 if(error.code===1)return "定位權限被拒絕。請在網址列的權限選單允許定位；macOS 另需在「系統設定 → 隱私權與安全性 → 定位服務」開啟瀏覽器。也可以直接搜尋，不比較距離。";
 if(error.code===3)return "定位逾時。請確認裝置定位已開啟後再試一次，或直接搜尋、不比較距離。";
 return "目前取不到位置訊號（可能是定位服務關閉或無訊號）。可稍後再試，或直接搜尋、不比較距離。";
}
export const voiceResultIsCurrent=(signal:AbortSignal,revision:number,currentRevision:number)=>!signal.aborted&&revision===currentRevision;
export function voiceCorrectionText(result:VoiceResult){
 const text=result.transcript.trim();
 if(!text)throw new Error("沒有辨識到修正內容。");
 return text;
}
export function App(){
 const [current,setCurrent]=useState(route),[mode,setMode]=useState<Mode>("daily"),[transcript,setTranscript]=useState(""),[need,setNeed]=useState<Need>({...EMPTY_NEED}),[parsed,setParsed]=useState(false),[correction,setCorrection]=useState(""),[correctionMode,setCorrectionMode]=useState<"text"|"voice">("text");
 const account=useAccount();
 const [reviewStarted,setReviewStarted]=useState(false),[budgetFromSettings,setBudgetFromSettings]=useState(false);
 const [config,setConfig]=useState<api.ServiceConfig|null>(null),[configError,setConfigError]=useState(false),[online,setOnline]=useState(navigator.onLine);
 const [busy,setBusy]=useState<""|"parsing"|"recording"|"voice">(""),[seconds,setSeconds]=useState(0),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [position,setPosition]=useState<{lat:number;lng:number}|null>(null),[locationStatus,setLocationStatus]=useState<LocationStatus>("requesting");
 const [searchStarted,setSearchStarted]=useState(false);
 const [searchState,setSearchState]=useState(initialSearch),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState("");
 const [cache,setCache]=useState<Record<string,Rec>>({}),[recordError,setRecordError]=useState(""),[recordsLoading,setRecordsLoading]=useState(false),[collection,setCollection]=useState<"list"|"favs">("list");
 const [installPrompt,setInstallPrompt]=useState<InstallPrompt|null>(null);
 const searchAbort=useRef<AbortController|null>(null),parseAbort=useRef<AbortController|null>(null),requestId=useRef(0),recorder=useRef<Recorder|null>(null),recordTimer=useRef<ReturnType<typeof setInterval>|null>(null),recordDeadline=useRef<ReturnType<typeof setTimeout>|null>(null),transcriptRevision=useRef(0),voicePurpose=useRef<"initial"|"correction">("initial");
 const results=useMemo(()=>rankedRecords(searchState,account.data.settings.survival),[searchState,account.data.settings.survival]);
 const selected=detailRecord(searchState,cache,current.id);
 const canStore=Boolean(account.user&&account.token&&!account.restoring);
 const ids=account.data[collection];
 const mergeRecords=(records:Rec[])=>setCache(previous=>({...previous,...Object.fromEntries(records.map(r=>[r.id,r]))}));
 const go=(view:View,id?:string)=>{setError("");setMessage("");navigate(view,id);};
 const goBack=()=>{setError("");setMessage("");backAppRoute(fallbackRoute(current.view));};
 useEffect(()=>{const onRoute=()=>setCurrent(route());window.addEventListener("hashchange",onRoute);window.addEventListener("popstate",onRoute);window.addEventListener(APP_ROUTE_CHANGE_EVENT,onRoute);return()=>{window.removeEventListener("hashchange",onRoute);window.removeEventListener("popstate",onRoute);window.removeEventListener(APP_ROUTE_CHANGE_EVENT,onRoute);};},[]);
 useEffect(()=>{void locate();},[]);
 useEffect(()=>{if(current.view!=="search"&&searching){requestId.current++;searchAbort.current?.abort();setSearching(false);}},[current.view]);
 useEffect(()=>{let live=true;api.config().then(value=>{if(live)setConfig(value);}).catch(()=>{if(live)setConfigError(true);});const change=()=>setOnline(navigator.onLine);const install=(event:Event)=>{event.preventDefault();setInstallPrompt(event as InstallPrompt);};window.addEventListener("online",change);window.addEventListener("offline",change);window.addEventListener("beforeinstallprompt",install);return()=>{live=false;window.removeEventListener("online",change);window.removeEventListener("offline",change);window.removeEventListener("beforeinstallprompt",install);};},[]);
 useEffect(()=>()=>{requestId.current++;searchAbort.current?.abort();parseAbort.current?.abort();if(recordTimer.current)clearInterval(recordTimer.current);if(recordDeadline.current)clearTimeout(recordDeadline.current);void recorder.current?.stop().catch(()=>{});},[]);
 useEffect(()=>{const voiceView=voicePurpose.current==="correction"?"filters":"home";if(current.view!==voiceView&&recorder.current){const mic=recorder.current;recorder.current=null;if(recordTimer.current)clearInterval(recordTimer.current);if(recordDeadline.current)clearTimeout(recordDeadline.current);void mic.stop().catch(()=>{});setBusy("");}if(current.view!==voiceView&&busy==="voice"){parseAbort.current?.abort();setBusy("");}},[current.view]);
 useEffect(()=>{if(!message)return;const t=setTimeout(()=>setMessage(""),6000);return()=>clearTimeout(t);},[message]);
 const loadIds=current.view==="detail"&&current.id?[current.id]:current.view==="saved"?ids:[];
 const idsKey=loadIds.join(",");
 useEffect(()=>{if(!idsKey){setRecordsLoading(false);setRecordError("");return;}const controller=new AbortController();setRecordsLoading(true);setRecordError("");api.candidates(idsKey.split(","),controller.signal).then(mergeRecords).catch(e=>{if(!controller.signal.aborted)setRecordError(e.message);}).finally(()=>{if(!controller.signal.aborted)setRecordsLoading(false);});return()=>controller.abort();},[idsKey,account.user?.id]);
 async function toggle(id:string,kind:"favs"|"list"){
  if(!canStore){go("account");return;}
  const adding=!account.data[kind].includes(id);if(adding&&account.data[kind].length>=200){setError("清單或收藏最多各 200 筆，請先移除一些項目。");return;}
  try{await account.update(data=>({...data,[kind]:data[kind].includes(id)?data[kind].filter(v=>v!==id):[...data[kind],id]}));setMessage(adding?(kind==="favs"?"已收藏並儲存到帳號":"已加入清單並儲存到帳號"):"已從帳號移除");}catch{/* Account state displays retryable sync failure. */}
 }
 async function buy(item:Rec){
  if(!canStore){go("account");return;}
  try{await account.update(data=>markBought(data,item));setMessage("已依你的確認移出清單，累計本月支出；此操作不會付款。");}catch(e){setError((e as Error).message);}
 }
 function openManual(){
  if(!reviewStarted){const prepared=applyBudgetDefault({...EMPTY_NEED,need:transcript.trim(),free_only:mode==="zero"},account.data.settings);setNeed(prepared.need);setBudgetFromSettings(prepared.fromSettings);setReviewStarted(true);}
  go("filters");
 }
 async function parseText(delta=false){
  const input=(delta?correction:transcript).trim();if(!input){setError("請先輸入或錄下你的需求，也可以直接手動填寫。");return;}
  parseAbort.current?.abort();const controller=new AbortController();parseAbort.current=controller;const revision=transcriptRevision.current;setBusy("parsing");setError("");
  try{const next=needSchema.parse(await api.parse(input,delta?need:null,controller.signal));if(controller.signal.aborted||revision!==transcriptRevision.current)return;const prepared=delta?{need:next,fromSettings:budgetFromSettings&&next.budget_total_twd===need.budget_total_twd}:applyBudgetDefault(next,account.data.settings);setNeed(prepared.need);setBudgetFromSettings(prepared.fromSettings);setReviewStarted(true);setParsed(true);setMode(next.free_only?"zero":"daily");setCorrection("");go("filters");}
  catch(e){if(!controller.signal.aborted)setError(`${(e as Error).message} 你仍可手動設定條件。`);}
  finally{if(parseAbort.current===controller)setBusy("");}
 }
 async function stopVoice(){
  if(recordTimer.current)clearInterval(recordTimer.current);if(recordDeadline.current)clearTimeout(recordDeadline.current);
  const currentRecorder=recorder.current;if(!currentRecorder)return;const purpose=voicePurpose.current;recorder.current=null;setBusy("voice");
  parseAbort.current?.abort();const controller=new AbortController();parseAbort.current=controller;const revision=transcriptRevision.current;
  try{
   const clip=await currentRecorder.stop();if(!clip.size)throw new Error("沒有錄到音訊。");if(!voiceResultIsCurrent(controller.signal,revision,transcriptRevision.current))return;
   if(purpose==="correction"){
    const spoken=voiceCorrectionText(await api.voice(clip,controller.signal));if(!voiceResultIsCurrent(controller.signal,revision,transcriptRevision.current))return;
    setCorrection(spoken);setMessage("已轉成修正文字，請確認後送出。");
   }else{
    const review=prepareVoiceReview(await api.voice(clip,controller.signal),account.data.settings);
    if(!voiceResultIsCurrent(controller.signal,revision,transcriptRevision.current))return;
    setTranscript(review.transcript);transcriptRevision.current++;setNeed(review.need);setBudgetFromSettings(review.budgetFromSettings);setParsed(review.parsed);setReviewStarted(review.reviewStarted);setMode(review.mode);setCorrection("");go("filters");setMessage("請確認語音與條件。");
   }
  }catch(e){if(!controller.signal.aborted)setError(`${(e as Error).message} 請重試或改用文字輸入。`);}finally{if(parseAbort.current===controller)setBusy("");}
 }
 async function startVoice(purpose:"initial"|"correction"="initial"){
  if(busy==="recording"){await stopVoice();return;}if(busy)return;
  if(!recordingSupported()){setError("此瀏覽器無法錄音；請使用 HTTPS 或改用文字輸入。");return;}
  setError("");voicePurpose.current=purpose;const mic=new Recorder();recorder.current=mic;
  try{setBusy("recording");await mic.start();if(recorder.current!==mic){await mic.stop();return;}setSeconds(0);recordTimer.current=setInterval(()=>setSeconds(n=>n+1),1000);recordDeadline.current=scheduleRecordingLimit(()=>void stopVoice());}catch{if(recorder.current!==mic)return;recorder.current=null;setBusy("");setError("麥克風未開啟或權限被拒絕，請改用文字輸入。");}
 }
 async function locate(){
  if(!navigator.geolocation||!window.isSecureContext){setPosition(null);setLocationStatus("unavailable");return;}
  setLocationStatus("requesting");
  try{const next=await requestUserPosition(navigator.geolocation);setPosition(next);setLocationStatus("available");}
  catch(error){setPosition(null);setLocationStatus(locationFailureStatus(error));}
 }
 async function startSearch(){
  const valid=needSchema.safeParse(need);if(!valid.success){setError("條件格式不正確，請檢查數字範圍與日期。");return;}if(!need.need.trim()&&!need.target_categories.length){setError("請填寫生活需求或選擇一個類別。");return;}
  searchAbort.current?.abort();const controller=new AbortController();searchAbort.current=controller;const id=++requestId.current;
  setSearchStarted(true);setSearchState(initialSearch());setSearchError("");setSearching(true);go("search");const location=position;
  try{await api.search({need:{...valid.data,soft_preferences:[...new Set([...valid.data.soft_preferences,...account.data.settings.prefs])]},exclude:[...new Set([...account.data.settings.exclude,...valid.data.exclude_tags])],location},event=>{if(id!==requestId.current||controller.signal.aborted)return;setSearchState(state=>reduceSearch(state,event));if("records" in event)mergeRecords(event.records);if("step" in event&&event.step==="done")mergeRecords([...event.pending,...event.excluded]);},controller.signal);if(id===requestId.current)replaceRoute("results");}
  catch(e){if(id===requestId.current&&!controller.signal.aborted){setSearchError((e as Error).message);replaceRoute("results");}}
  finally{if(id===requestId.current)setSearching(false);}
 }
 function chooseMode(value:Mode){setMode(value);setNeed(n=>({...n,free_only:value==="zero"}));}
 async function install(){if(!installPrompt){setMessage("瀏覽器選單選「安裝 App」；iPhone 請用 Safari 分享 → 加入主畫面。");return;}try{await installPrompt.prompt();const result=await installPrompt.userChoice;setMessage(result.outcome==="accepted"?"已接受安裝，請依瀏覽器提示完成。":"未安裝，你可以繼續使用網頁。");setInstallPrompt(null);}catch{setError("無法啟動安裝，請使用瀏覽器選單。");}}
 const completedGroups=Object.values(searchState.groups).filter(group=>group.status!=="ranking").length;
 const progress=searchState.complete?100:!searchState.filtered?0:searchState.totalGroups?Math.round(completedGroups/searchState.totalGroups*100):100;
 const spent=account.data.settings.spent_month===currentAccountMonth()?account.data.settings.spent:0;
 const budget=account.data.settings.monthly_budget;
 const titles:Record<View,string>={welcome:"ALL IN LIFE",home:"ALL IN LIFE",filters:"確認需求與條件",search:"正在探索",results:"生活選項",detail:"選項詳情",saved:"我的生活清單",account:"帳號",settings:"生活設定",offers:"團購方案"};
 return <div className="app-stage" data-survival={account.data.settings.survival}><div className="ambient ambient-one"/><div className="ambient ambient-two"/>
 <aside className="desktop-note"><span>ALL IN LIFE</span><h2>每一個選擇，<br/>都有生活的依據。</h2><p>圓山生活探索 · 來源 × 費用 × 你的需求</p><div className="connection-badge"><i className={online?"online":""}/>{online?"已連線":"目前離線"}</div></aside>
 <main className="phone-shell">
 {current.view!=="welcome"&&<header className="app-header glass"><button className="icon-button" aria-label="回上一頁" onClick={goBack}><ArrowLeft aria-hidden="true"/></button><div className="header-title"><b>{titles[current.view]}</b><span><MapPin aria-hidden="true"/>{current.view==="offers"?"適用地區與資格依各筆優惠":"主要涵蓋圓山，延伸至士林"}</span></div><button className="icon-button" aria-label="帳號與登入" onClick={()=>go("account")}><UserRound aria-hidden="true"/></button></header>}
 {!online&&<div className="status-banner" role="status">目前離線，搜尋、登入與儲存暫停；畫面不是最新資料。</div>}
 {account.restoring&&<div className="status-banner" role="status">正在載入帳號資料，請稍候…</div>}
 {account.error&&<div className="status-banner error" role="alert">{account.error}{canStore&&<button onClick={()=>void account.update(data=>({...data})).catch(()=>{})}>重試同步</button>}<button onClick={()=>{if(confirm("重新載入會捨棄尚未同步的本機變更，是否繼續？"))void account.reload().catch(account.reject);}}>重新載入帳號資料</button><button type="button" aria-label="關閉帳號訊息" onClick={()=>account.setError("")}><X aria-hidden="true"/></button></div>}
 {(error||message)&&<div className={`status-banner ${error?"error":"success"}`} role={error?"alert":"status"}>{error||message}<button type="button" aria-label="關閉提示" onClick={()=>{setError("");setMessage("");}}><X aria-hidden="true"/></button></div>}
 <div className="screen-stack">
 {current.view==="welcome"&&<section className="welcome-screen"><div className="welcome-mark"><span>ALL</span><span>IN</span><span>LIFE</span></div><p>把預算、時間、距離與偏好<br/>變成今天真的做得到的選擇。</p><div className="welcome-visual"><Compass aria-hidden="true"/><i/><i/><i/></div><button className="primary-action" onClick={()=>go("home")}><Gift aria-hidden="true"/>先不用登入，開始探索<ArrowRight aria-hidden="true"/></button><button className="secondary-action" onClick={()=>go("account")}><LogIn aria-hidden="true"/>登入後儲存清單</button><small>不登入也能搜尋；登入後才能儲存清單與收藏。<br/>語音、逐字稿與搜尋條件不會寫入帳號。</small></section>}
 {current.view==="home"&&<section className="screen home-screen"><div className="home-greeting"><div>{account.user&&<span className="kicker">{account.user.nickname}，你好</span>}<h1>今天需要什麼？</h1></div><button className="avatar-button" style={{background:account.data.profile.color}} aria-label="個人帳號" onClick={()=>go("account")}>{account.user?account.user.nickname.slice(0,1):<UserRound aria-hidden="true"/>}</button></div>
 <button className="wallet-card" onClick={()=>go("settings")} aria-label="設定本月預算與已花費"><div><span className="wallet-label"><WalletCards aria-hidden="true"/>本月剩餘</span><strong>{budget===null?"尚未設定":`NT$ ${money(budget-spent)}`}</strong></div><div className="wallet-side"><span>手動記錄支出</span><b>NT$ {money(spent)}</b><small>調整生活預算</small></div><div className="wallet-progress"><i style={{width:`${budget&&budget>0?Math.max(0,Math.min(100,(budget-spent)/budget*100)):0}%`}}/></div></button>
 <div className="mode-carousel">{(Object.keys(modes) as Mode[]).map(value=><button key={value} className={`mode-card ${mode===value?"active":""}`} style={{"--mode-color":modes[value].color} as React.CSSProperties} onClick={()=>chooseMode(value)}><span>{value==="daily"?<CircleDollarSign aria-hidden="true"/>:value==="team"?<TicketPercent aria-hidden="true"/>:<Gift aria-hidden="true"/>}</span><b>{modes[value].short}</b><small>{modes[value].title}</small>{mode===value&&<Check className="mode-check" aria-hidden="true"/>}</button>)}</div>
 <div className="mission-card"><div className="mission-top"><span className="mode-dot"/><span>{modes[mode].title}</span><button onClick={openManual}><SlidersHorizontal aria-hidden="true"/>自行設定條件</button></div>
 {config?.voice===true&&<button className={`voice-action ${busy==="recording"?"recording":""}`} disabled={busy!==""&&busy!=="recording"} onClick={()=>void startVoice()}><span>{busy==="recording"?<Square aria-hidden="true"/>:<Mic aria-hidden="true"/>}</span><b>{busy==="recording"?`錄音 ${seconds} / 30 秒 · 點擊停止`:busy==="voice"?"正在整理語音與條件…":"用語音說需求"}</b><small>最長 30 秒；停止後會整理成文字與條件，請確認後再搜尋。</small></button>}
 <label className="need-input"><Pencil aria-hidden="true"/><textarea value={transcript} maxLength={2000} placeholder="例如：兩人晚餐，300 元，不吃牛" aria-label="輸入需求或編輯文字內容" disabled={busy==="recording"||busy==="voice"} onChange={e=>{setTranscript(e.target.value);setParsed(false);setReviewStarted(false);transcriptRevision.current++;}}/><span>可修改文字或整理後的條件</span></label>
 <button className="primary-action" disabled={Boolean(busy)||!online} onClick={()=>config?.parse===false?openManual():void parseText()}>{config?.parse===false?<Search aria-hidden="true"/>:<Sparkles aria-hidden="true"/>}{busy==="parsing"?"整理中…":config?.parse===false?"自行設定條件":"整理並確認條件"}<ArrowRight aria-hidden="true"/></button>
 {config?.parse!==false&&<button className="text-button manual-button" onClick={openManual}>自行設定條件</button>}
 </div>
 {(config?.parse===false||config?.voice===false||configError)&&<p className="service-note">{configError?"暫時無法讀取服務狀態。":config?.parse===false&&config?.voice===false?"文字與語音服務目前無法使用。":config?.voice===false?"語音服務目前無法使用。":"文字整理服務目前無法使用。"}仍可直接輸入文字或自行設定條件。</p>}
 {config?.database===false&&<p className="notice warning">資料服務目前無法連線；搜尋與帳號暫時無法使用，請稍後重試。</p>}
 <CatalogNotice/>
 <button className="quick-team" onClick={()=>go("offers")}><span className="quick-icon"><TicketPercent aria-hidden="true"/></span><span><b>團購方案</b><small>查看參加人數與兌換方式</small></span><ArrowRight aria-hidden="true"/></button><p className="home-footnote"><Info aria-hidden="true"/>目前顯示的是已整理的公開資料，不是即時網路搜尋；價格、名額與服務狀態請以來源最新資訊為準。</p>
 </section>}
 {current.view==="filters"&&<section className="screen filters-screen"><h1>確認搜尋條件</h1>{transcript&&<blockquote className="transcript-copy"><small>原始文字／逐字稿</small>{transcript}</blockquote>}<NeedEditor need={need} onChange={value=>{transcriptRevision.current++;if(value.budget_total_twd!==need.budget_total_twd)setBudgetFromSettings(false);setNeed(value);}}/>{budgetFromSettings&&<p className="notice">預算來自設定：以本月預算減已花費，預填 NT$ {money(need.budget_total_twd??0)}；你可以修改或清空。</p>}{(account.data.settings.exclude.length>0||account.data.settings.prefs.length>0)&&<p className="fine-print">另外套用生活設定：排除 {account.data.settings.exclude.map(displayTagLabel).join("、")||"無"}；偏好 {account.data.settings.prefs.join("、")||"無"}。可到設定修改。</p>}
 {parsed&&<div className="setting-group correction-panel"><div className="correction-header"><b>一句話修正</b><div className="correction-method" role="group" aria-label="修正輸入方式"><button type="button" className={correctionMode==="text"?"active":""} aria-pressed={correctionMode==="text"} disabled={Boolean(busy)} onClick={()=>setCorrectionMode("text")}><Pencil aria-hidden="true"/>文字</button><button type="button" className={correctionMode==="voice"?"active":""} aria-pressed={correctionMode==="voice"} disabled={config?.voice!==true||Boolean(busy)} onClick={()=>setCorrectionMode("voice")}><Mic aria-hidden="true"/>語音</button></div></div>{correctionMode==="voice"&&<button type="button" className={`correction-voice ${busy==="recording"?"recording":""}`} disabled={busy!==""&&busy!=="recording"} onClick={()=>void startVoice("correction")}><span>{busy==="recording"?<Square aria-hidden="true"/>:<Mic aria-hidden="true"/>}</span><span><b>{busy==="recording"?`錄音 ${seconds} / 30 秒 · 點擊停止`:busy==="voice"?"正在轉成修正文字…":"錄下要修正的內容"}</b><small>最長 30 秒；停止後可先確認辨識文字，再送出修正。</small></span></button>}<label className="field"><span>{correctionMode==="voice"?"語音辨識結果（可修改）":"輸入要修正的內容"}</span><input value={correction} maxLength={2000} placeholder="例如：改成三個人，預算不變" disabled={busy==="recording"||busy==="voice"} onChange={e=>setCorrection(e.target.value)}/></label><button className="secondary-action correction-submit" disabled={Boolean(busy)||!correction.trim()} onClick={()=>void parseText(true)}>{busy==="parsing"?"修正中…":"只修正提到的條件"}</button></div>}
 <button className="primary-action" disabled={Boolean(busy)||searching||!online} onClick={()=>void startSearch()}><Search aria-hidden="true"/>確認條件，開始探索<ArrowRight aria-hidden="true"/></button>
 </section>}
 {current.view==="search"&&<section className="screen search-screen" aria-live="polite" aria-busy={searching}><div className="search-orbit"><div className="orbit-ring ring-one"/><div className="orbit-ring ring-two"/><Radar aria-hidden="true"/><span>{searchState.filtered?`${progress}%`:"…"}</span></div><h1>正在尋找選項</h1><p>正在比對資料與條件。</p><progress aria-label="推薦群組完成進度" max="100" value={progress}/><div className="scan-stats"><span>找到 {searchState.filtered?searchState.found:"—"}</span><span>符合 {searchState.filtered?searchState.passed:"—"}</span><span>已完成 {completedGroups}／{searchState.totalGroups} 組</span></div><div className="labor-list"><div className={searchState.filtered?"done":"working"}><span>{searchState.filtered?<Check aria-hidden="true"/>:<i aria-hidden="true"/>}</span><b>檢查資料與必要條件</b><small>{searchState.filtered?"已完成":"處理中"}</small></div>{Object.entries(searchState.groups).map(([key,group])=><div key={key} className={group.status==="ranking"?"working":"done"}><span>{group.status==="ranking"?<i aria-hidden="true"/>:<Check aria-hidden="true"/>}</span><b>{group.agent==="free"?"免費":"付費"} · {group.category}</b><small>{group.status==="failed"?"改用基本排序":group.status==="done"?"已完成":"排序中"}</small></div>)}</div><button type="button" className="secondary-action" onClick={()=>{requestId.current++;searchAbort.current?.abort();setSearching(false);go("filters");}}>取消並返回條件</button></section>}
 {current.view==="results"&&!searchStarted&&<BrowseResults position={position} locationStatus={locationStatus} list={account.data.list} onList={id=>void toggle(id,"list")} onOpen={id=>go("detail",id)} onAdjust={openManual}/>}
 {current.view==="results"&&searchStarted&&<div className="results-page"><div className="result-notices">{[...results,...searchState.pending,...searchState.excluded].some(isDemoRecord)&&<p className="notice warning"><b>目前包含專案示範資料</b>價格、地址、來源與優惠僅供測試串接，不是已驗證的真實商家資訊，請勿據此購買或前往。</p>}{searchError&&<div role="alert" className="notice error">{searchError}<button type="button" onClick={()=>go("filters")}>回到條件重試</button></div>}{!searchState.complete&&!searchError&&<p className="notice">搜尋尚未完成，目前僅顯示已收到的結果。可回到條件重新搜尋。</p>}</div><ResultsView position={position} locationStatus={locationStatus} preferredCategories={need.target_categories} records={results} pending={searchState.pending} excluded={searchState.excluded} list={account.data.list} survival={account.data.settings.survival} onList={id=>void toggle(id,"list")} onOpen={id=>go("detail",id)} onAdjust={()=>go("filters")}/></div>}
 {current.view==="detail"&&<div className="detail-page">{selected?<><DetailView item={selected} position={position} locationStatus={locationStatus} favorite={account.data.favs.includes(selected.id)} listed={account.data.list.includes(selected.id)} onFavorite={()=>void toggle(selected.id,"favs")} onList={()=>void toggle(selected.id,"list")} onReport={()=>{const panel=document.getElementById("candidate-reports");if(panel instanceof HTMLDetailsElement)panel.open=true;panel?.scrollIntoView({behavior:"smooth"});}}/><ReportView key={selected.id} id={selected.id} token={account.token} onLogin={()=>go("account")} onExpired={account.reject}/></>:<div className="empty-state"><Search aria-hidden="true"/><h2>{recordsLoading?"正在載入紀錄…":"找不到這筆選項"}</h2><p>{recordError||"這筆資料可能已移除，請重新搜尋。"}</p><button type="button" className="secondary-action" onClick={()=>go("home")}>重新探索</button></div>}</div>}
 {current.view==="saved"&&<section className="screen saved-screen"><h1>我的清單</h1><div className="segmented"><button className={collection==="list"?"active":""} onClick={()=>setCollection("list")}><Heart aria-hidden="true"/>清單 {account.data.list.length}</button><button className={collection==="favs"?"active":""} onClick={()=>setCollection("favs")}><Bookmark aria-hidden="true"/>收藏 {account.data.favs.length}</button></div>{!canStore?<div className="empty-state"><Bookmark aria-hidden="true"/><h2>先登入，再儲存</h2><p>不登入也能搜尋；登入後才能儲存清單與收藏。</p><button className="primary-action" onClick={()=>go("account")}>登入帳號<ArrowRight aria-hidden="true"/></button></div>:<>{recordsLoading&&<p role="status">正在載入已儲存的項目…</p>}{recordError&&<p role="alert" className="notice error">{recordError}</p>}{ids.length===0&&<div className="empty-state"><Heart aria-hidden="true"/><h2>這裡還沒有選項</h2><p>探索後，將想再看一眼的選項留下來。</p><button type="button" className="secondary-action" onClick={()=>go("home")}>開始探索</button></div>}<div className="saved-items">{ids.map(id=>{const item=cache[id];return <article className="saved-item" key={id}><button onClick={()=>go("detail",id)}><span className="kicker">{item?.category??"暫無資料"}</span><b>{item?.title??`紀錄 ${id} 已不可用或尚未載入`}</b><small>{item?(isDemoRecord(item)?"示範測試資料":displayDataStatus(item.data_status)):"可移除此項目"}</small></button>{collection==="list"&&item&&<button className="text-button" disabled={account.saving||!canMarkBought(item)} onClick={()=>void buy(item)} title="你確認已買才會累計；示範、過期或價格未知不可使用">標記已買</button>}<button type="button" className="icon-button" aria-label={`從${collection==="list"?"清單":"收藏"}移除 ${item?.title??id}`} onClick={()=>void toggle(id,collection)}><X aria-hidden="true"/></button></article>;})}</div></>}</section>}
  {current.view==="offers"&&<GroupOffers token={account.token} onLogin={()=>go("account")} onExpired={account.reject} onOpen={item=>{mergeRecords([item]);go("detail",item.id);}}/>}
 {current.view==="account"&&<AccountView account={account} onDone={()=>go("home")} supportEmail={config?.support_email??null}/>}
 {current.view==="settings"&&!account.restoring&&<SettingsView key={`${account.user?.id??"anonymous"}:${account.reloadCount}`} account={account} onLogin={()=>go("account")} onInstall={()=>void install()} installable={Boolean(installPrompt)}/>}
 </div>
 {current.view!=="welcome"&&current.view!=="search"&&<nav className="bottom-nav glass" aria-label="主要導覽">{([{view:"home",title:"探索",icon:Home},{view:"results",title:"結果",icon:Search},{view:"saved",title:"清單",icon:Heart},{view:"offers",title:"優惠",icon:TicketPercent},{view:"settings",title:"設定",icon:Settings}] as const).map(({view,title,icon:Icon})=><button key={view} className={current.view===view?"active":""} aria-current={current.view===view?"page":undefined} onClick={()=>go(view)}><Icon aria-hidden="true"/>{title}{view==="saved"&&account.data.list.length>0&&<i>{account.data.list.length}</i>}</button>)}</nav>}
 {account.saving&&<div className="saving-indicator" role="status" aria-live="polite">正在儲存到帳號…</div>}
 </main></div>;
}
