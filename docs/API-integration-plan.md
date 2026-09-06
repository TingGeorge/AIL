# ALL IN LIFE API 串接規劃

## 目前狀態

手機 App 的 catalog、AI 與帳號資料層都已接上 runtime。`mvp/.openai/hosting.json` 宣告 D1 binding `DB`；本機 `dev`、`dev:lan` 與 `start` 會由 npm pre-script 自動執行 `data:bootstrap:local`，依序套用核心 migration、最新官方 seed、AI 限流與帳號 migration 到 `.wrangler/state`。正式 build 會把來源 migration 整理成 6 份部署 migration，並檢查 catalog seed 與帳號 migration 的順序。

主搜尋以 `POST /api/catalog/search` 傳送分類、位置、距離、所選時刻與模式；分類、距離、時刻、模式或有效位置改變時會重新查詢。使用 POST 是為了避免把精確位置參數放在 URL，GET 版本仍保留供手動檢查。帳號 API 已提供註冊、登入、登出、目前使用者與個人狀態讀寫；本機端到端測試已確認重新整理後資料可還原、登出後 token 立即得到 401。公開基準版可直接開啟，但本分支的 production 帳號 migration 尚待重新部署與 smoke test。

API 優先讀 D1；binding 未配置或 D1 查詢失敗時回退版本庫內的官方 snapshot，並以 `source`、`fallback` 與 `warnings` 明確揭露。DEMO 固定情境與正式模式完全分流；正式模式若整個 API request 失敗，會顯示錯誤而不自動混入 fixture。真實候選少於 3 筆時，前端可在獨立的 DEMO 補充區顯示固定情境，且不計入真實筆數。D1 catalog 只選最新一筆 `COMPLETED` import run 中狀態為 `IMPORTED` 的項目，避免較舊批次殘留資料重新出現。

這些資料仍不是店家即時商業 feed，不能宣稱菜單價格、庫存、餐館營業狀態或優惠是即時資訊；YouBike 即時 assertion 也只有五分鐘有效期。文件曾提到的 `Yuanshan_APP_AI_Database_Design.xlsx` 並未收錄在儲存庫，不能視為可重現來源。

## 建議架構

```text
手機 PWA
  ├─ POST /api/catalog/search
  ├─ POST /api/v1/search/parse
  ├─ POST /api/v1/results/explain
  └─ /api/auth/* + /api/me/data
Cloudflare Worker API
  ├─ 需求解析：文字／語音 → 同一份 SearchConstraints
  ├─ Hard Filter：日期、時段、預算、人數、距離、排除
  ├─ Evidence Gate：來源、確認日、衝突、過期
  ├─ Cost Engine：直接費用＋必要費用＋交通＋人均
  ├─ CP Engine：可行候選才進排序
  └─ D1：catalog、evidence、AI rate limit、帳號 session 與個人狀態
       ↓
官方／合作資料 API 與受控更新工作
```

AI 已用於「把自然語言轉成結構化條件」與「從允許的事實代碼中挑選推薦理由」，不會自行產生店名、價格、營業時間或優惠。

## OpenAI Agent 與金鑰放置

這裡應串接 **OpenAI Responses API**，而不是把「Codex」直接當成瀏覽器端 API。兩個獵人共用同一個後端 API client，但使用不同 developer instructions：

- CP 值獵人：只對已通過 Evidence Gate 與硬限制的付費候選產生排序理由。
- 零元獵人：只對直接費用為零的候選說明資格、開放時間與必要成本。
- 最終分數、排斥標籤與排序仍由 deterministic code 計算；模型不可改寫價格、距離或營業事實。

正式 OpenAI Sites 環境請在網站的「更多動作 → 設定 → 環境變數」新增 `OPENAI_API_KEY`（開啟「秘密」）與 `OPENAI_MODEL=gpt-5.6-luna`（一般值），然後重新部署核准版本。

本機開發可建立 `mvp/.dev.vars`：

```dotenv
OPENAI_API_KEY=請貼上自己的金鑰
OPENAI_MODEL=gpt-5.6-luna
```

`mvp/.dev.vars` 已列入 `.gitignore`，不可提交。前端 React 元件不得讀取或輸出此金鑰；只能呼叫同源的 `/api/v1/search/parse` 與 `/api/v1/results/explain`，再由 Worker 讀取 `env.OPENAI_API_KEY`。Responses API 的 strict structured output 用於條件解析與理由代碼選擇：[OpenAI Responses API 官方文件](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)。

## 目前 API 與後續拆分

