# ALL in life — 資料匯入規格（Data Ingestion Spec）

- 文件狀態：Hackathon MVP build spec
- 版本：v0.1
- 日期：2026-09-05
- 上游文件：[SPEC-backend.md](./SPEC-backend.md)（§6 schema、§6.2 匯入者規則）、[PRD-all-in-life.md](./PRD-all-in-life.md)（§9 資料與證據規則）
- 下游文件：[SPEC-geocoding.md](./SPEC-geocoding.md)（`address`／`lat`／`lng` 的取得）
- 詞彙：以 [CONTEXT.md](../CONTEXT.md) 為準

## 1. 摘要與範圍

SPEC-backend 從「資料已經在表裡」開始。本文件定義**資料怎麼進表**：要蒐集哪些候選紀錄、每一欄要填什麼、哪些欄位可以是 null、什麼情況下這筆資料不能進主要排序，以及匯入完怎麼驗收。

沒有這份資料，後端每一條路由都跑得動但畫面是空的（PRD 驗收條件 #5 要求五類各 7–10 筆通過證據閘門的紀錄）。

**包含**：匯入格式、欄位契約、可空規則、證據規則、`data_status` 判定、有效期與過期、衝突、匯入腳本與驗收檢查。
**不包含**：爬蟲怎麼寫、要爬哪些網站（由開發者依 §3 的數量目標自行決定）、座標解析（見 SPEC-geocoding.md）。

## 2. 流程

```
1. 人工／腳本蒐集  →  prototype-v1/data/<category>.json   （§4 欄位契約）
2. bun run scripts/import.ts                              （upsert 進 candidates，冪等）
3. bun run scripts/geocode.ts                             （只補 lat is null 的列；SPEC-geocoding）
4. bun run scripts/check-data.ts                          （§9 驗收檢查，不過就不算匯入完成）
```

三個腳本都可以重跑。`import.ts` 以 `id` 做 `on conflict (id) do update`；不刪任何列。

## 3. 要蒐集多少

| 類別 | 目標筆數 | paid／free 分佈 | 備註 |
|---|---|---|---|
| 食品 | 8–10 | 多數 paid | Demo 情境 A 走這一類，要有 2 人份、300 元內、步行 20 分鐘內的可行解 |
| 日用品 | 7–8 | 全部 paid | 至少 1 筆有 Costco 基準（§8） |
| 免費／公益資源 | 7–10 | 全部 free | Demo 情境 B；至少 2 筆有登記／資格條件 |
| 活動 | 7–10 | paid 與 free 都要有 | 同一類別要能示範免費／付費並存 |
| 交通 | 7–8 | 多數 paid | Demo 情境 C |

另外**刻意**準備這幾筆邊界資料（PRD 驗收條件 #11，缺一項就無法示範例外處理）：

- 1 筆 `price_total_twd = null`（未知價格）→ 應落在「待確認」，不進排序。
- 1 筆 `valid_until` 已過期 → 應標示過期、不進主要排序。
- 1 筆同一來源內部矛盾（同一 `field` 兩筆互斥 evidence）→ `data_status = '衝突待確認'`（§6.1）。
- 1 對同店不同來源的價格 → **兩筆各自 `已驗證` 的紀錄**，示範同一家店兩張卡片（§6.1）。
- 1 筆沒有 `address`（線上服務或電話申請）→ 顯示但不做距離篩選。
- 1 筆沒有 `baseline` → 詳情頁顯示「無足夠資料計算節省」。

## 4. 欄位契約

JSON 檔的 key 直接對應 `candidates` 的欄位名。**可空欄位不確定就填 `null`，不要填 0、不要填空字串、不要猜。**

