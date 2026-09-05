import type { AccountData } from "./account.ts";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export class AccountConflict extends Error {
  constructor(field: string) { super(`其他裝置也修改了「${field}」。尚未覆蓋；請重新載入帳號資料後確認。`); }
}
const field = <T>(name: string, base: T, local: T, remote: T): T => {
  if (same(base, local)) return remote;
  if (same(base, remote) || same(local, remote)) return local;
  throw new AccountConflict(name);
};
const ids = (base: string[], local: string[], remote: string[]) =>
  [...new Set([...remote.filter(id => !base.includes(id) || local.includes(id)), ...local.filter(id => !base.includes(id))])];

// Apply the user's actual edits, not a stale full settings draft or a replayed toggle.
export function mergeAccountChanges(base: AccountData, local: AccountData, remote: AccountData): AccountData {
  const spendingChanged = (value: AccountData) => value.settings.spent !== base.settings.spent || value.settings.spent_month !== base.settings.spent_month;
  const removed = (value: AccountData) => base.list.filter(id => !value.list.includes(id)).sort();
  if (spendingChanged(local) && spendingChanged(remote) && !same(removed(local), removed(remote))) {
    throw new AccountConflict("支出／標記已買");
  }
  const settings = { ...remote.settings };
  for (const key of Object.keys(settings) as (keyof typeof settings)[]) {
    Object.assign(settings, { [key]: field(key, base.settings[key], local.settings[key], remote.settings[key]) });
  }
  return {
    ...remote,
    list: ids(base.list, local.list, remote.list),
    favs: ids(base.favs, local.favs, remote.favs),
    settings,
    profile: {
      nickname: field("顯示名稱", base.profile.nickname, local.profile.nickname, remote.profile.nickname),
      color: field("頭像顏色", base.profile.color, local.profile.color, remote.profile.color),
    },
  };
}
