import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailView, ResultsView } from "../src/client/ResultsView.tsx";
import type { Rec } from "../src/shared/records.ts";

const rec = (overrides: Partial<Rec> = {}): Rec => ({
  id: "r1",
  category: "食品",
  title: "後端第一",
  provider: "來源店家",
  price_total_twd: 300,
  mandatory_fees_twd: 0,
  discount_twd: 0,
  price_unit: null,
  quantity_or_servings: null,
  eligibility: [],
  registration_required: false,
  availability_or_event_time: null,
  distance_or_time_text: null,
  address: null,
  lat: null,
  lng: null,
  valid_until: null,
  source_url: "https://example.com/source",
  source_type: "curated",
  source_authority: "official",
  evidence: [],
  collected_at: "2026-09-05T08:00:00+08:00",
  verified_at: "2026-09-05T09:00:00+08:00",
  data_status: "已驗證",
  agent: "paid",
  action_label: null,
  action_url: null,
  extra: {},
  baseline: null,
  tags: null,
  group_offer: null,
  distance_km: null,
  reason: null,
  ...overrides,
});

test("ResultsView：五個後端類別都出現，推薦順序保留伺服器陣列順序", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records: [
      rec({ id: "expensive-first", title: "後端第一", price_total_twd: 300 }),
      rec({ id: "cheap-second", title: "後端第二", price_total_twd: 50 }),
    ],
    pending: [],
    excluded: [],
    favs: [],
    onOpen: () => {},
    onFavorite: () => {},
    onAdjust: () => {},
    survival: false,
  }));

  for (const category of ["食品", "日用品", "免費／公益資源", "活動", "交通"]) {
    expect(html).toContain(category);
  }
  expect(html).toContain("推薦順序");
  expect(html.indexOf("後端第一")).toBeLessThan(html.indexOf("後端第二"));
  expect(html).toContain("通過資料閘門與可檢查條件");
  expect(html).toContain("文字資格仍需依來源逐項確認");
  expect(html).toContain("未提供推薦理由");
  expect(html).not.toContain("可行選擇");
  expect(html).not.toContain("CP");
});

test("DetailView：誠實顯示空值、封鎖非 http(s) 連結並使用真實團購碼", () => {
  const item = rec({
    price_total_twd: null,
    source_url: "javascript:alert(1)",
    action_url: "file:///tmp/not-safe",
    group_offer: {
      min_people: 4,
      discount_pct: 10,
      redeem_code: "SHOP-REAL-42",
      note: "結帳時輸入",
    },
  });
  const html = renderToStaticMarkup(createElement(DetailView, {
    item,
    favorite: false,
    listed: false,
    onFavorite: () => {},
    onList: () => {},
    onReport: () => {},
  }));

  expect(html).toContain("價格＋必要費用－明確折扣");
  expect(html).toContain("來源未提供逐欄證據摘錄");
  expect(html).toContain("來源未明示");
  expect(html).toContain("SHOP-REAL-42");
  expect(html).toContain("滿 4 人適用");
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("file:///");
  expect(html).not.toContain("已加入 3 人");
});


test("DetailView：百分比團購只折本筆可比成本，人數僅判斷門檻", () => {
  const html = renderToStaticMarkup(createElement(DetailView, {
    item: rec({
      group_offer: {
        min_people: 4,
        discount_pct: 10,
        redeem_code: "TEN-OFF",
        note: "滿門檻後結帳折抵",
      },
    }),
    favorite: false,
    listed: false,
    onFavorite: () => {},
    onList: () => {},
    onReport: () => {},
  }));

  expect(html).toContain("本筆折後可比成本 NT$270");
  expect(html).toContain("人數只用於判斷門檻");
  expect(html).toContain("來源折扣 10%");
  expect(html).not.toContain("每人");
  expect(html).not.toContain("人均");
});

test("DetailView：來源每人價乘以試算人數並明示每人價格", () => {
  const html = renderToStaticMarkup(createElement(DetailView, {
    item: rec({
      group_offer: {
        min_people: 4,
        price_per_person: 85,
        redeem_code: "GROUP-85",
        note: "四人起適用",
      },
    }),
    favorite: false,
    listed: false,
    onFavorite: () => {},
    onList: () => {},
    onReport: () => {},
  }));

  expect(html).toContain("方案總額 NT$340");
  expect(html).toContain("每人 NT$85");
  expect(html).toContain("來源每人價 NT$85");
});

