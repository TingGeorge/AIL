import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailActions, DetailView, ResultsView, orderResultCandidates } from "../src/client/ResultsView.tsx";
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
    list: [],
    onOpen: () => {},
    onList: () => {},
    onAdjust: () => {},
    survival: false,
  }));

  for (const category of ["食品", "日用品", "免費／公益資源", "活動", "交通"]) {
    expect(html).toContain(category);
  }
  expect(html).toContain("推薦順序");
  expect(html.indexOf("後端第一")).toBeLessThan(html.indexOf("後端第二"));
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

  expect(html).toContain("依目前資料，以標示價格加上必付費用，再扣除已確認的折扣。");
  expect(html).toContain("來源未提供逐欄證據摘錄");
  expect(html).not.toContain("有效期限");
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

  expect(html).toContain("套用折扣後的預估總費用為 NT$270");
  expect(html).toContain("人數只用於確認是否達到門檻");
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

  expect(html).toContain("方案預估總費用 NT$340");
  expect(html).toContain("每人 NT$85");
  expect(html).toContain("來源每人價格 NT$85");
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

  expect(html).toContain("目前預估總費用不足，無法計算團購方案預估總費用");
  expect(html).not.toContain("方案預估總費用 NT$340");
});

test("ResultsView：只依 isDemoRecord 將樣本狀態改標為示範測試資料", () => {
  const sampleHtml = renderToStaticMarkup(createElement(ResultsView, {
    records: [rec({
      provider: "示範 圓山便當房",
      source_url: "https://example.com/ail-demo/bento-house",
    })],
    pending: [],
    excluded: [],
    list: [],
    onOpen: () => {},
    onList: () => {},
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
    list: [],
    onOpen: () => {},
    onList: () => {},
    onAdjust: () => {},
    survival: false,
  }));

  expect(sampleHtml).toContain("示範測試資料");
  expect(sampleHtml).not.toContain("status-yellow");
  expect(ordinaryHtml).toContain("已確認");
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
  const actions = renderToStaticMarkup(createElement(DetailActions, {
    item: rec({ provider: "示範 圓山便當房" }),
    favorite: false,
    listed: false,
    onFavorite: () => {},
    onList: () => {},
    onReport: () => {},
  }));
  expect(actions).toContain("加入測試清單");
  expect(html).not.toContain("image-badge-icon");
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

  expect(html).toContain("已確認");
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
    pending:[],excluded:[],list:[],survival:false,preferredCategories:["日用品","活動"],
    onOpen:()=>{},onList:()=>{},onAdjust:()=>{},
  }));
  const tabs = html.match(/<nav class="category-tabs"[\s\S]*?<\/nav>/)?.[0] ?? "";
  expect(tabs.indexOf("日用品")).toBeLessThan(tabs.indexOf("活動"));
  expect(tabs.indexOf("活動")).toBeLessThan(tabs.indexOf("食品"));
  expect(tabs).toContain('aria-current="page"><span>日用品</span>');
  expect((tabs.match(/<button class="category-tab /g)??[]).length).toBe(5);
  expect(html).toContain("優先生活用品");
});

test("ResultsView：優先類別零筆也不偷偷改選其他類別", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records:[rec()],pending:[],excluded:[],list:[],survival:false,preferredCategories:["活動"],
    onOpen:()=>{},onList:()=>{},onAdjust:()=>{},
  }));
  expect(html).toContain('aria-current="page"><span>活動</span><b>0</b>');
  expect(html).toContain("這個類別沒有選項");
});


