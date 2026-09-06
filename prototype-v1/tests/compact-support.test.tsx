import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountView, SettingsView } from "../src/client/AccountView.tsx";
import { CatalogNotice } from "../src/client/CatalogNotice.tsx";
import { defaultAccountData, type User } from "../src/shared/account.ts";
import type { CatalogSummary } from "../src/shared/catalog.ts";

type Account = Parameters<typeof AccountView>[0]["account"];

function mockAccount(user: User | null = null): Account {
  const data = defaultAccountData(user?.nickname ?? "訪客", new Date("2026-09-05T00:00:00+08:00"));
  return {
    token: user ? "session-token" : null,
    user,
    data,
    restoring: false,
    saving: false,
    error: "",
    setError: () => {},
    authenticate: async () => {},
    update: async (transform) => { transform(data); },
    reloadCount: 0,
    reload: async () => {},
    signOut: async () => {},
    password: async () => {},
    clear: () => {},
    reject: () => {},
  };
}

const catalog: CatalogSummary = {
  total: 31,
  rankable: 18,
  pending: 9,
  demonstration: 4,
  latest_verified_at: "2026-09-05T10:30:00+08:00",
  scope: "臺北市公開網頁與提供者公告",
  categories: [
    { category: "食品", total: 10, rankable: 7, pending: 2 },
    { category: "日用品", total: 6, rankable: 3, pending: 2 },
    { category: "免費／公益資源", total: 5, rankable: 4, pending: 1 },
    { category: "活動", total: 7, rankable: 3, pending: 3 },
    { category: "交通", total: 3, rankable: 1, pending: 1 },
  ],
};

test("compact catalog keeps one short summary visible and full truthful metadata in a closed disclosure", () => {
  const html = renderToStaticMarkup(<CatalogNotice initialSummary={catalog} />);
  const disclosureAt = html.indexOf("<details");

  expect(html).toContain("27 筆已收錄資料");
  expect(html).toContain("臺北市公開網頁與提供者公告 · 使用前再確認");
  expect(html).toContain("資料涵蓋範圍與五類統計");
  expect(disclosureAt).toBeGreaterThan(0);
  expect(html.indexOf("27 筆已收錄資料")).toBeLessThan(disclosureAt);
  expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);

  expect(html.indexOf("31 筆已收錄")).toBeGreaterThan(disclosureAt);
  expect(html.indexOf("18 可比較")).toBeGreaterThan(disclosureAt);
  expect(html.indexOf("9 需要再確認")).toBeGreaterThan(disclosureAt);
  expect(html.indexOf("4 筆示範資料")).toBeGreaterThan(disclosureAt);
  expect(html.indexOf("目前顯示的是已整理的公開資料，不是即時網路搜尋；價格、名額與服務狀態請以來源最新資訊為準。")).toBeGreaterThan(disclosureAt);
  expect(html).not.toMatch(/LLM|API key|Gemini|PostgreSQL/);
  for (const row of catalog.categories) expect(html.indexOf(row.category)).toBeGreaterThan(disclosureAt);
});

test("account explains browser guest saves and keeps all login inputs", () => {
  const html = renderToStaticMarkup(<AccountView account={mockAccount()} onDone={() => {}} supportEmail="help@example.test" />);

  expect(html).toContain("不登入也能搜尋並保存在此瀏覽器；登入後可跨裝置同步。");
  expect(html).not.toContain("儲存方式");
  expect(html).not.toContain("不會自動合併");
  expect(html).toContain("訪客清單與設定保留在此瀏覽器；登入時只聯集合併清單與收藏。");
  expect(html).toContain("登入憑證只保留在本分頁，預設 30 分鐘逾時。");
  expect(html).toContain("本裝置 + 本分頁");
  expect(html).toContain("autoComplete=\"username\"");
  expect(html).toContain("autoComplete=\"current-password\"");
  expect(html).toContain("mailto:help@example.test");
  expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
});

test("settings preserves every control and moves long caveats into closed disclosures", () => {
  const html = renderToStaticMarkup(<SettingsView account={mockAccount()} onLogin={() => {}} onInstall={() => {}} installable={false} />);

  expect((html.match(/<input/g) ?? []).length).toBe(3);
  expect((html.match(/type=\"number\"/g) ?? []).length).toBe(2);
  expect((html.match(/type=\"checkbox\"/g) ?? []).length).toBe(1);
  expect(html).toContain("匿名設定與清單會保留在此瀏覽器。");
  expect(html).not.toContain("設定儲存方式");
  expect(html).not.toContain("登入後會取代");
  expect(html).not.toContain("登入後會取代");
  expect(html).toContain("省錢模式：優先顯示免費選項（仍可能有付費）");
  expect(html).not.toContain("Costco");
  expect(html).not.toContain("自行記錄，不是銀行付款紀錄。");
  expect(html).not.toContain("支出資料如何計算");
  expect(html).toContain("預設排除");
  expect(html).toContain("預設偏好");
  expect(html).toContain("登入並同步清單與收藏");
  expect(html).toContain("<h2 class=\"compact-pwa-title\">把 ALL IN LIFE 放到主畫面</h2>");
  expect(html).toContain("離線只能開啟介面；搜尋與帳號需要網路，恢復連線後即可繼續。");
  expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
});

test("signed-in settings keeps profile and password inputs plus the session-revocation warning", () => {
  const user: User = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    username: "tester",
    nickname: "測試者",
  };
  const html = renderToStaticMarkup(<SettingsView account={mockAccount(user)} onLogin={() => {}} onInstall={() => {}} installable />);

  expect(html).toContain("顯示名稱");
  expect(html).toContain("選擇頭像顏色");
  expect(html).toContain("autoComplete=\"current-password\"");
  expect(html).toContain("autoComplete=\"new-password\"");
  expect(html).toContain("修改後，所有裝置都會登出，請重新登入。");
  expect(html).toContain("會登出所有裝置");
  expect(html).not.toContain("登入後儲存清單與收藏");
});

test("compact support CSS retains accessible disclosure targets, focus and the save-to-login gap", async () => {
  const css = await Bun.file(new URL("../src/client/compact-support.css", import.meta.url)).text();

  expect(css).toContain("min-height: 44px");
  expect(css).toContain("summary:focus-visible");
  expect(css).toContain("overflow-wrap: anywhere");
  expect(css).toContain(".compact-settings > form + .secondary-action");
  expect(css).toContain("margin-top: 12px");
});


test("settings expose selected exclusions and preferences to assistive technology", () => {
  const account = mockAccount();
  account.data.settings.exclude = ["牛"];
  account.data.settings.prefs = ["可外帶"];
  const html = renderToStaticMarkup(<SettingsView account={account} onLogin={() => {}} onInstall={() => {}} installable={false} />);
  expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>牛肉<\/button>/);
  expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>可外帶<\/button>/);
  expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>豬肉<\/button>/);
});