test("DetailView：原始可比成本為空時不以每人價虛構方案總額", () => {
  const html = renderToStaticMarkup(createElement(DetailView, {
    item: rec({
      price_total_twd: null,
      group_offer: {
        min_people: 4,
        price_per_person: 85,
        redeem_code: "GROUP-UNKNOWN",
        note: "需向來源確認原價",
      },
    }),
    favorite: false,
    listed: false,
    onFavorite: () => {},
    onList: () => {},
    onReport: () => {},
  }));

  expect(html).toContain("原始可比成本未提供，依比較規則不計算方案總額");
  expect(html).not.toContain("方案總額 NT$340");
});

test("ResultsView：只依 isDemoRecord 將樣本狀態改標為示範測試資料", () => {
  const sampleHtml = renderToStaticMarkup(createElement(ResultsView, {
    records: [rec({
      provider: "示範 圓山便當房",
      source_url: "https://example.com/ail-demo/bento-house",
    })],
    pending: [],
    excluded: [],
    favs: [],
    onOpen: () => {},
    onFavorite: () => {},
    onAdjust: () => {},
    survival: false,
  }));
  const ordinaryHtml = renderToStaticMarkup(createElement(ResultsView, {
    records: [rec({
      provider: "名稱含示範但非 helper 樣本",
      source_url: "https://merchant.test/listing",
    })],
    pending: [],
    excluded: [],
    favs: [],
    onOpen: () => {},
    onFavorite: () => {},
    onAdjust: () => {},
    survival: false,
  }));

  expect(sampleHtml).toContain("示範測試資料");
  expect(sampleHtml).not.toContain("已驗證");
  expect(ordinaryHtml).toContain("已驗證");
  expect(ordinaryHtml).not.toContain("示範測試資料");
});

test("DetailView：樣本有醒目警告並隱藏地圖、購買行動與優惠分享", () => {
  const html = renderToStaticMarkup(createElement(DetailView, {
    item: rec({
      provider: "示範 圓山便當房",
      source_url: "https://example.com/ail-demo/bento-house",
      action_url: "https://example.com/ail-demo/bento-house/order",
      action_label: "立即購買",
      address: "臺北市測試路 1 號",
      lat: 25.07,
      lng: 121.52,
      group_offer: {
        min_people: 4,
        discount_pct: 10,
        redeem_code: "DEMO-ONLY",
        note: "示範優惠",
      },
      evidence: [{
        field: "價格",
        quote: "此為測試價格。",
        url: "https://example.com/ail-demo/bento-house",
        checked_at: "2026-09-05T09:00:00+08:00",
      }],
    }),
    favorite: false,
    listed: false,
    onFavorite: () => {},
    onList: () => {},
    onReport: () => {},
  }));

  expect(html).toContain("示範測試資料");
  expect(html).toContain("不可據此購買/前往；價格、地址、優惠皆測試資料");
  expect(html).toContain("示範來源頁");
  expect(html).toContain("example.com 示範頁僅用來測試來源連結");
  expect(html).toContain("測試兌換碼（不可使用）");
  expect(html).toContain("示範碼不可用於購買");
  expect(html).toContain("加入測試清單");
  expect(html).not.toContain("已驗證");
  expect(html).not.toContain("google.com/maps");
  expect(html).not.toContain("立即購買");
  expect(html).not.toContain("/bento-house/order");
});

test("DetailView：非樣本仍保留真實狀態與安全地圖、行動連結", () => {
  const html = renderToStaticMarkup(createElement(DetailView, {
    item: rec({
      source_url: "https://merchant.test/listing",
      action_url: "https://merchant.test/order",
      action_label: "查看方案",
      address: "臺北市中山北路 1 號",
      lat: 25.07,
      lng: 121.52,
    }),
    favorite: false,
    listed: false,
    onFavorite: () => {},
    onList: () => {},
    onReport: () => {},
  }));

  expect(html).toContain("已驗證");
  expect(html).toContain("位置／地圖");
  expect(html).toContain("google.com/maps/search");
  expect(html).toContain("查看方案");
  expect(html).toContain("merchant.test/order");
  expect(html).not.toContain("示範測試資料");
  expect(html).not.toContain("不可據此購買/前往");
});
