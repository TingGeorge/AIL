import { test, expect } from "bun:test";
import { defaultAccountData } from "../src/shared/account.ts";
import { rowToRec, type Rec } from "../src/shared/records.ts";
import { canMarkBought, markBought } from "../src/client/purchases.ts";
const now = new Date("2026-09-05T12:00:00+08:00");
const rec = (change: Partial<Rec> = {}): Rec => ({ ...rowToRec({id:"food1",source_url:"https://merchant.test/item",extra:{}}), data_status:"已驗證", price_total_twd:100,mandatory_fees_twd:10,discount_twd:5,valid_until:null,...change });
const data = () => ({...defaultAccountData("測試",now),list:["food1","food2"]});
test("mark bought removes one list item and adds actual comparable cost, not a synthetic payment",()=>{
 const before=data();const result=markBought(before,rec(),now);
 expect(result.list).toEqual(["food2"]);expect(result.settings.spent).toBe(105);expect(before.list).toHaveLength(2);
 expect(()=>markBought(result,rec(),now)).toThrow("重複");
});
test("mark bought resets previous month before accumulating",()=>{
 const before=data();before.settings.spent=500;before.settings.spent_month="2026-08";
 expect(markBought(before,rec(),now).settings).toMatchObject({spent:105,spent_month:"2026-09"});
});
test("demo records, unknown costs, expired and negative costs cannot be marked purchased",()=>{
 for(const item of [rec({source_url:"https://example.com/ail-demo/foo"}),rec({extra:{demo:true}}),rec({price_total_twd:null}),rec({valid_until:"2026-09-04T00:00:00Z"}),rec({price_total_twd:-100}),rec({data_status:"部分驗證／待確認"})]){
  expect(canMarkBought(item,now)).toBe(false);expect(()=>markBought(data(),item,now)).toThrow();
 }
});
test("zero cost is valid and spent overflow is rejected",()=>{
 expect(markBought(data(),rec({price_total_twd:0,mandatory_fees_twd:0,discount_twd:0}),now).settings.spent).toBe(0);
 const before=data();before.settings.spent=100_000_000;expect(()=>markBought(before,rec(),now)).toThrow("範圍");
});