| 欄位 | 型別 | 可空 | 規則 | 範例 |
|---|---|---|---|---|
| `id` | text | ✗ | 類別前綴 + 4 碼：`f_`食品／`d_`日用品／`r_`免費公益／`a_`活動／`t_`交通。決定後不可改（帳號清單存的是這個 id）。 | `f_a3k9` |
| `category` | text | ✗ | 五選一，見 schema check。 | `食品` |
| `agent` | text | ✗ | 直接費用為零且來源明說免費 → `free`；有價格 → `paid`。 | `paid` |
| `title` | text | ✗ | 抄來源原文名稱，不改寫。 | `雙人便當組合` |
| `provider` | text | ✗ | 商家／主辦單位／機關全名。 | `八方雲集 圓山店` |
| `price_total_twd` | int | ✔ | 商品／服務本身價格。**不知道填 null**。免費資源填 0。 | `260` |
| `mandatory_fees_twd` | int | ✗ | 必要費用（清潔費、報名費、低消）。**未知不可填 0** — 未知的話這筆整體標 `無法納入比較`。 | `0` |
| `discount_twd` | int | ✗ | 只有使用者確定符合條件的折扣才填。 | `0` |
| `price_unit` | text | ✔ | 單位說明。 | `每份` |
| `quantity_or_servings` | text | ✔ | 份量／人數原文。 | `2 人份，含兩份主餐` |
| `eligibility` | text[] | ✗（可空陣列 `[]`） | 資格條件，一條一個字串。需要 Costco 會員的填 `Costco 會員`（§8）。 | `["低收入戶","設籍本區"]` |
| `registration_required` | bool | ✗ | 需要事先報名／登記為 true。 | `false` |
| `availability_or_event_time` | text | ✔ | 營業時段／活動時間原文。 | `週六 10:00–12:00` |
| `valid_until` | timestamptz | ✔ | **來源明示的有效期限**（優惠到期日、活動結束日、公告有效期）。來源沒寫就 null（§7）。 | `2026-09-30T23:59:59+08:00` |
| `address` | text | ✔ | 來源原文地址，不改寫、不補行政區。線上服務為 null。有值時必須加一條 evidence 並設 `extra.address_source = "source"`。 | `臺北市大同區酒泉街…` |
| `lat` / `lng` | float | ✔ | **匯入者不填，一律 null**，由 `scripts/geocode.ts` 寫入。 | `null` |
| `distance_or_time_text` | text | ✔ | 來源自己寫的距離／時間文字，原樣顯示。 | `捷運圓山站步行 5 分鐘` |
| `tags` | text[] | ✔ | 成分標籤，取自 `TAGS`（牛／豬／雞／海鮮／辣／素／含酒精）。**成分未標示填 null，不要填 `[]`** — `[]` 代表「確認不含任何一項」，null 代表「不知道」，排除項目的判斷不同。 | `["豬","雞"]` |
| `source_url` | text | ✗ | 可公開存取的原始頁面。 | `https://…` |
| `source_type` | text | ✗ | `curated`（人工整理）／`web-searched`。 | `curated` |
| `source_authority` | text | ✗ | `official`（政府／主辦官方）／`provider`（商家自己）／`public`（媒體、社群轉載）／`other`。 | `provider` |
| `evidence` | jsonb[] | ✗ | 見 §5。 | 見下 |
| `collected_at` | timestamptz | ✗ | 蒐集當下時間。 | `2026-09-05T14:00:00+08:00` |
| `verified_at` | timestamptz | ✔ | 人工核對過原始頁面的時間。沒核對過就 null，且 `data_status` 不得為 `已驗證`。 | 同上 |
| `data_status` | text | ✗ | 依 §6 決策表判定。 | `已驗證` |
| `action_url` | text | ✔ | 外部可執行動作連結（訂購、報名、公告）。 | `https://…` |
| `action_label` | text | ✔ | 動作按鈕文字。 | `線上訂購` |
| `baseline` | jsonb | ✔ | `{name, total_twd, basis, as_of}`，`basis` 三選一：`user_plan`／`local_common`／`costco`。沒有同份量的可比基準就填 null（§8）。 | 見下 |
| `group_offer` | jsonb | ✔ | `{min_people, discount_pct?, price_per_person?, redeem_code, note}`。`redeem_code` 是商家到店驗證用的兌換碼，平台不追蹤成員。 | 見下 |
| `extra` | jsonb | ✗（可空物件 `{}`） | 類別特有零碎欄位、`address_source`、`place_id`（後兩者由 geocode 腳本寫）。 | `{"address_source":"source"}` |

## 5. 證據規則（`evidence`）

每一筆 `{field, quote, url, checked_at}`：

- `field`：這條摘錄支持哪一個欄位，用欄位中文名：`價格`、`份量`、`資格`、`時間`、`地點`。
- `quote`：**抄原文，一到兩句**，不改寫、不翻譯、不摘要成自己的話（PRD §9.6：不大量複製來源頁面）。
- `url`：這句話出現的頁面（可以和 `source_url` 不同）。
- `checked_at`：看到這句話的時間。