test("DetailView：零折扣不是免費，未知價格不能出現 FREE 標籤", () => {
  const html = renderToStaticMarkup(createElement(DetailView, {
    item:rec({price_total_twd:null,mandatory_fees_twd:null,data_status:"無法納入比較"}),
    favorite:false,listed:false,onFavorite:()=>{},onList:()=>{},onReport:()=>{},
  }));
  expect(html).toContain("目前資料不足，無法估算總費用");
  expect(html).toContain("<small>已確認折扣</small><b>NT$0</b>");
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
    pending: [], excluded: [], list: ["r1"], survival: false,
    onOpen: () => {}, onList: () => {}, onAdjust: () => {},
    preferredCategories: ["日用品"],
  }));
  expect(html).not.toContain('class="result-art"');
  expect(html).not.toContain('class="record-terms');
  expect(html).toContain("IKEA 台灣");
  expect(html).toContain("NT$88");
  expect(html).toContain("計價：每支（膠紙總長7.5公尺）");
  expect(html).toContain("含必付費用 NT$59");
  expect(html).toContain("線上／超商取貨；未確認附近現貨");
  expect(html).toContain("條件與詳情");
  expect(html).toContain('aria-label="查看 BÄSTIS 毛絮黏把 詳情"');
  expect(html).toContain('aria-pressed="true" aria-label="從清單移除 BÄSTIS 毛絮黏把"');
  expect(html).not.toContain("完整份量說明只在詳情");
  expect(html).not.toContain("完整推薦理由只在詳情");
  expect(html).not.toContain("完整庫存查核只在詳情");
  expect(html).not.toContain("完整價格脈絡只在詳情");
});

test("ResultsView：精簡卡片仍標示免費項目的資格與報名限制", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records: [rec({ price_total_twd: 0, eligibility: ["限會員本人"], registration_required: true })],
    pending: [], excluded: [], list: [], survival: false,
    onOpen: () => {}, onList: () => {}, onAdjust: () => {},
  }));
  expect(html).toContain("免費");
  expect(html).toContain("需符合資格");
  expect(html).toContain("需報名");
  expect(html).toContain("條件與詳情");
  expect(html).not.toContain("含必付費用");
});

test("ResultsView：待確認與已排除卡片同樣精簡，未知費用不能呈現免費", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records: [], pending: [rec({ mandatory_fees_twd: null, price_total_twd: 0, data_status: "無法納入比較" })],
    excluded: [rec({ id: "excluded", data_status: "無法納入比較" })],
    list: [], survival: false, onOpen: () => {}, onList: () => {}, onAdjust: () => {},
  }));
  expect((html.match(/result-card-summary/g) ?? []).length).toBe(2);
  expect(html).not.toContain('class="result-art"');
  expect(html).toContain("目前資料不足，無法估算總費用");
  expect(html).toContain("必付費用未知");
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
  expect(badge).toContain('aria-label="已確認"');
  expect(badge).toContain('title="已確認"');
  expect(badge).toContain('<svg');
  expect(badge.replace(/<[^>]*>/g, "")).toBe("");
  expect(html).toContain("資料狀態");
  expect(html).toContain("<strong>已確認</strong>");
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
    expect(badge).not.toContain('aria-label="已確認"');
    expect(badge).toContain(item.data_status === "已驗證" ? "示範測試資料" : item.data_status === "過期／待確認" ? "資料可能過期／待確認" : item.data_status);
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
  for (const essential of ["NT$88", "計價：每支", "含必付費用 NT$59", "需符合資格", "需報名", "限線上取貨", "1 則提醒", "位置／地圖", "原始來源"]) {
    expect(initial).toContain(essential);
  }
  for (const detail of ["完整份量保留於價格區", "原始來源完整摘錄", "會員專用", "請先向店家確認現貨", "依目前資料，以標示價格加上必付費用，再扣除已確認的折扣。"]) {
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
  expect(initial).toContain("必付費用未知，無法估算總費用");
  expect(initial).toContain("資料可能過期／待確認");
  expect(initial).toContain("已到期");
  expect(initial).not.toContain("image-badge-icon");
  expect(initial).not.toContain("FREE");
});

