import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CATEGORIES, type Need } from "../shared/need.ts";
import { TAGS, PREFS } from "../shared/records.ts";
const number=(value:string)=>value===""?null:Number(value);
const tags=(value:string)=>value.split(/[、,，]/).map(v=>v.trim()).filter(Boolean);
function DelimitedInput({values,onChange,maxLength,list,placeholder}:{values:string[];onChange:(values:string[])=>void;maxLength:number;list?:string;placeholder?:string}){
 const [draft,setDraft]=useState(values.join("、"));
 const signature=values.join("\u0000");
 useEffect(()=>{if(tags(draft).join("\u0000")!==signature)setDraft(values.join("、"));},[signature]);
 return <input value={draft} maxLength={maxLength} list={list} placeholder={placeholder} onChange={e=>{setDraft(e.target.value);onChange(tags(e.target.value));}}/>;
}
export function NeedEditor({need,onChange}:{need:Need;onChange:(next:Need)=>void}){
 const set=<K extends keyof Need>(key:K,value:Need[K])=>onChange({...need,[key]:value});
 const extraCount=[need.max_distance_km!==null,need.max_minutes!==null,need.registration_ok!==null,Boolean(need.eligibility_notes)].filter(Boolean).length+need.exclude_tags.length+need.soft_preferences.length;
 return <div className="need-editor">
  <label className="field full">生活需求<input value={need.need} maxLength={500} onChange={e=>set("need",e.target.value)} placeholder="例如：晚餐、交通、免費活動"/></label>
  <fieldset className="tag-picker"><legend>優先查看類別（仍搜尋全部五類）</legend><div>{CATEGORIES.map(c=><button type="button" key={c} aria-pressed={need.target_categories.includes(c)} className={need.target_categories.includes(c)?"active":""} onClick={()=>set("target_categories",need.target_categories.includes(c)?need.target_categories.filter(v=>v!==c):[...need.target_categories,c])}>{c}</button>)}</div></fieldset>
  <div className="field-grid">
   <label className="field">總預算 TWD<input aria-label="總預算 TWD" type="number" min="0" max="100000000" value={need.budget_total_twd??""} onChange={e=>set("budget_total_twd",number(e.target.value))} placeholder="未指定"/></label>
   <label className="field">人數／份數<input type="number" min="1" max="1000" value={need.people_or_servings??""} onChange={e=>set("people_or_servings",number(e.target.value))} placeholder="未指定"/></label>
   <label className="field">日期<input type="date" value={need.date??""} onChange={e=>set("date",e.target.value||null)}/></label>
   <label className="field">時段<input maxLength={200} value={need.time_window??""} onChange={e=>set("time_window",e.target.value||null)} placeholder="未指定"/></label>
  </div>
  <label className="check-row"><input type="checkbox" checked={need.free_only} onChange={e=>set("free_only",e.target.checked)}/>只看總可比成本為零</label>
  <details className="detail-disclosure need-extra"><summary><span>更多條件</span><small>{extraCount?`${extraCount} 項已設定`:"距離、偏好、資格"}</small><ChevronDown aria-hidden="true"/></summary><div className="disclosure-body"><div className="field-grid">
   <label className="field">最大距離 km<input type="number" min="0" max="1000" step="0.1" value={need.max_distance_km??""} onChange={e=>set("max_distance_km",number(e.target.value))} placeholder="未指定"/></label>
   <label className="field">步行估算上限（分）<input type="number" min="0" max="10000" value={need.max_minutes??""} onChange={e=>set("max_minutes",number(e.target.value))} placeholder="未指定"/></label>
  </div>
  <label className="field">接受事先登記<select value={need.registration_ok===null?"unknown":String(need.registration_ok)} onChange={e=>set("registration_ok",e.target.value==="unknown"?null:e.target.value==="true")}><option value="unknown">未指定</option><option value="true">可以登記</option><option value="false">不要事先登記</option></select></label>
  <fieldset className="tag-picker"><legend>排除成分／標籤</legend><div>{TAGS.map(t=><button type="button" key={t} aria-pressed={need.exclude_tags.includes(t)} className={need.exclude_tags.includes(t)?"active":""} onClick={()=>set("exclude_tags",need.exclude_tags.includes(t)?need.exclude_tags.filter(v=>v!==t):[...need.exclude_tags,t])}>{t}</button>)}</div></fieldset>
  <label className="field">其他排除（逗號分隔）<DelimitedInput maxLength={400} values={need.exclude_tags.filter(t=>!(TAGS as readonly string[]).includes(t))} onChange={values=>set("exclude_tags",[...need.exclude_tags.filter(t=>(TAGS as readonly string[]).includes(t)),...values])} placeholder="例如：堅果（資料未完整標示）"/></label>
  <label className="field">軟偏好（逗號分隔）<DelimitedInput maxLength={1000} values={need.soft_preferences} onChange={values=>set("soft_preferences",values)} list="pref-options"/><datalist id="pref-options">{PREFS.map(p=><option key={p} value={p}/>)}</datalist></label>
  <label className="field">資格說明<input maxLength={500} value={need.eligibility_notes??""} onChange={e=>set("eligibility_notes",e.target.value||null)} placeholder="未指定"/></label>
  </div></details>
  {need.unresolved.length>0&&<aside className="notice warning"><b>尚未解析，請自行確認</b><p>{need.unresolved.join("、")}</p><button className="text-button" type="button" onClick={()=>set("unresolved",[])}>已了解並完成手動確認</button></aside>}
  <details className="detail-disclosure"><summary><span>篩選說明</span><ChevronDown aria-hidden="true"/></summary><div className="disclosure-body"><p className="detail-explanation">空白表示未知，並非 0。已知不符條件者排除，缺少份量、日期、時段、資格或成分證據者待確認，不列入主要推薦；有過敏需求請向提供者確認。</p></div></details>
 </div>;
}
