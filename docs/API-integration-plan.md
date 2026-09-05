# ALL IN LIFE API 串接規劃

## 目前狀態

目前手機 App 的互動、篩選、CP 計算、搜尋載入演出、通知、清單、成團與消費分析都在前端執行。資料來自 `Yuanshan_APP_AI_Database_Design.xlsx` 的人工整理內容與固定快照，尚未呼叫正式後端，因此不能宣稱價格、庫存、車位或營業狀態是即時資訊。

## 建議架構

```text
手機 PWA
  ↓ POST /api/v1/search
Cloudflare Worker API
  ├─ 需求解析：文字／語音 → 同一份 SearchConstraints
  ├─ Hard Filter：日期、時段、預算、人數、距離、排除
  ├─ Evidence Gate：來源、確認日、衝突、過期
  ├─ Cost Engine：直接費用＋必要費用＋交通＋人均
  ├─ CP Engine：可行候選才進排序
  └─ D1：個人檔案、偏好、清單、歷史、通知、團購、回報
       ↓
官方／合作資料 API 與受控更新工作
```

AI 適合負責「把自然語言轉成結構化條件」與「把已驗證結果說得容易懂」，不應自行產生店名、價格、營業時間或優惠。

## OpenAI Agent 與金鑰放置

這裡應串接 **OpenAI Responses API**，而不是把「Codex」直接當成瀏覽器端 API。兩個獵人共用同一個後端 API client，但使用不同 developer instructions：

- CP 值獵人：只對已通過 Evidence Gate 與硬限制的付費候選產生排序理由。
- 零元獵人：只對直接費用為零的候選說明資格、開放時間與必要成本。
- 最終分數、排斥標籤與排序仍由 deterministic code 計算；模型不可改寫價格、距離或營業事實。

正式環境請在 Cloudflare Worker 專案目錄設定 secret：

```powershell
cd mvp
npx wrangler secret put OPENAI_API_KEY
```

本機開發可建立 `mvp/.dev.vars`：

```dotenv
OPENAI_API_KEY=請貼上自己的金鑰
```

`mvp/.dev.vars` 已列入 `.gitignore`，不可提交。前端 React 元件不得讀取或輸出此金鑰；只能呼叫同源的 `/api/v1/agents/*`，再由 Worker 讀取 `env.OPENAI_API_KEY`。Responses API 支援文字／圖片輸入、結構化輸出與自訂工具，可用來做條件解析與排序說明：[OpenAI Responses API 官方文件](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)。

## 第一批 API

| Method | Path | 用途 |
| --- | --- | --- |
| `POST` | `/api/v1/search/parse` | 將文字或語音逐字稿轉成可編輯的限制欄位 |
| `POST` | `/api/v1/search` | 套用硬限制、總成本、Evidence Gate 與 CP 排序 |
| `GET/PATCH` | `/api/v1/profile` | 讀取／更新暱稱、頭像、預算與偏好 |
| `GET/POST` | `/api/v1/lists` | 建立、讀取及分享清單 |
| `PATCH/DELETE` | `/api/v1/lists/:listId/items/:itemId` | 標記已買、移除與設定提醒 |
| `GET` | `/api/v1/analytics` | 依月份與類別彙總花費、節省、人均與使用頻率 |
| `GET/POST` | `/api/v1/teams/:teamId/campaigns` | 建團、加入、取消與計算門檻 |
| `POST` | `/api/v1/reports` | 提交價格、營業時間、停業或優惠失效回報 |
| `GET/PATCH` | `/api/v1/notifications` | 取得、已讀及刪除到期／成團通知 |

## `SearchConstraints` 契約

```ts
type SearchConstraints = {
  query: string;
  date: string;             // YYYY-MM-DD
  time?: string;            // HH:mm
  category?: 'DINING' | 'DAILY' | 'LEISURE' | 'TRANSPORT';
  budgetTwd?: number;
  partySize: number;
  maxDistanceM?: number;
  hardExclusions: string[];
  softPreferences: string[];
  mobility: Array<'WALK' | 'MRT' | 'BUS' | 'YOUBIKE' | 'TAXI_SHARE'>;
};
```

文字輸入與語音輸入只能改變 `query` 的來源，兩者最後都必須顯示同一份可編輯的 `SearchConstraints`，由使用者確認後才搜尋。

## 外部資料來源優先順序

1. 官方開放資料與官方網站：北美館、孔廟、花博、臺北捷運、公車、YouBike。
2. 店家或合作方提供的菜單、優惠與營業資料。
3. Google Places：地點 ID、地址、座標與營業狀態；只保存條款允許的欄位。
4. 社群回報：一律先進入 `PENDING`，不可直接覆蓋官方或店家資料。

## 匿名與登入

- 公開首頁允許匿名使用，裝置端只保存暫時設定與 `session_key`。
- 登入後由 Sites／ChatGPT 身分標頭取得穩定 user id，伺服器端把清單、歷史與偏好綁到 D1 `users.id`。
- 匿名資料要轉移到帳號時，使用一次性 merge endpoint，並要求使用者確認。
- 所有寫入 API 都在伺服器檢查 owner；不要相信前端傳入的 `user_id`。

## 上線順序

1. 啟用 D1 binding `DB`，套用 `0001_p0_core.sql` 與 `0002_product_flow.sql`。
2. 先接 profile、lists、history、notifications，讓目前 UI 狀態可跨工作階段保存。
3. 再接 search API 與圓山資料匯入；先回傳固定快照，確保契約穩定。
4. 接 Google Places／官方開放資料更新工作，加入 cache、quota、timeout 與 freshness。
5. 最後接 AI 需求解析與解釋；錯誤時回退到表單與規則引擎。

## 成本與安全守門

- 外部 API key 只放 Sites secret，不進前端 bundle、Git 或 `.env.example` 的實值。
- Google API 設定 HTTP referrer／API restriction、每日 quota 與費用警示。
- 搜尋採 cache-first；地點基礎資料按月，活動按日，營業與優惠依來源有效期刷新。
- 自然語言原文預設不長期保存；分析只保存結構化條件與匿名統計。
- 使用者回報需要 rate limit、內容長度限制、moderation 與管理追蹤。
