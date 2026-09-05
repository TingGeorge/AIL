import { writeFile } from "node:fs/promises";

const pad = (value) => String(value).padStart(2, "0");
const now = new Date();
const offsetMinutes = -now.getTimezoneOffset();
const sign = offsetMinutes >= 0 ? "+" : "-";
const absOffset = Math.abs(offsetMinutes);
const checkedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`;

const IKEA_MENU = "https://www.ikea.com.tw/zh/ikea-food/restaurant";
const IKEA_NEIHU = "https://www.ikea.com.tw/zh/store/nei-hu/index";
const KFC_MENU = "https://www.kfcclub.com.tw/menu?menuId=2";
const KFC_API = "https://olo-api.kfcclub.com.tw/menu/v1/GetQueryFood";
const KFC_FAQ = "https://olo.kfcclub.com.tw/customerService/FAQ";
const MCD_20260831 = "https://www.mcdonalds.com/tw/zh-tw/newsroom/2026/20260831.html";
const MCD_20260519 = "https://www.mcdonalds.com/tw/zh-tw/newsroom/2026/20260519.html";

const base = ({ id, title, provider, price, priceUnit, quantity, availability, validUntil = null, sourceUrl, evidence, actionLabel, scope, pricingContext, reviewNotes, extra = {} }) => ({
  id,
  category: "食品",
  agent: "paid",
  title,
  provider,
  price_total_twd: price,
  mandatory_fees_twd: 0,
  discount_twd: 0,
  price_unit: priceUnit,
  quantity_or_servings: quantity,
  eligibility: [],
  registration_required: false,
  availability_or_event_time: availability,
  valid_until: validUntil,
  address: null,
  lat: null,
  lng: null,
  distance_or_time_text: null,
  tags: null,
  source_url: sourceUrl,
  source_type: "web-searched",
  source_authority: "provider",
  evidence: evidence.map((item) => ({ ...item, checked_at: checkedAt })),
  collected_at: checkedAt,
  verified_at: checkedAt,
  data_status: "已驗證",
  action_url: sourceUrl,
  action_label: actionLabel,
  baseline: null,
  group_offer: null,
  extra: {
    research_batch: "expansion-2026-09-05",
    scope,
    pricing_context: pricingContext,
    review_notes: reviewNotes,
    ...extra,
  },
});

const ikeaItems = [
  {
    id: "f_ik01", title: "超值早餐", price: 59, priceUnit: "1份早餐餐盤",
    quantity: "1份早餐餐盤；含皇后吐司、炒蛋、巧達起司腸、雙色蔬菜",
    priceQuote: "$59", portionQuote: "含皇后吐司、炒蛋、巧達起司腸、雙色蔬菜",
    breakfast: true,
  },
  {
    id: "f_ik02", title: "香酥鱈魚晨光盤", price: 169, priceUnit: "1份早餐餐盤",
    quantity: "1份早餐餐盤；含鱈魚排、法國餐包、炒蛋、酪梨片、小番茄、塔塔醬、奶油",
    priceQuote: "$169", portionQuote: "含鱈魚排、法國餐包、炒蛋、酪梨片、小番茄、塔塔醬、奶油",
    breakfast: true,
  },
  {
    id: "f_ik03", title: "植物烤牛肉泡菜炒飯", price: 129, priceUnit: "1份現場單點",
    quantity: "官方菜單一份炒飯品項；含泡菜炒飯、植物烤牛肉、海苔絲、綜合蔬菜",
    priceQuote: "$129", portionQuote: "含泡菜炒飯、植物烤牛肉、海苔絲、綜合蔬菜",
  },
  {
    id: "f_ik04", title: "蒜香小龍蝦", price: 199, priceUnit: "1份現場單點",
    quantity: "官方菜單一份品項；菜單未標示尾數或克數",
    priceQuote: "$199", portionQuote: "含蒜香小龍蝦",
  },
  {
    id: "f_ik05", title: "鮮蔥肋眼牛排", price: 429, priceUnit: "1份現場單點（一般價）",
    quantity: "官方菜單一份牛排品項；含肋眼牛排、薯條、綜合蔬菜、蔥花、奶香蔥花醬",
    priceQuote: "$429", portionQuote: "含肋眼牛排、薯條、綜合蔬菜、蔥花、奶香蔥花醬",
    notes: ["採一般價429元，不採2026年9月IKEA Family卡友價369元；本筆不需要會員資格。"],
  },
  {
    id: "f_ik06", title: "鷹嘴豆丸咖哩飯", price: 159, priceUnit: "1份現場單點",
    quantity: "官方菜單一份咖哩飯品項；含鷹嘴豆丸、印度咖哩醬I、綜合蔬菜、蛋炒飯",
    priceQuote: "$159", portionQuote: "含鷹嘴豆丸、印度咖哩醬I、綜合蔬菜、蛋炒飯",
  },
  {
    id: "f_ik07", title: "鮭魚菲力佐蔬菜馬鈴薯餅", price: 280, priceUnit: "1份現場單點",
    quantity: "官方菜單一份鮭魚主餐；含鮭魚菲力、蔬菜馬鈴薯餅、綜合蔬菜、小蕃茄、荷蘭醬",
    priceQuote: "$280", portionQuote: "含鮭魚菲力、蔬菜馬鈴薯餅、綜合蔬菜、 小蕃茄、荷蘭醬",
  },
  {
    id: "f_ik08", title: "瑞典肉丸 8粒", price: 139, priceUnit: "8粒",
    quantity: "8粒瑞典肉丸，附薯泥、雙色蔬菜、肉丸奶醬、越橘果醬",
    priceQuote: "8粒 $139", portionQuote: "含瑞典烤肉丸、薯泥、雙色蔬菜、肉丸奶醬、越橘果醬",
  },
  {
    id: "f_ik09", title: "瑞典雞肉丸 8粒", price: 139, priceUnit: "8粒",
    quantity: "8粒瑞典雞肉丸，附薯泥、雙色蔬菜、肉丸奶醬、越橘果醬",
    priceQuote: "8粒 $139", portionQuote: "含瑞典雞肉丸、薯泥、雙色蔬菜、肉丸奶醬、越橘果醬",
  },
  {
    id: "f_ik10", title: "植物素肉丸 8粒", price: 119, priceUnit: "8粒",
    quantity: "8粒植物素肉丸，附薯泥、雙色蔬菜、肉丸奶醬、越橘果醬",
    priceQuote: "8粒 $119", portionQuote: "含植物素肉丸、薯泥、雙色蔬菜、肉丸奶醬、越橘果醬",
  },
  {
    id: "f_ik11", title: "鄉村烤半雞", price: 280, priceUnit: "半雞1份",
    quantity: "半隻義式香草雞，附薯條、雙色蔬菜",
    priceQuote: "$280", portionQuote: "含義式香草半雞、薯條、雙色蔬菜",
  },
  {
    id: "f_ik12", title: "煙燻BBQ烤豬肋排", price: 389, priceUnit: "1份現場單點",
    quantity: "官方菜單一份豬肋排品項；未標示重量",
    priceQuote: "$389", portionQuote: "含煙燻豬肋排、綜合蔬菜、V型薯條、煙燻燒烤醬",
  },
  {
    id: "f_ik13", title: "脆皮豬腳佐V型薯條", price: 389, priceUnit: "1份現場單點",
    quantity: "官方菜單一份豬腳品項；含豬腳、V型薯條、德國酸菜，未標示重量",
    priceQuote: "$389", portionQuote: "含豬腳、V型薯條、德國酸菜",
  },
  {
    id: "f_ik14", title: "大三元吉利丸15粒", price: 199, priceUnit: "15粒",
    quantity: "15粒：瑞典肉丸5粒、雞肉丸5粒、植物素肉丸5粒，另附醬與配菜",
    priceQuote: "$199", portionQuote: "含瑞典肉丸5粒、雞肉丸5粒、 植物素肉丸5粒、肉丸奶醬、薯泥、 越桔果醬",
  },
  {
    id: "f_ik15", title: "香菜小龍蝦沙拉罐", price: 199, priceUnit: "1罐現場單點",
    quantity: "1罐沙拉；含小龍蝦仁、綜合生菜、紅橡木、紫洋蔥、小黃瓜、香菜與沙拉醬",
    priceQuote: "$199", portionQuote: "含小龍蝦仁、綜合生菜、紅橡木、紫洋蔥、小黃瓜、香菜、香菜風味沙拉醬",
    validUntil: "2026-09-16T23:59:59+08:00",
    timeQuote: "銷售區間 : 2026/8/27- 2026/9/16",
    availability: "IKEA官方菜單銷售區間為2026-08-27至2026-09-16；IKEA內湖店是否尚有現貨以現場為準",
    notes: ["期限的23:59:59是將官方只標日期的2026-09-16正規化為臺灣當日結束；商品仍可能提前售完或門市未供應。"],
  },
  {
    id: "f_ik16", title: "金黃小龍蝦餃", price: 50, priceUnit: "1份現場單點",
    quantity: "官方菜單一份小龍蝦餃品項；未標示顆數或克數",
    priceQuote: "$50", portionQuote: "含小麥麵粉、洋蔥、小龍蝦仁、乾酪、蕃茄、九層塔、胡椒、香料",
  },
  {
    id: "f_ik17", title: "黃金海鮮拼盤", price: 229, priceUnit: "1份現場單點",
    quantity: "官方菜單一份拼盤；含福氣魚、天婦羅蝦、蝦米花、塔塔醬、檸檬，未標示各品項數量",
    priceQuote: "$229", portionQuote: "含福氣魚、天婦羅蝦、 蝦米花、塔塔醬、檸檬",
  },
  {
    id: "f_ik18", title: "薄脆雞翅", price: 55, priceUnit: "2支",
    quantity: "2支薄脆雞翅",
    priceQuote: "$55/2支", portionQuote: "含雞翅、麵粉、調味料",
  },
];

const ikea = ikeaItems.map((item) => {
  const breakfastAvailability = "官方菜單供應09:00–10:30；IKEA內湖店營業時間交集為平日10:00–10:30、週末09:00–10:30（由兩個官方時段推導），仍以現場供應為準";
  const regularAvailability = "IKEA內湖店瑞典餐廳週一至週五10:00–21:00、週六至週日09:00–21:00，晚上供餐至20:30；品項供應以現場為準";
  const timeQuote = item.timeQuote ?? (item.breakfast ? "*供應時間：早上9:00-10:30" : "• 瑞典餐廳：週一至週五10:00-21:00；週六至週日 09:00-21:00 ；晚上供餐時間到20:30");
  const timeUrl = item.timeQuote || item.breakfast ? IKEA_MENU : IKEA_NEIHU;
  return base({
    id: item.id,
    title: item.title,
    provider: "IKEA內湖店｜瑞典餐廳",
    price: item.price,
    priceUnit: item.priceUnit,
    quantity: item.quantity,
    availability: item.availability ?? (item.breakfast ? breakfastAvailability : regularAvailability),
    validUntil: item.validUntil ?? null,
    sourceUrl: IKEA_MENU,
    evidence: [
      { field: "價格", quote: item.priceQuote, url: IKEA_MENU },
      { field: "份量", quote: item.portionQuote, url: IKEA_MENU },
      { field: "時間", quote: timeQuote, url: timeUrl },
      { field: "資格", quote: "不用訂位，來IKEA餐廳就能用親民價格", url: IKEA_NEIHU },
    ],
    actionLabel: "查看IKEA官方菜單",
    scope: "IKEA內湖店瑞典餐廳現場單點；不含外送、IKEA Family卡友優惠、可選加購或其他分店。",
    pricingContext: "price_total_twd採IKEA官方菜單的一般現場標價。mandatory_fees_twd=0僅適用於本筆現場單點範圍：未加入配送、會員方案或可選加購；官網未另列本範圍的強制服務費，此為範圍化成本判定，不是官方零費用引文。",
    reviewNotes: [
      "官方菜單明示餐點供應依各分店現場為主；本筆不宣稱研究時點庫存。",
      "地址與座標未由來源逐字核妥，故address、lat、lng保持null。",
      "成分與過敏原未完整核對，tags保持null。",
      "官方未明示價格有效期限者valid_until保持null，應在使用前再核價。",
      ...(item.notes ?? []),
    ],
    extra: {
      local_or_online: "IKEA內湖店現場",
      supply_disclaimer: "*餐點供應依各分店現場為主；餐廳營業時間請參考各分店公告。",
      registration_basis: "官方內湖店頁寫明不用訂位。",
      ...(item.breakfast ? { availability_derivation: "菜單09:00–10:30與內湖店平日10:00開門、週末09:00開門取交集。" } : {}),
    },
  });
});

const kfcItems = [
  { id: "f_kf01", fcode: "AA654", title: "5塊雞桶", price: 299, start: "2026/09/05 00:00:00", quantity: "5塊雞；API與官方菜單品名直接標示5塊", portionQuote: "5塊雞桶", apiFile: "kfc-food-2.json" },
  { id: "f_kf02", fcode: "AA683", title: "咔啦雙堡餐", price: 299, start: "2026/09/05 00:00:00", quantity: "1份咔啦雙堡餐；官方頁未逐項標示套餐內容與各品項份量", portionQuote: "咔啦雙堡餐", apiFile: "kfc-food-2.json" },
  { id: "f_kf03", fcode: "AA753", title: "義式香草紙包雞 雙人餐", price: 299, start: "2026/03/18 00:00:00", quantity: "1份雙人餐；官方品名標示雙人餐，但API未逐項標示餐點內容", portionQuote: "義式香草紙包雞 雙人餐", apiFile: "kfc-food-2.json" },
  { id: "f_kf04", fcode: "FA240", title: "青花椒花生蛋撻", price: 57, start: "2026/08/04 00:00:00", quantity: "1顆；官方API圖片檔名標示單顆", portionQuote: '"ImageURL":"/OLO餐圖-青花椒花生蛋撻單顆.png"', portionUrl: KFC_API, apiFile: "kfc-food-184.json" },
  { id: "f_kf05", fcode: "JA151", title: "雙色蛋撻禮盒(原+青花椒花生)", price: 286, start: "2026/08/04 00:00:00", quantity: "6顆：青花椒花生蛋撻3顆＋原味蛋撻3顆；依官方API圖片檔名", portionQuote: '"ImageURL":"/OLO餐圖-青花椒花生蛋撻x3+原味蛋撻x3禮盒.png"', portionUrl: KFC_API, apiFile: "kfc-food-184.json" },
  { id: "f_kf06", fcode: "FA013", title: "上校雞塊4塊", price: 49, start: "2026/09/05 00:00:00", quantity: "4塊上校雞塊；官方菜單品名直接標示4塊", portionQuote: "上校雞塊4塊", apiFile: "kfc-food-5.json" },
  { id: "f_kf07", fcode: "FA173", title: "黃金超蝦塊3塊", price: 59, start: "2024/10/18 00:00:00", quantity: "3塊黃金超蝦塊；官方菜單品名直接標示3塊", portionQuote: "黃金超蝦塊3塊", apiFile: "kfc-food-5.json" },
  { id: "f_kf08", fcode: "CO2000", title: "咔啦脆雞", price: 71, start: "2025/02/19 00:00:00", quantity: "官方菜單一個單點品項；官方頁與API未標示塊數或克數", portionQuote: "咔啦脆雞\n$71", apiFile: "kfc-food-5.json" },
  { id: "f_kf09", fcode: "CO2009", title: "咔啦爆脆雞(不辣)", price: 71, start: "2026/04/08 00:00:00", quantity: "1塊；官方API圖片檔名標示1塊", portionQuote: '"ImageURL":"/newOLO-咔啦爆脆1塊.png"', portionUrl: KFC_API, apiFile: "kfc-food-5.json" },
  { id: "f_kf10", fcode: "FA125", title: "雙色轉轉QQ球", price: 59, start: "2024/09/01 00:00:00", quantity: "官方菜單一個單點品項；官方頁與API未標示球數或克數", portionQuote: "雙色轉轉QQ球\n$59", apiFile: "kfc-food-5.json" },
];

const kfc = kfcItems.map((item) => base({
  id: item.id,
  title: item.title,
  provider: "KFC肯德基台灣｜預訂快取",
  price: item.price,
  priceUnit: item.title.includes("餐") || item.title.includes("桶") || item.title.includes("禮盒") ? "1份官方菜單品項" : "1個官方菜單單點品項",
  quantity: item.quantity,
  availability: `${item.start.replaceAll("/", "-")}起至2026-09-19 23:59:59止的官方API商品檔期；預訂快取實際供應仍依門市與時段`,
  validUntil: "2026-09-19T23:59:59+08:00",
  sourceUrl: KFC_MENU,
  evidence: [
    { field: "價格", quote: `${item.title}\n$${item.price}`, url: KFC_MENU },
    { field: "份量", quote: item.portionQuote, url: item.portionUrl ?? KFC_MENU },
    { field: "時間", quote: `"Fcode":"${item.fcode}","Name":"${item.title}","StartDate":"${item.start}","EndDate":"2026/09/19 23:59:59"`, url: KFC_API },
    { field: "資格", quote: "預訂快取(外帶)：不限訂購金額皆可預訂快取，歡迎多加運用！", url: KFC_FAQ },
  ],
  actionLabel: "查看KFC官方菜單",
  scope: "KFC台灣官網預訂快取（外帶）的官方菜單品項；不含外送、第三方平台、可選加購與台北車站B2店（FAQ列為不適用預訂快取）。",
  pricingContext: `price_total_twd採官方菜單頁顯示的$${item.price}，並與官方GetQueryFood API的Upa_Group=${item.price}交叉核對。mandatory_fees_twd=0限預訂快取外帶範圍：FAQ說快取不限訂購金額；本筆排除外送，未套用外送價與每單39元外送費。這是範圍化成本判定，不是官方「快取零費用」引文。`,
  reviewNotes: [
    "官方FAQ列預訂快取一般可取餐時間07:20–22:30，但各餐廳營業時間可能不同。",
    "API在查核時SoldOut=false僅是當時回應；不代表指定門市有即時庫存。",
    "外送每單39元且可能有不同價格；本筆不可用於估算外送或第三方平台到手價。",
    "成分與過敏原未完整核對，tags保持null。",
  ],
  extra: {
    local_or_online: "台灣參與預訂快取的KFC門市",
    kfc_fcode: item.fcode,
    api_snapshot: `.scratch/catalog-expansion/food/${item.apiFile}`,
    api_end_date: "2026/09/19 23:59:59",
    api_sold_out_at_check: false,
    pickup_hours_reference: "預訂快取(外帶)可取餐時間：早上07:20~晚上22:30",
    delivery_excluded: "外送服務每筆訂單需收取外送費$39，且價格與範圍可能不同。",
  },
}));

const mcdItems = [
  {
    id: "f_md01", title: "煙燻勁脆鷄腿堡", price: 99, priceUnit: "1個單點漢堡",
    quantity: "1個煙燻勁脆鷄腿堡單點",
    priceQuote: "「煙燻勁脆鷄腿堡」：單點 99 元；經典套餐 169 元。",
    portionQuote: "「煙燻勁脆鷄腿堡」：單點 99 元",
    timeQuote: "活動時間：自 9 月 2 日上午 10:30 起開賣。",
    availability: "自2026-09-02上午10:30起開賣；官方未明示每日停售時段",
  },
  {
    id: "f_md02", title: "肯瓊勁脆鷄腿堡", price: 99, priceUnit: "1個單點漢堡",
    quantity: "1個肯瓊勁脆鷄腿堡單點",
    priceQuote: "「肯瓊勁脆鷄腿堡」：單點 99 元；經典套餐 169 元。",
    portionQuote: "「肯瓊勁脆鷄腿堡」：單點 99 元",
    timeQuote: "活動時間：自 9 月 2 日上午 10:30 起開賣。",
    availability: "自2026-09-02上午10:30起開賣；官方未明示每日停售時段",
  },
  {
    id: "f_md03", title: "迷你 Q 紫薯", price: 59, priceUnit: "每份5入",
    quantity: "每份5入迷你 Q 紫薯",
    priceQuote: "「迷你 Q 紫薯」：每份 5 入；單點 59 元，套餐加購優惠價 50 元。",
    portionQuote: "「迷你 Q 紫薯」：每份 5 入",
    timeQuote: "活動時間：自 9 月 2 日至 9 月 22 日（或售完為止）。",
    availability: "2026-09-02至2026-09-22，或售完為止；沒有即時門市庫存證據",
    validUntil: "2026-09-22T23:59:59+08:00",
    notes: ["valid_until將官方只標日期的9月22日正規化為臺灣當日結束；『或售完為止』可能使商品更早停止供應。"],
  },
  {
    id: "f_md04", title: "6 塊辣味麥克鷄塊", price: 68, priceUnit: "6塊單點",
    quantity: "6塊辣味麥克鷄塊",
    priceQuote: "「6 塊辣味麥克鷄塊」：單點 68 元；經典套餐 138 元。",
    portionQuote: "「6 塊辣味麥克鷄塊」：單點 68 元",
    timeQuote: "活動期間：自 9 月 2 日上午 10:30 起至 10 月 20 日（或售完為止）。",
    availability: "2026-09-02上午10:30起至2026-10-20，或售完為止；沒有即時門市庫存證據",
    validUntil: "2026-10-20T23:59:59+08:00",
    notes: ["valid_until將官方只標日期的10月20日正規化為臺灣當日結束；『或售完為止』可能使商品更早停止供應。"],
  },
  {
    id: "f_md05", title: "炭燒醬烤鷄腿堡", price: 99, priceUnit: "1個單點漢堡",
    quantity: "1個炭燒醬烤鷄腿堡單點",
    priceQuote: "「炭燒醬烤鷄腿堡」：單點 99 元；經典套餐 169 元。",
    portionQuote: "「炭燒醬烤鷄腿堡」：單點 99 元",
    timeQuote: "活動時間：自 9 月 2 日上午 10:30 起開賣。",
    availability: "自2026-09-02上午10:30起開賣；官方未明示每日停售時段",
  },
  {
    id: "f_md06", title: "BLT 香烙烤鷄腿堡", price: 129, priceUnit: "1個單點漢堡",
    quantity: "1個BLT 香烙烤鷄腿堡單點",
    priceQuote: "「BLT 香烙烤鷄腿堡」：單點 129 元；經典套餐 199 元。",
    portionQuote: "「BLT 香烙烤鷄腿堡」：單點 129 元",
    timeQuote: "活動時間：自 9 月 2 日上午 10:30 起開賣。",
    availability: "自2026-09-02上午10:30起開賣；官方未明示每日停售時段",
  },
  {
    id: "f_md07", title: "藜麥香烙烤鷄沙拉", price: 159, priceUnit: "1份單點沙拉",
    quantity: "1份藜麥香烙烤鷄沙拉單點",
    priceQuote: "「藜麥香烙烤鷄沙拉」：單點 159 元；經典套餐 229 元。",
    portionQuote: "「藜麥香烙烤鷄沙拉」：單點 159 元",
    timeQuote: "活動時間：自 9 月 2 日上午 10:30 起開賣。",
    availability: "自2026-09-02上午10:30起開賣；官方未明示每日停售時段",
  },
  {
    id: "f_md08", title: "辣味四盎司牛肉堡", price: 92, priceUnit: "1個單點漢堡",
    quantity: "1個辣味四盎司牛肉堡單點；品名標示四盎司牛肉",
    priceQuote: "「辣味四盎司牛肉堡」單點92元，經典套餐162元。",
    portionQuote: "「辣味四盎司牛肉堡」單點92元",
    timeQuote: "HOT! 「辣味四盎司牛肉堡」、「辣味雙層四盎司牛肉堡」、「雙層麥香魚」5月27日起長期供應：",
    availability: "自2026-05-27起長期供應；官方公告未列每日停售時段",
    sourceUrl: MCD_20260519,
  },
];

const mcd = mcdItems.map((item) => {
  const sourceUrl = item.sourceUrl ?? MCD_20260831;
  return base({
    id: item.id,
    title: item.title,
    provider: "台灣麥當勞",
    price: item.price,
    priceUnit: item.priceUnit,
    quantity: item.quantity,
    availability: item.availability,
    validUntil: item.validUntil ?? null,
    sourceUrl,
    evidence: [
      { field: "價格", quote: item.priceQuote, url: sourceUrl },
      { field: "份量", quote: item.portionQuote, url: sourceUrl },
      { field: "時間", quote: item.timeQuote, url: sourceUrl },
    ],
    actionLabel: "查看麥當勞官方公告",
    scope: "台灣麥當勞參與餐廳的現場內用或外帶單點；不含歡樂送、第三方外送、套餐、優惠券、塑膠袋或其他可選加購。",
    pricingContext: `price_total_twd採官方新聞稿的單點${item.price}元。mandatory_fees_twd=0只適用於現場內用或外帶且不索取塑膠袋、不選可選加購的範圍；歡樂送、第三方外送與塑膠袋費用均排除。這是範圍化成本判定，不是官方零費用引文。`,
    reviewNotes: [
      "各餐廳可依現場營運與供應狀況調整；本筆沒有指定門市的即時庫存證據。",
      "官方未明示價格有效期限者valid_until保持null，使用前仍應再次核價。",
      "成分與過敏原未完整核對，tags保持null。",
      ...(item.notes ?? []),
    ],
    extra: {
      local_or_online: "台灣麥當勞參與餐廳現場內用或外帶",
      delivery_excluded: "歡樂送與第三方外送的售價及費用不在本筆範圍。",
    },
  });
});

const records = [...ikea, ...kfc, ...mcd];
if (records.length !== 36) throw new Error(`expected 36 records, got ${records.length}`);
if (new Set(records.map((record) => record.id)).size !== records.length) throw new Error("duplicate ids");
if (new Set(records.map((record) => `${record.provider}::${record.title}`)).size !== records.length) throw new Error("duplicate provider/title");

await writeFile("prototype-v1/data/live/食品-expansion.json", `${JSON.stringify(records, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ checkedAt, total: records.length, ikea: ikea.length, kfc: kfc.length, mcd: mcd.length }, null, 2));