| 狀態 | Method | Path | 用途 |
| --- | --- | --- | --- |
| 已落地 | `POST` | `/api/v1/search/parse` | 將文字或語音逐字稿轉成可編輯限制；失敗時保留手動欄位 |
| 已落地 | `POST` | `/api/v1/results/explain` | 只依候選 ID 由伺服器重查事實，產生推薦理由代碼 |
| 已落地 | `POST` | `/api/auth/register`、`/api/auth/login` | 建立／驗證生活帳號並回傳 30 分鐘 bearer session |
| 已落地 | `GET`／`POST` | `/api/auth/me`、`/api/auth/logout` | 取得目前帳號或撤銷 session |
| 已落地 | `GET`／`PUT` | `/api/me/data` | 讀取／保存登入者最多 750 KB 的個人狀態 envelope |
| 下一階段 | `GET/PATCH` | `/api/v1/profile` | 把 envelope 拆成暱稱、頭像、預算與偏好領域欄位 |
| 下一階段 | `GET/POST` | `/api/v1/lists` | 建立、讀取及分享清單，加入併發版本 |
| 下一階段 | `GET` | `/api/v1/analytics` | 依月份與類別彙總花費、節省、人均與使用頻率 |
| 下一階段 | `GET/POST` | `/api/v1/teams/:teamId/campaigns` | 建團、加入、取消與門檻；不付款、不代訂 |
| 下一階段 | `POST` | `/api/v1/reports` | 提交價格、營業、停業或優惠失效回報，先進 moderation |

## 已落地的 catalog API

