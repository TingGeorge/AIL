import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CatalogNotice } from "../src/client/CatalogNotice.tsx";
import { DetailView, ResultsView } from "../src/client/ResultsView.tsx";
import type { CatalogSummary } from "../src/shared/catalog.ts";
import type { Rec } from "../src/shared/records.ts";

const summary: CatalogSummary = {
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

const rec = (overrides: Partial<Rec> = {}): Rec => ({
  id: "r1",
  category: "食品",
  title: "線上配送單人票",
  provider: "來源店家",
  price_total_twd: 150,
  mandatory_fees_twd: 0,
  discount_twd: 0,
  price_unit: "每人一張",
  quantity_or_servings: "1 人",
  eligibility: ["限會員本人使用"],
  registration_required: false,
  availability_or_event_time: "預約後配送",
  distance_or_time_text: null,
  address: null,
  lat: null,
  lng: null,
  valid_until: null,
  source_url: "https://merchant.test/source",
  source_type: "web-searched",
  source_authority: "provider",
  evidence: [],
  collected_at: "2026-09-05T08:00:00+08:00",
  verified_at: "2026-09-05T09:00:00+08:00",
  data_status: "已驗證",
  agent: "paid",
  action_label: null,
  action_url: null,
  extra: {
    scope: "僅配送臺北市指定行政區",
    pricing_context: "此價格為單人票，不是兩人合計",
    review_notes: ["運費另計，偏遠地區不配送", "資格需於結帳時再次核對"],
  },
  baseline: null,
  tags: null,
  group_offer: null,
  distance_km: null,
  reason: null,
  ...overrides,
});

const viewProps = {
  pending: [],
  excluded: [],
  favs: [],
  onOpen: () => {},
  onFavorite: () => {},
  onAdjust: () => {},
  survival: false,
};

const detailProps = {
  favorite: false,
  listed: false,
  onFavorite: () => {},
  onList: () => {},
  onReport: () => {},
};

test("CatalogNotice：顯示五類真實資料覆蓋、確認時間與資料快照限制", () => {
  const html = renderToStaticMarkup(<CatalogNotice initialSummary={summary} />);

  expect(html).toContain("27 筆真實資料");
  expect(html).toContain("31 筆總收錄");
  expect(html).toContain("18 可排序");
  expect(html).toContain("9 待確認");
  expect(html).toContain("4 筆示範資料");
  expect(html).toContain("臺北市公開網頁與提供者公告");
  for (const row of summary.categories) {
    expect(html).toContain(row.category);
    expect(html).toContain(`${row.total} 筆`);
    expect(html).toContain(`${row.rankable} 可排序`);
    expect(html).toContain(`${row.pending} 待確認`);
  }
  expect(html).toContain("公開網頁資料快照");
  expect(html).toContain("不代表即時庫存、名額或費率保證");
  expect(html).toContain("不需要 LLM API key");
  expect(html).toContain("2026");
});

test("CatalogNotice：零筆資料仍正常顯示五類零值與未知確認時間", () => {
  const html = renderToStaticMarkup(<CatalogNotice initialSummary={{
    total: 0,
    rankable: 0,
    pending: 0,
    demonstration: 0,
    latest_verified_at: null,
    scope: "目前匯入範圍",
    categories: [],
  }} />);

  expect(html).toContain("目前尚無可顯示的資料");
  expect(html).toContain("尚無已確認資料時間");
  for (const category of ["食品", "日用品", "免費／公益資源", "活動", "交通"]) {
    expect(html).toContain(category);
  }
  expect((html.match(/0 筆/g) ?? []).length).toBeGreaterThanOrEqual(5);
});

test("ResultsView 與 DetailView：安全顯示計價份量、資格、範圍、價格脈絡與審閱提醒", () => {
  const item = rec({
    extra: {
      scope: "僅配送臺北市指定行政區",
      pricing_context: "此價格為單人票，不是兩人合計",
      review_notes: ["運費另計，偏遠地區不配送", "<script>不可執行</script>"],
    },
  });
  const resultsHtml = renderToStaticMarkup(createElement(ResultsView, { records: [item], ...viewProps }));
  const detailHtml = renderToStaticMarkup(createElement(DetailView, { item, ...detailProps }));

  for (const html of [resultsHtml, detailHtml]) {
    expect(html).toContain("計價：每人一張");
    expect(html).toContain("份量：1 人");
    expect(html).toContain("資格：限會員本人使用");
    expect(html).toContain("僅配送臺北市指定行政區");
    expect(html).toContain("此價格為單人票，不是兩人合計");
    expect(html).toContain("運費另計，偏遠地區不配送");

    expect(html).not.toContain("<script>不可執行</script>");
    expect(html).toContain("不同計價單位／份量");
  }
});

test("ResultsView 摘要提醒，DetailView 保留全部並安全轉義", () => {
  const item = rec({ extra: { review_notes: ["必要條件", "<script>不可執行</script>"] } });
  const results = renderToStaticMarkup(createElement(ResultsView, { records: [item], ...viewProps }));
  const detail = renderToStaticMarkup(createElement(DetailView, { item, ...detailProps }));
  expect(results).toContain("另有 1 項提醒");
  expect(detail).toContain("&lt;script&gt;不可執行&lt;/script&gt;");
  expect(detail).not.toContain("<script>不可執行</script>");
});

test("ResultsView：review_notes 單一字串會原樣安全顯示", () => {
  const item = rec({ extra: { review_notes: "運費以結帳頁顯示為準" } });
  const html = renderToStaticMarkup(createElement(ResultsView, { records: [item], ...viewProps }));

  expect(html).toContain("審閱提醒");
  expect(html).toContain("運費以結帳頁顯示為準");
});

test("ResultsView 與 DetailView：沒有 extra 文字時不捏造審閱內容，未知必要費用不當成零", () => {
  const item = rec({
    mandatory_fees_twd: null,
    eligibility: [],
    extra: { review_notes: [], scope: 7, pricing_context: null },
  });
  const resultsHtml = renderToStaticMarkup(createElement(ResultsView, { records: [item], ...viewProps }));
  const detailHtml = renderToStaticMarkup(createElement(DetailView, { item, ...detailProps }));

  for (const html of [resultsHtml, detailHtml]) {
    expect(html).not.toContain("審閱提醒");
    expect(html).not.toContain("適用範圍");
    expect(html).not.toContain("價格脈絡");
  }
  expect(resultsHtml).toContain("總成本不可比較");
  expect(detailHtml).toContain("未知，總成本不可比較");
});