test("ResultsView：不再附帶搜尋與比較的說明文字，分類、價格及操作保持可見", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records: [rec()], pending: [], excluded: [], list: [], survival: false,
    onOpen: () => {}, onList: () => {}, onAdjust: () => {},
  }));
  expect(html).toContain("NT$300");
  expect(html).toContain("調整需求與必要條件");
  expect(html).not.toContain("搜尋與比較說明");
  expect(html).not.toContain("線上配送請核對運費與配送範圍");
  expect(html).not.toContain("CHECKED RESULTS");
});

// Pending remains a backend classification, but no longer a separate UI bucket.
test("ResultsView：待確認直接接在同一清單後段，計數、狀態、原因及收藏保留，已排除仍獨立", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records: [
      rec({ id: "main-a", title: "確定第一", price_total_twd: 300 }),
      rec({ id: "main-b", title: "確定第二", price_total_twd: 50 }),
    ],
    pending: [
      rec({ id: "pending-request", title: "份量待核對", source_url: "https://merchant.test/item",
        price_total_twd: 0, request_match: { status: "pending", reasons: ["份量缺乏足夠證據，待確認"] } }),
      rec({ id: "pending-source", title: "來源待核對", mandatory_fees_twd: null, data_status: "部分驗證／待確認" }),
    ],
    excluded: [rec({ id: "excluded", title: "超出預算項目", request_match: { status: "excluded", reasons: ["預算不符合"] } })],
    list: ["pending-request"], survival: false,
    onOpen: () => {}, onList: () => {}, onAdjust: () => {},
  }));
  const primary = html.slice(0, html.indexOf('<div class="secondary-results">'));
  expect(html).not.toContain("result-bucket-pending");
  expect(html).not.toContain("<b>待確認</b>");
  expect(html).toContain("<h1 aria-live=\"polite\">4 個選項</h1>");
  expect(html).toContain('<span>食品</span><b>4</b>');
  expect((primary.match(/result-card-summary/g) ?? []).length).toBe(4);
  const titles = ["確定第一", "確定第二", "份量待核對", "來源待核對"];
  for (let i = 1; i < titles.length; i++) {
    expect(primary.indexOf(titles[i - 1]!)).toBeLessThan(primary.indexOf(titles[i]!));
  }
  for (const number of ["01", "02", "03", "04"]) expect(primary).toContain(`${number} · 食品`);
  expect(primary).toContain("本次需求待確認");
  expect(primary).toContain('class="status-dot status-blue"');
  expect(primary).toContain("份量缺乏足夠證據，待確認");
  expect(primary).toContain("部分確認／待確認");
  expect(primary).toContain("目前資料不足，無法估算總費用");
  expect(primary).toContain("必付費用未知");
  expect(primary).toContain('aria-label="從清單移除 份量待核對"');
  expect(primary).toContain('aria-label="查看 來源待核對 詳情"');
  expect(primary).not.toContain("超出預算項目");
  const secondary = html.slice(html.indexOf('<div class="secondary-results">'));
  expect(secondary).toContain("result-bucket-excluded");
  expect(secondary).toContain("<b>已排除</b>");
  expect(secondary).toContain("超出預算項目");
  expect(secondary).toContain("預算不符合");
});

test("ResultsView：類別只有待確認時仍顯示清單，跨類別計數包含待確認但不含已排除", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records: [rec()],
    pending: [
      rec({ id: "event", category: "活動", title: "尚待核對活動", data_status: "過期／待確認" }),
      rec({ id: "goods", category: "日用品", title: "尚待核對用品", data_status: "衝突待確認" }),
    ],
    excluded: [rec({ id: "excluded-event", category: "活動", title: "已排除活動" })],
    preferredCategories: ["活動"], list: [], survival: false,
    onOpen: () => {}, onList: () => {}, onAdjust: () => {},
  }));
  expect(html).toContain("<h1 aria-live=\"polite\">1 個選項</h1>");
  expect(html).toContain('aria-current="page"><span>活動</span><b>1</b>');
  expect(html).toContain('<span>日用品</span><b>1</b>');
  expect(html).toContain('<span>食品</span><b>1</b>');
  const primary = html.slice(0, html.indexOf('<div class="secondary-results">'));
  expect(primary).toContain("尚待核對活動");
  expect(primary).toContain("資料可能過期／待確認");
  expect(primary).not.toContain("尚待核對用品");
  expect(primary).not.toContain("已排除活動");
  expect(html).not.toContain('class="empty-state"');
  expect(html).not.toContain("result-bucket-pending");
});

