import type { Rec } from "./records.ts";
export type SearchWarning = {code:string;fields:string[];message:string};
export type SearchEvent =
 | {step:"filter";found:number;passed:number;pending:number;groups:{paid:number;free:number};excluded_by:Record<string,number>;warnings?:SearchWarning[]}
 | {agent:"paid"|"free";category:string;status:"ranking"}
 | {agent:"paid"|"free";category:string;status:"done"|"failed";records:Rec[];error?:string;warnings?:SearchWarning[]}
 | {step:"done";pending:Rec[];excluded:Rec[];warnings?:SearchWarning[]};
