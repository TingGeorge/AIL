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
  expect(html).not.toContain("未提供推薦理由");
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


test("ResultsView：目標類別優先顯示但五類全部保留", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records:[rec({id:"food"}),rec({id:"home",category:"日用品",title:"優先生活用品"})],
    pending:[],excluded:[],favs:[],survival:false,preferredCategories:["日用品","活動"],
    onOpen:()=>{},onFavorite:()=>{},onAdjust:()=>{},
  }));
  const tabs = html.match(/<nav class="category-tabs"[\s\S]*?<\/nav>/)?.[0] ?? "";
  expect(tabs.indexOf("日用品")).toBeLessThan(tabs.indexOf("活動"));
  expect(tabs.indexOf("活動")).toBeLessThan(tabs.indexOf("食品"));
  expect(tabs).toContain('aria-current="page"><span>日用品</span>');
  expect((tabs.match(/<button class="category-tab /g)??[]).length).toBe(5);
  expect(html).toContain("優先生活用品");
  expect(html).toContain("仍搜尋全部五類");
});

test("ResultsView：優先類別零筆也不偷偷改選其他類別", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records:[rec()],pending:[],excluded:[],favs:[],survival:false,preferredCategories:["活動"],
    onOpen:()=>{},onFavorite:()=>{},onAdjust:()=>{},
  }));
  expect(html).toContain('aria-current="page"><span>活動</span><b>0</b>');
  expect(html).toContain("這個類別沒有主要候選");
});


test("DetailView：零折扣不是免費，未知價格不能出現 FREE 標籤", () => {
  const html = renderToStaticMarkup(createElement(DetailView, {
    item:rec({price_total_twd:null,mandatory_fees_twd:null,data_status:"無法納入比較"}),
    favorite:false,listed:false,onFavorite:()=>{},onList:()=>{},onReport:()=>{},
  }));
  expect(html).toContain("未知，總成本不可比較");
  expect(html).toContain("<small>明確折扣</small><b>NT$0</b>");
  expect(html).not.toContain("FREE");
});


test("ResultsView：精簡卡片移除分類圖區，保留含費總價、計價與收藏入口", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records: [rec({
      category: "日用品", title: "BÄSTIS 毛絮黏把", provider: "IKEA 台灣",
      price_total_twd: 29, mandatory_fees_twd: 59,
      price_unit: "每支（膠紙總長7.5公尺）", quantity_or_servings: "完整份量說明只在詳情",
      reason: "完整推薦理由只在詳情", availability_or_event_time: "完整庫存查核只在詳情",
      extra: { scope: "線上／超商取貨；未確認附近現貨", pricing_context: "完整價格脈絡只在詳情" },
    })],
    pending: [], excluded: [], favs: ["r1"], survival: false,
    onOpen: () => {}, onFavorite: () => {}, onAdjust: () => {},
    preferredCategories: ["日用品"],
  }));
  expect(html).not.toContain('class="result-art"');
  expect(html).not.toContain('class="record-terms');
  expect(html).toContain("IKEA 台灣");
  expect(html).toContain("NT$88");
  expect(html).toContain("計價：每支（膠紙總長7.5公尺）");
  expect(html).toContain("含必要費用 NT$59");
  expect(html).toContain("線上／超商取貨；未確認附近現貨");
  expect(html).toContain("條件與詳情");
  expect(html).toContain('aria-label="查看 BÄSTIS 毛絮黏把 詳情"');
  expect(html).toContain('aria-pressed="true" aria-label="取消收藏 BÄSTIS 毛絮黏把"');
  expect(html).not.toContain("完整份量說明只在詳情");
  expect(html).not.toContain("完整推薦理由只在詳情");
  expect(html).not.toContain("完整庫存查核只在詳情");
  expect(html).not.toContain("完整價格脈絡只在詳情");
});

test("ResultsView：精簡卡片仍標示免費項目的資格與報名限制", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records: [rec({ price_total_twd: 0, eligibility: ["限會員本人"], registration_required: true })],
    pending: [], excluded: [], favs: [], survival: false,
    onOpen: () => {}, onFavorite: () => {}, onAdjust: () => {},
  }));
  expect(html).toContain("FREE");
  expect(html).toContain("需符合資格");
  expect(html).toContain("需報名");
  expect(html).toContain("條件與詳情");
  expect(html).not.toContain("含必要費用");
});

test("ResultsView：待確認與排除區同樣精簡，未知費用不能呈現免費", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records: [], pending: [rec({ mandatory_fees_twd: null, price_total_twd: 0, data_status: "無法納入比較" })],
    excluded: [rec({ id: "excluded", data_status: "無法納入比較" })],
    favs: [], survival: false, onOpen: () => {}, onFavorite: () => {}, onAdjust: () => {},
  }));
  expect((html.match(/result-card-summary/g) ?? []).length).toBe(2);
  expect(html).not.toContain('class="result-art"');
  expect(html).toContain("總成本不可比較");
  expect(html).toContain("必要費用未知");
  expect(html).not.toContain("FREE");
});


