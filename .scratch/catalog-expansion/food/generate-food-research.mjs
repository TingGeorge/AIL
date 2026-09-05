import { readFile, writeFile } from "node:fs/promises";

const records = JSON.parse(await readFile("prototype-v1/data/live/食品-expansion.json", "utf8"));
const checkedAt = records[0]?.verified_at;
const byPrefix = (prefix) => records.filter((record) => record.id.startsWith(prefix));
const money = (value) => `NT$${value}`;
const valid = (record) => record.valid_until ? `${record.valid_until}${record.availability_or_event_time.includes("售完") ? "（或提前售完）" : ""}` : "來源未明示價格期限";
const table = (items) => [
  "| ID | 官方原文品項／SKU | 價格 | 份量紀錄 | 可用時間／期限 |",
  "|---|---|---:|---|---|",
  ...items.map((record) => `| \`${record.id}\` | ${record.title.replaceAll("|", "\\|")} | ${money(record.price_total_twd)} | ${record.quantity_or_servings.replaceAll("|", "\\|")} | ${(record.valid_until ? valid(record) : record.availability_or_event_time).replaceAll("|", "\\|")} |`),
].join("\n");

const md = `# 食品資料擴充研究紀錄（expansion-2026-09-05）

## 結果摘要

- 寫入候選檔：\`prototype-v1/data/live/食品-expansion.json\`
- 新增：**36 筆**，恰好符合任務數量。
- 來源業者：**3 家**（IKEA、KFC 肯德基台灣、台灣麥當勞）。
- 分布：IKEA 內湖店瑞典餐廳 18 筆、KFC 台灣預訂快取 10 筆、台灣麥當勞 8 筆。
- 查核時間：\`${checkedAt}\`（Asia/Taipei）。
- 離線結果：\`prepareCandidate\` 36/36、\`truthfullyVerified\` 36/36、\`assessCatalog.issues=[]\`、\`ready=true\`。
- 所有 \`group_offer\` 均為 \`null\`：雙人餐、桶餐、禮盒與多入品項只代表商品份量，不能自動解讀為有最低人數條件的團購折扣；本批來源沒有同時證成真實折扣、\`min_people\` 與兌換碼。

## 研究與證據原則

1. 僅採官方業者網站、官方新聞稿及官方 API；不以搜尋摘要、部落格或外送平台作為資料證據。
2. \`evidence.quote\` 全部是本次官方頁面文字或 API 回應中可逐字找到的短摘錄。價格乘法、時段交集、期限正規化及費用範圍判定只寫在 \`extra.pricing_context\`、\`extra.review_notes\` 或本文件，沒有偽裝成引文。
3. 每筆只有一個「價格」、一個「份量」、一個「時間」證據；IKEA 與 KFC 另各有一個資格／使用條件證據，因此沒有同欄重複造成的自相衝突。
4. \`mandatory_fees_twd: 0\` 都有嚴格 scope：只涵蓋現場單點或 KFC 預訂快取外帶，排除外送、第三方平台、會員優惠、塑膠袋與可選加購。這是成本範圍判定，不是「業者保證零費用」的引文。
5. 地址、座標、過敏原及未明示的運費／重量不猜測：\`address\`、\`lat\`、\`lng\` 為 \`null\`，\`tags\` 為 \`null\`；來源未標示件數或克數時，\`quantity_or_servings\` 直接註明未知。

## 官方來源對照

| 官方來源 | 支持的 IDs | 核對內容 | 限制／確認方式 |
|---|---|---|---|
| [IKEA 瑞典餐廳菜單](https://www.ikea.com.tw/zh/ikea-food/restaurant) | \`f_ik01\`–\`f_ik18\` | 品項原文名稱、一般價格、配餐／入數、早餐時段、香菜小龍蝦沙拉罐銷售區間 | 官方明示「餐點供應依各分店現場為主」；實際庫存需向內湖店確認。鮮蔥肋眼牛排採一般價429元，不採9月卡友價369元。 |
| [IKEA 內湖店](https://www.ikea.com.tw/zh/store/nei-hu/index) | \`f_ik01\`–\`f_ik18\` | 瑞典餐廳營業時間、晚間供餐截止、免訂位文字 | 早餐可用時段是菜單09:00–10:30與內湖店營業時間的交集；交集是推導，不放入 quote。 |
| [KFC 官方菜單](https://www.kfcclub.com.tw/menu?menuId=2) | \`f_kf01\`–\`f_kf10\` | 頁面實際顯示的品項名稱與價格 | 菜單瀏覽價按「預訂快取外帶」scope使用；不得沿用到外送或第三方平台。 |
| [KFC GetQueryFood 官方 API](https://olo-api.kfcclub.com.tw/menu/v1/GetQueryFood) | \`f_kf01\`–\`f_kf10\` | \`Fcode\`、\`Name\`、\`StartDate\`、\`EndDate\`、\`Upa_Group\`、\`SoldOut\`、部分圖片檔名份量 | API 是 POST；回應快照按 menu ID 保存在 scratch。\`SoldOut=false\` 只代表查核回應，不代表指定門市的即時庫存。 |
| [KFC FAQ](https://olo.kfcclub.com.tw/customerService/FAQ) | \`f_kf01\`–\`f_kf10\` | 預訂快取不限訂購金額、一般可取餐07:20–22:30、外送每單39元、台北車站B2不適用快取 | 各門市取餐時間仍受實際營業時間限制；本批明確排除外送價與39元外送費。 |
| [台灣麥當勞 2026-08-31 新聞稿](https://www.mcdonalds.com/tw/zh-tw/newsroom/2026/20260831.html) | \`f_md01\`–\`f_md07\` | 兩款勁脆鷄腿堡、迷你 Q 紫薯、辣味麥克鷄塊、三款香烙烤鷄腿系列的單點價、份量、上市日與期限 | 迷你 Q 紫薯與辣味麥克鷄塊均「或售完為止」；沒有門市即時庫存證據。 |
| [台灣麥當勞 2026-05-19 新聞稿](https://www.mcdonalds.com/tw/zh-tw/newsroom/2026/20260519.html) | \`f_md08\` | 辣味四盎司牛肉堡單點價與5月27日起長期供應 | 不含套餐、歡樂送、第三方外送、塑膠袋或可選加購。 |

## IKEA 內湖店瑞典餐廳（18 筆）

${table(byPrefix("f_ik"))}

### IKEA 價格、時段與限制

- 一般現場菜單價直接寫入 \`price_total_twd\`；沒有把單價乘法或推測的服務費寫入 quote。
- 早餐兩筆：菜單逐字時段是09:00–10:30；內湖店週一至週五10:00開店、週末09:00開店，因此資料欄位以兩來源交集說明平日10:00–10:30、週末09:00–10:30。
- 其餘品項：內湖店瑞典餐廳週一至週五10:00–21:00、週末09:00–21:00，晚上供餐至20:30；每筆仍揭露現場供應限制。
- 香菜小龍蝦沙拉罐官方只標到2026-09-16，資料將 \`valid_until\` 正規化為 \`2026-09-16T23:59:59+08:00\`，不代表保證供應到當晚。
- 鮮蔥肋眼牛排使用一般價429元；卡友價369元需要會員且僅見於9/1–9/30促銷，因此沒有混入本筆。

## KFC 台灣預訂快取（10 筆）

${table(byPrefix("f_kf"))}

### KFC 價格、外帶／外送差異與 API 核對

- 每筆官方菜單顯示價都與 API \`Upa_Group\` 相同；JSON 的價格 quote 使用官方菜單頁實際可見文字，時間 quote 使用同一品項 API 物件中的 \`StartDate\`／\`EndDate\` 原始鍵值。
- 本批 scope 只限「預訂快取（外帶）」。FAQ 對外送另明示每單39元，且外送服務有送餐範圍；因此外送價、外送費與第三方平台價格完全排除。
- FAQ 明示預訂快取不限訂購金額；\`mandatory_fees_twd: 0\` 是在排除外送與可選加購後的範圍化判定，不把「快取免費」寫成假引文。
- 10筆 API \`EndDate\` 均為2026-09-19 23:59:59，故 \`valid_until\` 使用官方精確秒數；到期後不得繼續當成已驗證。
- \`咔啦脆雞\`、\`雙色轉轉QQ球\` 的官方頁與 API 未標示塊數／球數或重量，資料如實註明未知；沒有依品名猜數量。
- \`咔啦爆脆雞(不辣)\`、青花椒花生蛋撻與雙色蛋撻禮盒的份量使用官方 API 圖片檔名中的「1塊」、「單顆」、「x3+x3」文字。

## 台灣麥當勞（8 筆）

${table(byPrefix("f_md"))}

### 麥當勞價格、期限與門市限制

- 直接採官方新聞稿列出的單點價格，不採套餐價、加購價或優惠價。
- \`迷你 Q 紫薯\` 是每份5入；\`6 塊辣味麥克鷄塊\` 是6塊。其他漢堡／沙拉只記一個官方單點品項，不自行換算雙人份。
- 迷你 Q 紫薯至2026-09-22、辣味麥克鷄塊至2026-10-20，兩者都可能提前售完；\`valid_until\` 的23:59:59只是將官方日期正規化為臺灣當日結束。
- 其餘品項的官方稿寫明起售或長期供應但沒有價格有效期限，因此 \`valid_until: null\`，使用前仍需重新核價。
- scope 為台灣參與餐廳現場內用／外帶單點，不含歡樂送、第三方外送、套餐、塑膠袋與可選加購；沒有把外送或袋費寫成0。

## 逐字 quote 自查

離線工具 \`.scratch/catalog-expansion/food/validate-food-expansion.ts\` 會依證據 URL 對照下列官方頁／API 快照，逐筆執行 \`source.includes(evidence.quote)\`：

- \`.scratch/catalog-expansion/food/ikea-restaurant-clean.txt\`
- \`.scratch/catalog-expansion/food/ikea-neihu-index-clean.txt\`
- \`.scratch/catalog-expansion/food/kfc-menu-browser-body.txt\`
- \`.scratch/catalog-expansion/food/kfc-faq-clean.txt\`
- \`.scratch/catalog-expansion/food/kfc-food-2.json\`
- \`.scratch/catalog-expansion/food/kfc-food-184.json\`
- \`.scratch/catalog-expansion/food/kfc-food-5.json\`
- \`.scratch/catalog-expansion/food/mcdonalds-20260831-browser-body.txt\`
- \`.scratch/catalog-expansion/food/mcdonalds-20260519-browser-body.txt\`

本次結果：**136個證據摘錄全部逐字命中，0個quote不匹配**；檢查亦拒絕 quote 中出現「官網價格×…」、「無服務費」、「零附加費」或「供應交集」等推論措辭。

## 離線驗證

執行方式（沒有資料庫寫入，也沒有跑完整 test suite）：

\`\`\`bash
bun run .scratch/catalog-expansion/food/validate-food-expansion.ts
\`\`\`

結果：

- 候選數：36
- \`prepareCandidate\`：36/36
- \`truthfullyVerified\`：36/36
- ID 與既有 \`食品.json\` 重疊：0
- 同業者／同品名重複：0
- 非 null \`group_offer\`：0
- \`assessCatalog\`：\`issues=[]\`、\`rankable=36\`、\`pending=0\`、\`ready=true\`

## 主流程匯入前仍應注意

1. KFC 10筆在2026-09-19 23:59:59到期；主流程若在期限後匯入，應重新查官方 API，而不是保留「已驗證」。
2. IKEA 與麥當勞皆沒有指定門市即時庫存；限量品可能提前售完。
3. 本批沒有地址與官方座標證據，不能在整合時自行補猜測座標。
4. 本批沒有完整過敏原查核，不能把 \`tags: null\` 改成空陣列或推定安全。
5. 多人、雙人、桶裝、禮盒只是商品規格；除非後續有官方真實折扣條件、最低人數與兌換資訊，不得補成 \`group_offer\`。
`;

await writeFile("docs/research/food-expansion-2026-09-05.md", md, "utf8");
console.log(`wrote research md with ${records.length} records`);