**必要摘錄**：只要這筆要進主要排序（`data_status = '已驗證'`），`價格`、`份量`、`時間` 三個 field 各至少一條；有 `eligibility` 時再加 `資格`；有 `address` 時再加 `地點`。

**衝突**：同一個 `field` 放兩筆，代表**同一個來源自己前後矛盾**（見 §6.1）。不同來源不會出現在同一筆紀錄裡。

## 6. `data_status` 決策表

由上往下，第一個成立的就是答案：

| 條件 | `data_status` | 後果 |
|---|---|---|
| `price_total_twd` 為 null，或必要費用未知 | `無法納入比較` | 不進閘門，只出現在「待確認」 |
| 同一來源內部矛盾（同一 `field` 兩筆互斥的 evidence，見 §6.1） | `衝突待確認` | 不進主要排序，卡片並列顯示兩筆 |
| `valid_until` 已過（匯入當下） | `過期／待確認` | 同上；卡片標示過期時間 |
| `verified_at` 為 null，或 §5 的必要摘錄不齊 | `部分驗證／待確認` | 同上 |
| 以上皆非 | `已驗證` | 進第一階段篩選與 LLM 推薦排序 |

只有 `已驗證` 會進主要排序（SPEC-backend §6.2）。

### 6.1 一個來源一筆紀錄

**規則：來源不同就是不同的候選紀錄。** 同一家店在兩個網站看到兩個價格 → 建兩筆，各自的 `id`、`source_url`、`source_authority`、`evidence`、`price_total_twd`；`provider` 相同，`title` 要寫得出差別（`雙人便當組合（官網）` / `雙人便當組合（外送平台）`）。兩筆都可以是 `已驗證`，各自進排序、各自被比價，使用者在同一個分頁會看到同一家店的兩張卡片。

不做跨來源的合併、比對或取捨。理由與取捨見 [ADR 0002](./adr/0002-one-source-one-record.md)。

**每張卡片都帶著自己的 `source_url`、`source_authority` 與 evidence 摘錄**，所以兩個價格不一樣時，使用者看得到「這個數字是誰說的、什麼時候看到的」，由使用者自己判斷要相信哪一個。這是這條規則成立的前提 — §5 的必要摘錄不能省。

`衝突待確認` 這個狀態保留給**同一個來源自己前後矛盾**的情況：

> 區公所公告標題寫「親子共餐免費入場」，內文卻寫「每人酌收清潔費 100 元」。

這種時候同一個 `field` 放兩筆 evidence（都來自同一個 `source_url`），`data_status = '衝突待確認'`，不進主要排序 — 因為連來源自己都沒講清楚，拆成兩筆等於憑空造出兩個方案。

## 7. 有效期與過期（`valid_until`）

價格常常是有期限的優惠。規則：

- 來源明寫期限（「即日起至 9/30」、「活動至 10/15」、「公告有效期一年」）→ 換算成絕對時間存進 `valid_until`。
- 來源沒寫 → `null` = 沒有明示期限，不因時間經過而過期。**不要自己猜一個期限。**
- **搜尋當下**由伺服器判斷：`valid_until` 不為 null 且 `< now()` → 這筆視同 `過期／待確認`，退出主要排序、落到「待確認」清單。這是查詢時計算，不是靠人去改資料庫。
- 卡片顯示：未過期且有 `valid_until` → 「有效至 2026-09-30」；已過期 → 「優惠已於 2026-09-30 到期，僅供參考」。

這對應 PRD §9.4「同時記錄頁面／公告上的有效時間」與 FR-13「過期資料仍可作為線索，但要標示過期」。

## 8. Costco 與比較基準（`baseline`）

`settings.costco_ok` 是「我有 Costco 會員」的開關，不是顯示偏好：

- **開啟**：需要會員的候選（`eligibility` 含 `Costco 會員`）可以進排序；`basis = "costco"` 的基準可以拿來算節省。
- **關閉（預設）**：這兩種都拿掉 — 使用者沒有會員，買不到的東西不該出現在推薦裡，用買不到的價格算出來的節省也是假的。