test("DetailView：已驗證標章改為小圖示，保留無障礙名稱與提示", () => {
  const html = renderToStaticMarkup(createElement(DetailView, {
    item: rec({ source_url: "https://merchant.test/listing" }),
    favorite: false,
    listed: false,
    onFavorite: () => {},
    onList: () => {},
    onReport: () => {},
  }));
  const badge = html.match(/<span class="image-badge [\s\S]*?<\/span>/)?.[0] ?? "";
  expect(badge).toContain("image-badge-icon");
  expect(badge).toContain('role="img"');
  expect(badge).toContain('aria-label="已驗證"');
  expect(badge).toContain('title="已驗證"');
  expect(badge).toContain('<svg');
  expect(badge.replace(/<[^>]*>/g, "")).toBe("");
  expect(html).toContain("資料狀態");
  expect(html).toContain("<strong>已驗證</strong>");
});

test("DetailView：未驗證及示範資料不套用已驗證小圖示", () => {
  for (const item of [
    rec({ source_url: "https://merchant.test/listing", data_status: "過期／待確認" }),
    rec({ source_url: "https://example.com/ail-demo/sample" }),
  ]) {
    const html = renderToStaticMarkup(createElement(DetailView, {
      item,
      favorite: false,
      listed: false,
      onFavorite: () => {},
      onList: () => {},
      onReport: () => {},
    }));
    const badge = html.match(/<span class="image-badge [\s\S]*?<\/span>/)?.[0] ?? "";
    expect(badge).not.toContain("image-badge-icon");
    expect(badge).not.toContain('aria-label="已驗證"');
    expect(badge).toContain(item.data_status === "已驗證" ? "示範測試資料" : item.data_status);
  }
});

function collapsedMarkup(html: string): string {
  return html.replace(/<details\b[^>]*>\s*<summary>([\s\S]*?)<\/summary>[\s\S]*?<\/details>/g, "$1");
}

test("DetailView：預設只顯示重點，完整價格、條件與來源可展開", () => {
  const html = renderToStaticMarkup(createElement(DetailView, {
    item: rec({
      source_url: "https://merchant.test/listing",
      address: "臺北市中山區測試路 8 號",
      price_total_twd: 29,
      mandatory_fees_twd: 59,
      price_unit: "每支",
      quantity_or_servings: "完整份量保留於價格區",
      eligibility: ["會員專用"],
      registration_required: true,
      extra: { scope: "限線上取貨", review_notes: ["請先向店家確認現貨"] },
      evidence: [{ field: "價格", quote: "原始來源完整摘錄", url: "https://merchant.test/evidence", checked_at: "2026-09-05" }],
    }),
    favorite: false, listed: false, onFavorite: () => {}, onList: () => {}, onReport: () => {},
  }));
  const initial = collapsedMarkup(html);
  expect((html.match(/<details class="detail-disclosure">/g) ?? []).length).toBe(3);
  expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
  for (const essential of ["NT$88", "計價：每支", "含必要費用 NT$59", "需符合資格", "需報名", "限線上取貨", "1 則提醒", "位置／地圖", "原始來源", "加入這次清單"]) {
    expect(initial).toContain(essential);
  }
  for (const detail of ["完整份量保留於價格區", "原始來源完整摘錄", "會員專用", "請先向店家確認現貨", "價格＋必要費用－明確折扣"]) {
    expect(html).toContain(detail);
    expect(initial).not.toContain(detail);
  }
  expect(html).not.toContain("未提供推薦理由");
});

test("DetailView：價格未知及過期待確認不可藏進展開區", () => {
  const html = renderToStaticMarkup(createElement(DetailView, {
    item: rec({ mandatory_fees_twd: null, data_status: "過期／待確認", valid_until: "2020-01-01", source_url: "https://merchant.test/listing" }),
    favorite: false, listed: false, onFavorite: () => {}, onList: () => {}, onReport: () => {},
  }));
  const initial = collapsedMarkup(html);
  expect(initial).toContain("必要費用未知，總成本不可比較");
  expect(initial).toContain("過期／待確認");
  expect(initial).toContain("已到期");
  expect(initial).not.toContain("image-badge-icon");
  expect(initial).not.toContain("FREE");
});

test("ResultsView：比較說明預設收合，分類、價格及操作保持可見", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records: [rec()], pending: [], excluded: [], favs: [], survival: false,
    onOpen: () => {}, onFavorite: () => {}, onAdjust: () => {},
  }));
  const initial = collapsedMarkup(html);
  expect(initial).toContain("NT$300");
  expect(initial).toContain("調整需求與限制");
  expect(initial).toContain("搜尋與比較說明");
  expect(initial).not.toContain("線上配送要核對運費");
  expect(html).toContain("線上配送要核對運費");
  expect(html).not.toContain("CHECKED RESULTS");
});
