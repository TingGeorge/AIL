import { test,expect } from "bun:test";
import { defaultAccountSettings } from "../src/shared/account.ts";
import { EMPTY_NEED } from "../src/shared/need.ts";
import { applyBudgetDefault } from "../src/client/need-defaults.ts";
const now=new Date("2026-09-05T12:00:00+08:00");
const settings={...defaultAccountSettings(now),monthly_budget:8000,spent:1200};
test("budget defaults use current-month remaining balance and preserve explicit zero",()=>{
 expect(applyBudgetDefault(EMPTY_NEED,settings,now)).toMatchObject({need:{budget_total_twd:6800},fromSettings:true});
 expect(applyBudgetDefault({...EMPTY_NEED,budget_total_twd:0},settings,now)).toMatchObject({need:{budget_total_twd:0},fromSettings:false});
});
test("budget default handles unknown, overspent and previous month without inventing negative budget",()=>{
 expect(applyBudgetDefault(EMPTY_NEED,{...settings,monthly_budget:null},now).fromSettings).toBe(false);
 expect(applyBudgetDefault(EMPTY_NEED,{...settings,spent:9000},now).need.budget_total_twd).toBe(0);
 expect(applyBudgetDefault(EMPTY_NEED,{...settings,spent_month:"2026-08"},now).need.budget_total_twd).toBe(8000);
});
