import { expect, test } from "bun:test";
import { EMPTY_NEED } from "../src/shared/need.ts";
import { filterStage, rowToRec } from "../src/shared/records.ts";
const food = (id: string, title: string) => ({ ...rowToRec({id, title, category:"食品", data_status:"已驗證",price_total_twd:130,mandatory_fees_twd:0}), tags:null });
test("known beef is excluded and unlabelled ingredients are pending, never main", () => {
  const beef=food("beef", "元氣牛肉蛋堡 ×2"), unknown=food("unknown", "杏鮑菇堡 ×2");
  const result=filterStage([beef,unknown],{...EMPTY_NEED,exclude_tags:["牛"]},["牛"],false);
  expect(result.main).toHaveLength(0);
  expect(result.excluded.map(r=>r.id)).toEqual(["beef"]);
  expect(result.pending.map(r=>r.id)).toEqual(["unknown"]);
  expect(unknown.data_status).toBe("已驗證");
});
test("dinner does not inherit a store's 24H opening when product is breakfast only", () => {
  const breakfast={...food("breakfast","雙人漢堡"),availability_or_event_time:"官方元氣早餐頁：05:00–10:30；門市：24H"};
  const allDay={...food("allDay","全天漢堡"),availability_or_event_time:"全天供應；門市：24H"};
  const result=filterStage([breakfast,allDay],{...EMPTY_NEED,need:"晚餐",time_window:"18:00–20:00"},[],false);
  expect(result.excluded.map(r=>r.id)).toEqual(["breakfast"]);
  expect(result.main.map(r=>r.id)).toEqual(["allDay"]);
  expect(result.excluded_by.time).toBe(1);
});
test("a fixed two-serving price cannot feed three; unknown portions remain pending", () => {
  const two={...food("two","雙人餐"),quantity_or_servings:"2個漢堡；每人各1個"};
  const unknown=food("unknown","點心");
  const result=filterStage([two,unknown],{...EMPTY_NEED,people_or_servings:3},[],false);
  expect(result.main).toHaveLength(0);
  expect(result.excluded.map(r=>r.id)).toEqual(["two"]);
  expect(result.pending.map(r=>r.id)).toEqual(["unknown"]);
  expect(two.price_total_twd).toBe(130);
});
test("event dates and eligibility are strict without confusing food exclusions with transit", () => {
  const event={...food("event","市集"),category:"活動" as const,availability_or_event_time:"2026-09-12至2026-09-13，10:00–18:00"};
  const uncertain={...food("uncertain","服務"),category:"免費／公益資源" as const,eligibility:["須具低收入戶資格"]};
  const result=filterStage([event,uncertain],{...EMPTY_NEED,date:"2026-09-05"},[],false);
  expect(result.excluded.map(r=>r.id)).toEqual(["event"]);
  expect(result.pending.map(r=>r.id)).toEqual(["uncertain"]);
  const transit={...food("transit","單程票"),category:"交通" as const};
  expect(filterStage([transit],{...EMPTY_NEED,exclude_tags:["牛"]},["牛"],false).main).toHaveLength(1);
});
