import { useState } from "react";
import { ArrowRight, LogIn, Save, ShieldCheck, UserRound } from "lucide-react";
import { DOT_COLORS, PREFS, TAGS } from "../shared/records.ts";
import { currentAccountMonth } from "../shared/account.ts";
import type { useAccount } from "./useAccount.ts";
type Account=ReturnType<typeof useAccount>;
export function AccountView({account,onDone,supportEmail}:{account:Account;onDone:()=>void;supportEmail:string|null}){
 const [mode,setMode]=useState<"login"|"register">("login"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[username,setUsername]=useState(""),[password,setPassword]=useState(""),[nickname,setNickname]=useState("");
 return <section className="screen auth-screen"><span className="kicker lime-text">YOUR LIFE, IN SYNC</span><h1>{account.user?"你的帳號":mode==="login"?"把生活清單\n留給下次的你":"建立你的生活帳號"}</h1><p className="section-copy">搜尋不需登入。登入後，收藏、清單與設定才會保存到伺服器，不合併匿名資料。</p>
 {account.restoring?<p role="status">正在還原帳號…</p>:account.user?<><div className="account-card"><UserRound/><h2>{account.user.nickname}</h2><p>@{account.user.username}</p><small>帳號資料已連接 PostgreSQL</small></div><button className="primary-action" onClick={onDone}>回到生活探索<ArrowRight/></button><button className="secondary-action" disabled={busy} onClick={async()=>{setBusy(true);try{await account.signOut();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>登出並撤銷本次工作階段</button></>:<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{await account.authenticate(mode,username,password,nickname);setPassword("");onDone();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 <div className="segmented"><button type="button" className={mode==="login"?"active":""} onClick={()=>setMode("login")}>登入</button><button type="button" className={mode==="register"?"active":""} onClick={()=>setMode("register")}>註冊</button></div>
 <label className="field">帳號<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required pattern="[A-Za-z0-9_-]{3,30}" minLength={3} maxLength={30} placeholder="3–30 個英數字、_ 或 -"/></label>
 {mode==="register"&&<label className="field">顯示名稱<input autoComplete="nickname" value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={30} required/></label>}
 <label className="field">密碼<input type="password" autoComplete={mode==="login"?"current-password":"new-password"} value={password} onChange={e=>setPassword(e.target.value)} required minLength={mode==="register"?12:1} maxLength={256} placeholder={mode==="register"?"至少 12 個字元":"輸入密碼"}/></label>
 <button className="primary-action" disabled={busy||account.restoring}><LogIn/>{busy?"連線中…":mode==="login"?"登入帳號":"建立帳號"}<ArrowRight/></button>
 </form>}
 {error&&<p role="alert" className="notice error">{error}</p>}
 <div className="notice"><ShieldCheck/><p>登入憑證只保留在本分頁，預設 30 分鐘逾時。語音、逐字稿、搜尋條件和精確位置不會寫入帳號資料。</p></div>
 {supportEmail&&<a className="source-link" href={`mailto:${supportEmail}`}>忘記密碼？聯絡支援（不會直接寄送舊密碼）</a>}
 </section>;
}
export function SettingsView({account,onLogin,onInstall,installable}:{account:Account;onLogin:()=>void;onInstall:()=>void;installable:boolean}){
 const [draft,setDraft]=useState(account.data),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[current,setCurrent]=useState(""),[next,setNext]=useState("");
 const settings=draft.settings;
 const set=<K extends keyof typeof settings>(key:K,value:(typeof settings)[K])=>setDraft({...draft,settings:{...settings,[key]:value}});
 return <section className="screen settings-screen"><span className="kicker lime-text">MAKE IT YOURS</span><h1>我的生活設定</h1><p className="section-copy">{account.user?"設定儲存後會同步到你的帳號。":"目前是匿名設定，只保留於此分頁的工作階段；登入後以帳號資料取代。"}</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage("");try{await account.update(latest=>({...latest,settings:draft.settings,profile:draft.profile}));setMessage(account.user?"設定已儲存到帳號。":"已套用本次匿名設定。");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>
 {account.user&&<><label className="field">顯示名稱<input value={draft.profile.nickname} onChange={e=>setDraft({...draft,profile:{...draft.profile,nickname:e.target.value}})} required minLength={1} maxLength={30}/></label><div className="avatar-colors">{DOT_COLORS.map(color=><button key={color} type="button" style={{background:color}} aria-label={`選擇頭像顏色 ${color}`} aria-pressed={draft.profile.color===color} onClick={()=>setDraft({...draft,profile:{...draft.profile,color}})}>{draft.profile.color===color?"✓":""}</button>)}</div></>}
 <div className="field-grid"><label className="field">本月生活預算<input type="number" min="0" max="100000000" step="1" value={settings.monthly_budget??""} onChange={e=>set("monthly_budget",e.target.value===""?null:Number(e.target.value))} placeholder="尚未設定"/></label><label className="field">本月已花費（自行確認）<input type="number" min="0" max="100000000" step="1" value={settings.spent_month===currentAccountMonth()?settings.spent:0} onChange={e=>setDraft({...draft,settings:{...settings,spent:Number(e.target.value),spent_month:currentAccountMonth()}})} required/></label></div>
 <p className="fine-print">這是自行填寫或「標記已買」累計的月支出總額，不是付款紀錄。App 不連接銀行，不會假造消費分析或省下金額。</p>
 <label className="check-row"><input type="checkbox" checked={settings.survival} onChange={e=>set("survival",e.target.checked)}/>生存模式：同類別免費優先，不排除付費</label>
 <label className="check-row"><input type="checkbox" checked={settings.costco_ok} onChange={e=>set("costco_ok",e.target.checked)}/>我有可使用的 Costco 會員資格</label>
 <fieldset className="tag-picker"><legend>預設排除</legend><div>{TAGS.map(tag=><button type="button" key={tag} className={settings.exclude.includes(tag)?"active":""} onClick={()=>set("exclude",settings.exclude.includes(tag)?settings.exclude.filter(v=>v!==tag):[...settings.exclude,tag])}>{tag}</button>)}</div></fieldset>
 <fieldset className="tag-picker"><legend>預設偏好</legend><div>{PREFS.map(pref=><button type="button" key={pref} className={settings.prefs.includes(pref)?"active":""} onClick={()=>set("prefs",settings.prefs.includes(pref)?settings.prefs.filter(v=>v!==pref):[...settings.prefs,pref])}>{pref}</button>)}</div></fieldset>
 <button className="primary-action" disabled={busy||account.restoring}><Save/>{busy?"儲存中…":"儲存設定"}</button>
 </form>
 {message&&<p role="status" className="notice">{message}</p>}
 {!account.user&&<button className="secondary-action" onClick={onLogin}>登入以跨裝置保存</button>}
 <div className="pwa-card"><h2>把 ALL IN LIFE 放到主畫面</h2><p className="section-copy">離線只能開啟介面；搜尋與帳號需要網路，API 不會快取。</p><button className="secondary-action" onClick={onInstall}>{installable?"安裝 App":"查看安裝方式"}</button></div>
 {account.user&&<details className="setting-group"><summary>修改密碼</summary><form onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage("");try{await account.password(current,next);setCurrent("");setNext("");onLogin();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}><label className="field">目前密碼<input type="password" autoComplete="current-password" required value={current} onChange={e=>setCurrent(e.target.value)}/></label><label className="field">新密碼<input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={next} onChange={e=>setNext(e.target.value)}/></label><p className="fine-print">修改後，所有裝置的工作階段會撤銷，請重新登入。</p><button className="secondary-action" disabled={busy}>更新密碼並登出所有裝置</button></form></details>}
 </section>;
}
