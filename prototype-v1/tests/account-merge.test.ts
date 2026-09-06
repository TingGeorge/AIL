import { expect, test } from "bun:test";
import { defaultAccountData } from "../src/shared/account.ts";
import { mergeAccountChanges, mergeGuestCollections } from "../src/shared/account-merge.ts";

test("guest collections union into the account without replacing account settings", () => {
  const guest = defaultAccountData("訪客");
  guest.list = ["f_guest", "f_shared"];
  guest.favs = ["a_guest"];
  guest.settings.monthly_budget = 500;
  const remote = defaultAccountData("帳號");
  remote.list = ["f_remote", "f_shared"];
  remote.favs = ["a_remote"];
  remote.settings.monthly_budget = 1200;
  remote.revision = 7;

  const merged = mergeGuestCollections(guest, remote);
  expect(merged.list).toEqual(["f_remote", "f_shared", "f_guest"]);
  expect(merged.favs).toEqual(["a_remote", "a_guest"]);
  expect(merged.settings.monthly_budget).toBe(1200);
  expect(merged.revision).toBe(7);
});

test("guest collection merge reports the 200 item limit instead of dropping saved items", () => {
  const guest = defaultAccountData("訪客");
  guest.list = ["guest_item"];
  const remote = defaultAccountData("帳號");
  remote.list = Array.from({ length: 200 }, (_, index) => `remote_${index}`);

  expect(() => mergeGuestCollections(guest, remote)).toThrow("清單合併後超過 200 筆");
});

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