| Method | Path                      | 目前行為                                                                                                                                 |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/catalog/search`     | 主搜尋 UI 使用；JSON body 接受 `category`、`lat`、`lng`、`radiusM`、`at`、`eventWindowDays`、`freeOnly`、`limit`，避免精確位置出現在 URL |
| `GET`  | `/api/catalog/search`     | 保留供手動檢查；接受與 POST 相同欄位的 query parameters                                                                                  |
| `GET`  | `/api/catalog/categories` | 以相同 D1／snapshot fallback 規則回傳類別筆數、資料來源與同步時間                                                                        |

catalog 的 `DAILY_GOODS`（日用品）只納入 provider 為 `TAIPEI_PHARMACY` 的官方藥局。友善店家清冊仍會下載及留下來源／拒絕稽核，但因資料只證明友善設施、不能證明零售業態，不會建立成 `STORE` 或日用品候選。活動預設查所選 `at` 起 7 天（可用 `eventWindowDays` 設定 1–30 天），條件為 `endsAt > at` 且 `startsAt < windowEnd`，並以 `CURRENT`／`UPCOMING` 區分進行中與即將開始；已結束場次不會混入。官方來源未提供可信價格時，API 回 `UNKNOWN`／`null`，UI 顯示「價格待確認」與「CP 待價格」，不會當成免費候選。

每個 catalog item 另帶 `verification.status`、`verification.label` 與 `verification.fields`。勾勾只用於 evidence 足以支撐的地點或活動；例如「地點已驗證」不等於價格、營業或庫存已驗證。DEMO 模擬項目沒有驗證勾勾，已核對官方事實的展示項目則標為「已驗證範例」。

## `SearchConstraints` 契約

```ts
type SearchConstraints = {
  query: string;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:mm
  category: "FOOD" | "DAILY_GOODS" | "FREE_RESOURCE" | "EVENT" | "TRANSPORT" | null;
  budgetTwd: number | null;
  partySize: number | null; // 1–10
  maxDistanceM: number | null; // 500–2000
  hardExclusions: string[];
  softPreferences: string[];
  mobility: Array<"WALK" | "BIKE" | "TRANSIT" | "CAR" | "TAXI">;
};
```

文字輸入與語音輸入只能改變 `query` 的來源，兩者最後都必須顯示同一份可編輯的 `SearchConstraints`，由使用者確認後才搜尋。

## 外部資料來源優先順序

1. 官方開放資料與官方網站：北美館、孔廟、花博、臺北捷運、公車、YouBike。
2. 店家或合作方提供的菜單、優惠與營業資料。
3. Google Places：地點 ID、地址、座標與營業狀態；只保存條款允許的欄位。
4. 社群回報：一律先進入 `PENDING`，不可直接覆蓋官方或店家資料。

## 即時交通與全家地圖策略（2026-09-05）

不搜尋、共用或提交網路上他人洩漏的 API key。優先使用官方明確開放且免金鑰的資料；需要認證時，只使用本專案自行申請的憑證，並存放在 Sites 的 server-side secrets。

| 資料                 | 官方來源                                                                                                             | 認證                       | 建議刷新與呈現                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| YouBike 2.0          | [臺北市 YouBike 即時資料](https://data.taipei/dataset/detail?id=c6bc8aed-557d-41d5-bfb1-8da24f78f2fb)                | 免 key                     | 官方每分鐘更新；60–90 秒快取，超過 5 分鐘隱藏可借／可還數                                      |
| 臺北市公車 ETA       | [預估到站資料集](https://data.taipei/dataset/detail?id=f11a5af0-7b37-48ef-98cc-f6f102ed43c6) 的 `GetEstimateTime.gz` | 免 key                     | 20–30 秒快取；只取圓山附近 StopID，逾 90–120 秒不顯示舊 ETA                                    |
| 公車站牌、路線與路徑 | [臺北市公車 API V6.3 文件](https://pto.gov.taipei/News_Content.aspx?n=A1DF07A86105B6BB&s=55E8ADD164E4F579)           | 免 key                     | 每日刷新 `GetStop.gz`、`GetRoute.gz`、`GetPathDetail.gz`                                       |
| 圓山附近活動         | [文化部附近活動資料集](https://data.gov.tw/dataset/10044)／`doFindActivitiesNearBy`                                  | 免 key                     | 官方日更；以圓山座標與 2 km 查詢，每個 `showInfo` 拆成獨立場次；售票狀態或空白價格不可推成免費 |
| 跨縣市運輸           | [TDX 公車 API](https://tdx.transportdata.tw/api-service/swagger/basic/939d7b26-14d6-40bc-bdc9-a076e3f8d4dc)          | 自行申請 Client ID／Secret | 第二階段；token 只在伺服器記憶體快取，不送到 PWA                                               |
| 全家友善食光         | [全家地圖趣](https://nevent.family.com.tw/map/)                                                                      | 未發現文件化公開 API       | 第一版只顯示官方方案與 App／地圖連結，不擷取 App 私有庫存介面                                  |

全家官方頁明載友善食光為效期前 7 小時 7 折、庫存約每 30 分鐘更新，且仍以現場為準。這些可作為「官方方案」證據，但不能標成「本店庫存已驗證」。若要取得店舖／SKU 庫存 feed，需先向全家取得書面授權或合作 API；在此之前不得逆向 App 流量或繞過存取控制。

文化部附近活動 API 於 2026-09-05 以圓山中心、2 km 範圍實測可回傳 39 筆活動紀錄，可作為「活動不歸零」的主要日更來源。政府平台分發只證明資料來源與擷取時間；場次是否仍舉辦、價格與主辦資訊仍依欄位與交叉證據分別標示，不能把整筆資料一概標為全部已驗證。

即時狀態與來源驗證必須分開：`官方來源 ✓` 只代表站點、路線或方案來源可信；只有仍在有效期內的動態值才能顯示 `即時 ✓ · N 秒前`。上游逾時、格式異常或過期時，保留 D1 的地點資料，但隱藏即時數字並顯示最後更新時間。

第一階段已在 catalog 查詢路由的 server 端直接讀取免金鑰官方 feed：YouBike 每個 isolate 快取 60 秒、文化部附近活動快取 10 分鐘，單次上游請求 4 秒逾時。成功且格式合格時只覆蓋同來源候選；失敗時保留 D1／snapshot last-good 資料並回傳 warning，不寫入 D1，也不把未知票價或缺少觀測時間的資料標成已驗證。第二階段若需要跨 isolate 的穩定持久化，再由外部 Cloudflare Worker Cron 擷取官方 feed，以 HMAC 簽章呼叫 Sites ingest endpoint；更新失敗不可覆蓋最後成功資料，也不應每分鐘替所有站點永久新增 evidence。Sites 官方文件目前沒有保證可直接設定 Cron Trigger，因此不要把持續刷新依賴於重新部署網站。

## 已落地的圓山資料匯入

```bash
cd mvp
npm run data:refresh
npm run db:verify
npm run data:bootstrap:local
```

匯入器目前擷取 14 個來源：臺北市餐館業、友善店家、市場、臺北市藥局、公共飲水臺、Taipei Free、涼適點、YouBike、捷運票價、臺北文化快遞、文化部附近活動，以及北美館、臺北孔廟和花博公園官方頁面。它以 YouBike「捷運圓山站（1號出口）」為中心，對有座標地點套用 2 km 篩選；官方頁面明確位於圓山生活圈的場館則保留地址與判定依據。每筆保留來源、內容雜湊、擷取時間、外部識別碼與匯入／拒絕紀錄。

bootstrap 會先核對 seed 與 snapshot 是否屬於同一個 `runId`，再確認本機 D1 已存在該筆完成匯入及對應筆數；不一致才同步 seed。API 查 D1 時同樣以最新 `COMPLETED` import run 的 `import_items` 篩選地點與活動，snapshot fallback 則使用目前版本庫內同批產物。

輸出位於 `mvp/data/`：

- `yuanshan-open-data.sqlite`：本機驗證資料庫，不進 Git。
- `yuanshan-open-data.seed.sql`：可在三份核心 migration 後初始化全新 D1/SQLite；不含顯式 transaction。`0006_ai_rate_limits.sql` 建立 AI 限流表，`0007_auth_accounts.sql` 建立帳密、session 與帳號狀態。
- `yuanshan-open-data.snapshot.json`：供審查與前端整合的精簡快照。

餐館清冊只證明登記，不證明營業；在沒有店家即時菜單／價格證據前，餐廳狀態、菜單、優惠與 CP 分數都保持未知或不建立。官方藥局名錄只證明名稱、地址與位置，不推測商品、庫存、價格或當下營業。友善店家清冊則因缺少零售分類，只保留拒絕稽核，不再當成日用品零售來源。臺北文化快遞雖由官方平臺分發，活動內容可能由第三方投稿，因此預設 `UNVERIFIED`；2040 sentinel、過期列、可疑凌晨時段、只有行政區地址與海外場館／臺北座標衝突都會隔離。當前圓山命中列沒有足夠精確地址，故只進稽核、不進候選；後續需以場館官方頁或可信地點資料交叉驗證。YouBike 可借還數與站點狀態只存在五分鐘有效的 assertion。捷運票價來源沒有站點座標，所以只保存起點或終點為圓山站的票價證據，不拿來證明站點座標、地址或營運狀態。

## 匿名與登入

- 公開首頁允許匿名使用；收藏 ID 與必要結果快照留在目前瀏覽器的 `localStorage`，不會自動建立 server account，也不宣稱跨裝置同步。
- 註冊帳號使用 3–30 字元小寫英數字／底線／連字號與至少 12 字元密碼。密碼以 PBKDF2-SHA256、隨機 salt、210,000 次迭代儲存。
- 登入成功後建立 32-byte 隨機 bearer token，D1 只保存 token 的 SHA-256 雜湊；session 30 分鐘後到期，登出立即設為 revoked。
- 瀏覽器只在 `sessionStorage` 保存 token；`/api/me/data` 從 token 推導 owner，不接收前端傳入的 `user_id`。
- 新帳號不帶 Demo 預設資料。若目前瀏覽器已有訪客收藏，登入／註冊後會以 ID 聯集與既有帳號收藏合併；相同 ID 以帳號快照為準，D1 寫入成功後才清除訪客副本，因此不會靜默覆寫既有帳號資料。Demo 固定情境本身不會直接灌入正式帳號。

## 上線順序

1. **已完成 catalog 與本機 D1**：latest-run 篩選、官方 snapshot fallback、活動時間窗與逐欄 evidence 狀態已接上 UI。
2. **已完成 AI 安全層**：需求解析、理由 endpoint、strict schema、D1 限流、`store: false` 與錯誤 fallback 已有 contract tests。
3. **已完成本機帳號流程**：註冊、登入、個人狀態讀寫、重新整理還原、登出撤銷與 401 已通過 API／瀏覽器測試。
4. **下一個 production gate**：備份 D1、套用 build 產生的 6 份 migration、驗證 account tables，再部署目前 commit 並重跑匿名／登入 smoke test。
5. **後續領域化**：把 account state envelope 拆成 profile、lists、history、notifications 與 Team transaction，加入 optimistic concurrency、稽核與 moderation。
6. **資料維運**：實作「本次未見」資料的撤站、下架、過期與歷史保留 reconciliation；不可反覆重套 seed 取代增量工作。

公開 HTTPS 網址目前以未登入 HTTP 請求確認可開啟，但對應的是已部署基準版；不能把本分支尚未套用的帳號 migration 描述成已在 production 驗證。

## 成本與安全守門

- 外部 API key 只放 Sites secret，不進前端 bundle、Git 或 `.env.example` 的實值。
- Google API 設定 HTTP referrer／API restriction、每日 quota 與費用警示。
- 搜尋採 cache-first；地點基礎資料按月，活動按日，營業與優惠依來源有效期刷新。
- 自然語言原文預設不長期保存；分析只保存結構化條件與匿名統計。
- 使用者回報需要 rate limit、內容長度限制、moderation 與管理追蹤。
