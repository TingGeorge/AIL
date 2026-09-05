import { CATEGORIES } from "../shared/need.ts";
import type { Rec } from "../shared/records.ts";
import type { SearchEvent } from "./api.ts";
export type SearchState = {groups:Record<string,{agent:"paid"|"free";category:string;status:"ranking"|"done"|"failed";records:Rec[]}>;found:number;passed:number;pending:Rec[];excluded:Rec[];excludedBy:Record<string,number>;totalGroups:number;filtered:boolean;complete:boolean;warnings:string[]};
export const initialSearch = ():SearchState => ({groups:{},found:0,passed:0,pending:[],excluded:[],excludedBy:{},totalGroups:0,filtered:false,complete:false,warnings:[]});
export function reduceSearch(state:SearchState,event:SearchEvent):SearchState {
 if("step" in event){
  if(event.step==="filter")return {...state,filtered:true,found:event.found,passed:event.passed,totalGroups:event.groups.paid+event.groups.free,excludedBy:event.excluded_by,warnings:(event.warnings??[]).map(w=>w.message)};
  return {...state,complete:true,pending:event.pending,excluded:event.excluded,warnings:[...new Set([...state.warnings,...(event.warnings??[]).map(w=>w.message)])]};
 }
 const key=`${event.agent}:${event.category}`;
 return {...state,warnings:event.status==="failed"&&event.error?[...new Set([...state.warnings,`${event.category}：${event.error}`])]:state.warnings,groups:{...state.groups,[key]:{agent:event.agent,category:event.category,status:event.status,records:event.status==="ranking"?[]:event.records}}};
}
// Each category interleaves paid/free ranks. Arrival order never changes the final result order.
export function rankedRecords(state:SearchState,survival=false):Rec[]{
 const out:Rec[]=[];
 for(const category of CATEGORIES){
  const paid=state.groups[`paid:${category}`]?.records??[], free=state.groups[`free:${category}`]?.records??[];
  if(survival){out.push(...free,...paid);continue;}
  for(let i=0;i<Math.max(paid.length,free.length);i++){if(paid[i])out.push(paid[i]!);if(free[i])out.push(free[i]!);}
 }
 return out;
}
