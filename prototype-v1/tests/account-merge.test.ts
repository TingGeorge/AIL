import { expect, test } from "bun:test";
import { defaultAccountData } from "../src/shared/account.ts";
import { mergeAccountChanges } from "../src/shared/account-merge.ts";

test("a stale settings draft preserves a remote favorite and unchanged settings", () => {
  const base = defaultAccountData();
  const local = structuredClone(base); local.settings.monthly_budget = 900;
  const remote = structuredClone(base); remote.favs = ["f_m037"]; remote.settings.spent = 200; remote.revision = 1;
  const merged = mergeAccountChanges(base, local, remote);
  expect(merged.favs).toEqual(["f_m037"]);
  expect(merged.settings).toMatchObject({ monthly_budget: 900, spent: 200 });
  expect(merged.revision).toBe(1);
});

test("same-field conflict is explicit and uncertain successful retry is idempotent", () => {
  const base = defaultAccountData();
  const local = structuredClone(base); local.settings.monthly_budget = 900;
  const remote = structuredClone(base); remote.settings.monthly_budget = 800;
  expect(() => mergeAccountChanges(base, local, remote)).toThrow("尚未覆蓋");
  expect(mergeAccountChanges(base, local, local).settings.monthly_budget).toBe(900);
});

test("two different purchases with identical prices cannot silently undercount spending", () => {
  const base = defaultAccountData(); base.list = ["a", "b"];
  const local = structuredClone(base); local.list = ["b"]; local.settings.spent = 100;
  const remote = structuredClone(base); remote.list = ["a"]; remote.settings.spent = 100;
  expect(() => mergeAccountChanges(base, local, remote)).toThrow("支出");
  expect(mergeAccountChanges(base, local, local).settings.spent).toBe(100);
});

// 頭像顏色在點選當下就送出，設定表單的 draft 仍是舊顏色；儲存設定不可以把顏色改回去。
test("a settings save with a stale draft colour keeps the colour applied on click", () => {
  const base = defaultAccountData("使用者");
  const local = structuredClone(base); local.profile.nickname = "新暱稱";
  const remote = structuredClone(base); remote.profile.color = "#ff4b3e"; remote.revision = 1;
  const merged = mergeAccountChanges(base, local, remote);
  expect(merged.profile).toEqual({ nickname: "新暱稱", color: "#ff4b3e" });
});