test("ResultsView：只剩已排除時維持空狀態與獨立原因，不將排除項目混入候選", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records: [], pending: [], excluded: [rec({ title: "已排除品項" })], list: [], survival: false,
    onOpen: () => {}, onList: () => {}, onAdjust: () => {},
  }));
  expect(html).toContain("這個類別沒有選項");
  expect(html).toContain('aria-current="page"><span>食品</span><b>0</b>');
  expect(html).toContain('class="empty-state"');
  expect(html).not.toContain('<div class="result-list">');
  expect(html).toContain("result-bucket-excluded");
  expect(html).toContain("已排除品項");
  expect(html).not.toContain("result-bucket-pending");
});

for (const mode of ["rank", "cost", "distance", "verified"] as const) {
  test(`ResultsView：${mode} 排序分組穩定，待確認後置且不改寫輸入`, () => {
    const records = [
      rec({ id: "main-a", price_total_twd: 300, distance_km: null, verified_at: "2026-09-01" }),
      rec({ id: "main-b", price_total_twd: 50, distance_km: 2, verified_at: "2026-09-02" }),
    ];
    const pending = [
      rec({ id: "pending-unknown", mandatory_fees_twd: null, distance_km: null, verified_at: "2026-09-03", data_status: "部分驗證／待確認" }),
      rec({ id: "pending-free-a", price_total_twd: 0, distance_km: 0, verified_at: "2026-09-05",
        request_match: { status: "pending", reasons: ["資格待確認"] } }),
      rec({ id: "pending-free-b", price_total_twd: 0, distance_km: 0, verified_at: "2026-09-05", data_status: "衝突待確認" }),
    ];
    const original = structuredClone({ records, pending });
    const result = orderResultCandidates(records, pending, mode, true);
    expect(result.map(item => item.id)).toEqual(mode === "rank"
      ? ["main-a", "main-b", "pending-unknown", "pending-free-a", "pending-free-b"]
      : ["main-b", "main-a", "pending-free-a", "pending-free-b", "pending-unknown"]);
    expect(result.slice(0, 2).every(item => records.includes(item))).toBe(true);
    expect(result.slice(2).every(item => pending.includes(item))).toBe(true);
    expect({ records, pending }).toEqual(original);
  });
}


test("ResultsView：資料仍標已驗證但已過期或費用未知時，合併後仍明示待確認且不改寫資料", () => {
  const pending = [
    rec({ id: "expired", title: "已到期的舊資料", source_url: "https://merchant.test/expired", valid_until: "2020-01-01" }),
    rec({ id: "unknown-fees", title: "缺少必要費用", source_url: "https://merchant.test/fees", mandatory_fees_twd: null }),
  ];
  const original = structuredClone(pending);
  const html = renderToStaticMarkup(createElement(ResultsView, {
    records: [], pending, excluded: [], list: [], survival: false,
    onOpen: () => {}, onList: () => {}, onAdjust: () => {},
  }));
  const primary = html.slice(0, html.indexOf('<div class="secondary-results">'));
  expect(primary).toContain('<h1 aria-live="polite">2 個選項</h1>');
  expect(primary).toContain("資料可能過期／待確認");
  expect(primary).toContain("部分確認／待確認");
  expect(primary).not.toContain("status-yellow");
  expect(primary).toContain("必付費用未知");
  expect(primary).toContain("目前資料不足，無法估算總費用");
  expect(pending).toEqual(original);
});