匯入者要做的：需要會員才能買的商品，`eligibility` 一定要放 `Costco 會員`；拿 Costco 價當基準時 `baseline.basis` 填 `costco`。

沒有同份量、同內容的可比方案時 `baseline` 填 **null** — 前端會顯示「無足夠資料計算節省」（PRD FR-11：不得虛構金額／比例）。

## 9. 驗收檢查（`scripts/check-data.ts`）

匯入完成的定義 = 這支腳本全過。它讀資料庫並逐條 assert：

1. 五類各 ≥ 7 筆，且各類 `data_status = '已驗證'` 的 ≥ 7 筆。
2. 每筆 `已驗證` 的紀錄，§5 的必要摘錄都在。
3. 沒有 `price_total_twd = 0` 但 `agent = 'paid'` 的列（0 元卻標付費 = 填錯）。
4. 沒有 `tags = '{}'` 卻在 `evidence` 裡看得到成分描述的列（提醒填 null 或填實際標籤）。
5. `lat` 不為 null 的列，座標落在台灣範圍（21.5–25.5, 118–122.5）。
6. §3 的五筆邊界資料都存在（各以一句 SQL 確認）。
7. 每個 `source_url` 都是 https。

失敗就印出 `id` 與原因，`process.exit(1)`。

## 10. 範例（三筆完整資料）

```json
[
  {
    "id": "f_a3k9",
    "category": "食品", "agent": "paid",
    "title": "雙人便當組合", "provider": "八方雲集 圓山店",
    "price_total_twd": 260, "mandatory_fees_twd": 0, "discount_twd": 0,
    "price_unit": "每組", "quantity_or_servings": "2 人份，含兩份主餐與湯",
    "eligibility": [], "registration_required": false,
    "availability_or_event_time": "每日 11:00–20:30",
    "valid_until": "2026-09-30T23:59:59+08:00",
    "address": "臺北市大同區酒泉街 45 號", "lat": null, "lng": null,
    "distance_or_time_text": "捷運圓山站步行 5 分鐘",
    "tags": ["豬", "雞"],
    "source_url": "https://example.com/menu", "source_type": "curated", "source_authority": "provider",
    "evidence": [
      {"field": "價格", "quote": "雙人組合餐 260 元（9/30 前）", "url": "https://example.com/menu", "checked_at": "2026-09-05T14:00:00+08:00"},
      {"field": "份量", "quote": "含兩份主餐、兩碗湯", "url": "https://example.com/menu", "checked_at": "2026-09-05T14:00:00+08:00"},
      {"field": "時間", "quote": "營業時間 11:00–20:30", "url": "https://example.com/menu", "checked_at": "2026-09-05T14:00:00+08:00"},
      {"field": "地點", "quote": "臺北市大同區酒泉街 45 號", "url": "https://example.com/menu", "checked_at": "2026-09-05T14:00:00+08:00"}
    ],
    "collected_at": "2026-09-05T14:00:00+08:00", "verified_at": "2026-09-05T14:00:00+08:00",
    "data_status": "已驗證",
    "action_url": "https://example.com/order", "action_label": "線上訂購",
    "baseline": {"name": "同商圈兩人份便當常見價", "total_twd": 320, "basis": "local_common", "as_of": "2026-09-05"},
    "group_offer": {"min_people": 4, "discount_pct": 15, "redeem_code": "AIL-BX4", "note": "四人以上到店出示兌換碼"},
    "extra": {"address_source": "source"}
  },
  {
    "id": "r_77x1",
    "category": "免費／公益資源", "agent": "free",
    "title": "社區共餐（週六）", "provider": "圓山區公所",
    "price_total_twd": 0, "mandatory_fees_twd": 0, "discount_twd": 0,
    "price_unit": null, "quantity_or_servings": "每人一份",
    "eligibility": ["設籍本區", "65 歲以上或低收入戶"], "registration_required": true,
    "availability_or_event_time": "每週六 11:30–13:00",
    "valid_until": null,
    "address": null, "lat": null, "lng": null,
    "distance_or_time_text": null,
    "tags": ["素"],
    "source_url": "https://gov.example.tw/notice", "source_type": "curated", "source_authority": "official",
    "evidence": [
      {"field": "價格", "quote": "共餐免費，不收取任何費用", "url": "https://gov.example.tw/notice", "checked_at": "2026-09-05T14:10:00+08:00"},
      {"field": "份量", "quote": "每人一份餐盒", "url": "https://gov.example.tw/notice", "checked_at": "2026-09-05T14:10:00+08:00"},
      {"field": "時間", "quote": "每週六 11:30 至 13:00", "url": "https://gov.example.tw/notice", "checked_at": "2026-09-05T14:10:00+08:00"},
      {"field": "資格", "quote": "設籍本區且年滿 65 歲或持低收入戶證明者", "url": "https://gov.example.tw/notice", "checked_at": "2026-09-05T14:10:00+08:00"}
    ],
    "collected_at": "2026-09-05T14:10:00+08:00", "verified_at": "2026-09-05T14:10:00+08:00",
    "data_status": "已驗證",
    "action_url": "https://gov.example.tw/apply", "action_label": "電話報名",
    "baseline": null, "group_offer": null,
    "extra": {}
  },
  {
    "id": "a_5m2c",
    "category": "活動", "agent": "paid",
    "title": "親子共餐體驗", "provider": "圓山親子館",
    "price_total_twd": 100, "mandatory_fees_twd": 0, "discount_twd": 0,
    "price_unit": "每人", "quantity_or_servings": "每場限 20 人",
    "eligibility": [], "registration_required": true,
    "availability_or_event_time": "週六 10:00–12:00",
    "valid_until": null,
    "address": "臺北市中山區玉門街 1 號", "lat": null, "lng": null,
    "distance_or_time_text": null,
    "tags": null,
    "source_url": "https://gov.example.tw/event", "source_type": "curated", "source_authority": "official",
    "evidence": [
      {"field": "價格", "quote": "親子共餐免費入場", "url": "https://gov.example.tw/event", "checked_at": "2026-09-05T14:20:00+08:00"},
      {"field": "價格", "quote": "每人酌收清潔費 100 元", "url": "https://gov.example.tw/event", "checked_at": "2026-09-05T14:20:00+08:00"},
      {"field": "份量", "quote": "每場限額 20 人", "url": "https://gov.example.tw/event", "checked_at": "2026-09-05T14:20:00+08:00"},
      {"field": "時間", "quote": "週六 10:00 至 12:00", "url": "https://gov.example.tw/event", "checked_at": "2026-09-05T14:20:00+08:00"}
    ],
    "collected_at": "2026-09-05T14:20:00+08:00", "verified_at": "2026-09-05T14:20:00+08:00",
    "data_status": "衝突待確認",
    "action_url": "https://gov.example.tw/event", "action_label": "查看公告",
    "baseline": null, "group_offer": null,
    "extra": {}
  }
]
```

