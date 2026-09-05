import { currentAccountMonth, type AccountSettings } from "../shared/account.ts";
import type { Need } from "../shared/need.ts";
export function applyBudgetDefault(need:Need, settings:AccountSettings, now=new Date()){
 const fromSettings=need.budget_total_twd===null && settings.monthly_budget!==null;
 const spent=settings.spent_month===currentAccountMonth(now)?settings.spent:0;
 return {need:fromSettings?{...need,budget_total_twd:Math.max(0,settings.monthly_budget!-spent)}:need,fromSettings};
}