test("default browsing shows all categories together, starts with cost order, and keeps pending last", () => {
  const html = renderToStaticMarkup(createElement(ResultsView, {
    browsing: true,
    records: [
      rec({ id: "browse-food", title: "瀏覽餐點", price_total_twd: 200 }),
      rec({ id: "browse-free", title: "瀏覽免費活動", category: "活動", agent: "free", price_total_twd: 0 }),
      rec({ id: "browse-transit", title: "瀏覽交通", category: "交通", price_total_twd: 30 }),
    ],
    pending: [rec({ id: "browse-pending", title: "瀏覽待確認", price_total_twd: 1, data_status: "部分驗證／待確認" })],
    excluded: [], list: [], survival: false,
    onOpen: () => {}, onList: () => {}, onAdjust: () => {},
  }));
  expect(html).toContain('aria-current="page"><span>全部</span><b>4</b>');
  expect(html).toContain('<option value="cost" selected="">預估總費用由低到高</option>');
  expect(html).toContain("4 個選項");
  expect(html.indexOf("瀏覽免費活動")).toBeLessThan(html.indexOf("瀏覽交通"));
  expect(html.indexOf("瀏覽交通")).toBeLessThan(html.indexOf("瀏覽餐點"));
  expect(html.indexOf("瀏覽餐點")).toBeLessThan(html.indexOf("瀏覽待確認"));
  expect(html).toContain("未套用個人需求條件");
  expect(html).toContain("已排除");
  expect(html).not.toContain("推薦順序");
  expect(html).not.toContain("距離近到遠");
});

test("DetailView：依類別顯示自然的數量用詞，食品仍保留份量", () => {
  const detailProps = { favorite: false, listed: false, onFavorite: () => {}, onList: () => {}, onReport: () => {} };
  const cases = [
    ["日用品", "價格與商品規格", "商品規格", "商品規格", "三件組"],
    ["免費／公益資源", "費用與服務資訊", "服務對象／使用方式", "服務對象／使用方式", "每人一次"],
    ["活動", "費用與活動資訊", "活動資訊", "參加地點", "新北市客家文化園區"],
    ["交通", "票價與使用資訊", "票種／使用方式", "票種／使用方式", "每人一張"],
  ] as const;
  for (const [category, title, label, evidenceLabel, value] of cases) {
    const html = renderToStaticMarkup(createElement(DetailView, {
      item: rec({
        category,
        quantity_or_servings: value,
        evidence: [{ field: "份量", quote: value, url: "https://example.test/source", checked_at: "2026-09-05" }],
      }),
      ...detailProps,
    }));
    expect(html).toContain(title);
    expect(html).toContain(`${label}：${value}`);
    expect(html).toContain(`<span>${evidenceLabel}</span>`);
    expect(html).not.toContain("<span>份量</span>");
  }

  const food = renderToStaticMarkup(createElement(DetailView, {
    item: rec({
      quantity_or_servings: "5 人份",
      evidence: [{ field: "份量", quote: "5 人份", url: "https://food.test/source", checked_at: "2026-09-05" }],
    }),
    ...detailProps,
  }));
  expect(food).toContain("價格與份量");
  expect(food).toContain("份量：5 人份");
  expect(food).toContain("<span>份量</span>");
});

test("DetailView：無資料的選用欄位不顯示空列", () => {
  const html = renderToStaticMarkup(createElement(DetailView, { item: rec() }));
  expect(html).not.toContain("適用條件與時間");
  expect(html).not.toContain("是否需登記");
  expect(html).not.toContain("報名／登記");
  expect(html).not.toContain("有效期限");
  expect(html).not.toContain("交通資訊");
  expect(html).not.toContain("<span>地址</span>");
  expect(html).not.toContain("份量：未提供");
});