第三筆示範 §6.1 的衝突：**同一個 `source_url`** 的標題寫「免費入場」、內文寫「每人清潔費 100 元」，來源自己前後矛盾 → 標 `衝突待確認`，同一個 `field: "價格"` 放兩筆 evidence，卡片並列顯示，不進主要排序。

對照「來源不同 → 兩筆紀錄」，同一家店的兩個來源寫成兩筆獨立紀錄（只列會不同的欄位）：

```json
[
  {"id": "f_a3k9", "provider": "八方雲集 圓山店", "title": "雙人便當組合（官網）",
   "price_total_twd": 260, "source_url": "https://example.com/menu", "source_authority": "provider",
   "availability_or_event_time": "每日 11:00–20:30", "data_status": "已驗證"},

  {"id": "f_a3ka", "provider": "八方雲集 圓山店", "title": "雙人便當組合（外送平台）",
   "price_total_twd": 299, "mandatory_fees_twd": 39, "source_url": "https://delivery.example.com/shop",
   "source_authority": "provider", "availability_or_event_time": "每日 11:00–20:00", "data_status": "已驗證"}
]
```

兩筆各自進排序、各自被比價；使用者在食品分頁會看到同一家店的兩張卡片，一張 260、一張 338（299 + 39 外送費），各自標著自己的來源與摘錄。不要合併、不要挑一個丟掉。

## 11. 不在範圍

- 自動爬蟲、排程更新：Demo 前的資料是一次性人工匯入。
- 授權談判：只收 PRD §9.6 允許的公開資料與可核對來源。
- 資料過期後的自動重新驗證：`valid_until` 到期只會讓紀錄退出主要排序，沒有人自動去重抓。
