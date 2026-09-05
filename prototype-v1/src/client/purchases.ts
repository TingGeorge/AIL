import { currentAccountMonth, type AccountData } from "../shared/account.ts";
import { comparableTotal, isDemoRecord, passesGate, type Rec } from "../shared/records.ts";

export function canMarkBought(record: Rec, now = new Date()): boolean {
  const total = comparableTotal(record);
  return !isDemoRecord(record) && passesGate(record, now.getTime()) && total !== null && Number.isSafeInteger(total) && total >= 0;
}
// This is an explicit user declaration, not a payment, checkout, or transaction history.
export function markBought(data: AccountData, record: Rec, now = new Date()): AccountData {
  if (!data.list.includes(record.id)) throw new Error("這筆選項已不在清單中，不會重複累計。");
  if (!canMarkBought(record, now)) throw new Error("示範、過期或成本未知的資料不可標記已買，請在設定自行填寫支出。");
  const month = currentAccountMonth(now);
  const spent = (data.settings.spent_month === month ? data.settings.spent : 0) + comparableTotal(record)!;
  if (spent > 100_000_000) throw new Error("已超過支出可記錄範圍，請先檢查設定。");
  return { ...data, list: data.list.filter(id => id !== record.id), settings: { ...data.settings, spent, spent_month: month } };
}