test("DetailView：活動地點型摘錄改用自然標題並排在價格與時間後", () => {
  const html = renderToStaticMarkup(createElement(DetailView, {
    item: rec({
      category: "活動",
      quantity_or_servings: "每人1次臺北館一般參觀",
      availability_or_event_time: "週二至週日10:00–18:00",
      evidence: [
        { field: "份量", quote: "臺北館", url: "https://example.test/place", checked_at: "2026-09-05" },
        { field: "時間", quote: "週二至週日10:00–18:00", url: "https://example.test/time", checked_at: "2026-09-05" },
        { field: "價格", quote: "免費參觀", url: "https://example.test/price", checked_at: "2026-09-05" },
      ],
    }),
  }));
  expect(html).toContain("活動資訊：每人1次臺北館一般參觀");
  expect(html).toContain("<span>參加地點</span>");
  const evidenceStart = html.indexOf('<div class="evidence-list">');
  const evidenceEnd = html.indexOf('</div><div class="source-meta">', evidenceStart);
  const evidenceHtml = html.slice(evidenceStart, evidenceEnd);
  expect(evidenceHtml.indexOf("免費參觀")).toBeLessThan(evidenceHtml.indexOf("週二至週日10:00–18:00"));
  expect(evidenceHtml.indexOf("週二至週日10:00–18:00")).toBeLessThan(evidenceHtml.indexOf("臺北館"));
  expect(html).not.toContain("票種／參加方式");
});

test("DetailView：API JSON 摘錄轉為可讀內容，不直接顯示內部欄位", () => {
  const html = renderToStaticMarkup(createElement(DetailView, {
    item: rec({
      id: "f_kf06",
      title: "上校雞塊4塊",
      quantity_or_servings: "1顆；官方API圖片檔名標示單顆",
      evidence: [
        {
          field: "時間",
          quote: "\"Fcode\":\"FA013\",\"Name\":\"上校雞塊4塊\",\"StartDate\":\"2026/09/05 00:00:00\",\"EndDate\":\"2026/09/19 23:59:59\"",
          url: "https://olo-api.kfcclub.com.tw/menu/v1/GetQueryFood",
          checked_at: "2026-09-05T23:42:02+08:00",
        },
        {
          field: "份量",
          quote: "\"ImageURL\":\"/OLO餐圖-青花椒花生蛋撻單顆.png\"",
          url: "https://olo-api.kfcclub.com.tw/menu/v1/GetQueryFood",
          checked_at: "2026-09-05T23:42:02+08:00",
        },
      ],
    }),
  }));

  expect(html).toContain("2026/09/05–2026/09/19");
  expect(html).toContain("1顆；官方API圖片檔名標示單顆");
  expect(html).not.toContain("Fcode");
  expect(html).not.toContain("StartDate");
  expect(html).not.toContain("EndDate");
  expect(html).not.toContain("ImageURL");
  expect(html).not.toContain("OLO餐圖");
});

test("DetailView：團購期限與查核時間使用一致的可讀日期", () => {
  const html = renderToStaticMarkup(createElement(DetailView, {
    item: rec({
      group_offer: {
        min_people: 4,
        discount_pct: 10,
        redeem_code: null,
        note: "四人同行九折",
      },
      extra: {
        group_offer_terms: {
          redemption_method: "現場核對同行人數",
          valid_until: "2099-01-31T23:59:59+08:00",
        },
        group_offer_evidence: [{
          field: "團體折扣",
          quote: "四人同行九折",
          url: "https://www.gov.taipei/group-offer",
          checked_at: "2026-09-05T23:49:45+08:00",
        }],
      },
    }),
  }));

  expect(html).toContain("優惠期限：2099/01/31");
  expect(html).toContain("查核：2026/09/05");
  expect(html).not.toContain("2099-01-31T23:59:59+08:00");
  expect(html).not.toContain("2026-09-05T23:49:45+08:00");
});
