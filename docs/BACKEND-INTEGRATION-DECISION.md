# ALL IN LIFE 後端整合決策

> **歷史決策提醒（2026-09-06）：** 本文件記錄 2026-09-05、`origin/main=45f57ed` 時的選型。`origin/main` 現已重整為單一 `prototype-v1/` Bun／Hono／PostgreSQL／Gemini runtime，本分支則已完成 D1 catalog、OpenAI Responses API 與帳號持久化。最新差異、衝突模擬與整合建議請以 [`branch-main-comparison.md`](branch-main-comparison.md) 為準。

- 日期：2026-09-05
- 分支：`codex/all-in-life-backend-plan`
- 前端基準：`codex/all-in-life-mvp` / `mvp/`
- 比對對象：`origin/main`（`45f57ed`）

## 決策

前端以目前 `mvp/` 為主。不要把前端退回 `main` 裡的 `old_version/` 或 `prototype-v1/`。

後端方向採用「擇優整合」：保留 `mvp/` 的部署模型與 D1 資料方向，同時吸收 `main` 已經整理得比較成熟的後端設計原則。

簡單說：

- 前端：用本分支的 `mvp/`。
- 後端規則：吸收 `main` 的設計。
- 部署形態：以 `mvp/` 對應的 Cloudflare Worker / D1 方向為主。

## 為什麼不要直接合併 `main`

`main` 和目前分支不是同一套程式的小改版，而是兩條平行實作。

目前用 Git 實測，直接合併會在這兩個檔案產生文字衝突：

- `.gitignore`
- `docs/PRD-all-in-life.md`

即使其他檔案沒有產生文字衝突，也仍有架構上的衝突：

- `main` 有 `old_version/` 和 `prototype-v1/`，偏 Bun、Vite、Hono、本機 PostgreSQL 的後端原型。
- 本分支有 `mvp/`，偏 Vinext、React、Tailwind、PWA、D1 schema 與 Sites 發布。
- `main` 的類別是五類：食品、日用品、免費／公益資源、活動、交通。
- `mvp/` 目前前端體驗整理成 DINING、DAILY、LEISURE、TRANSPORT 等較完整手機流程。

因此比較好的做法不是整包 merge，而是把 `main` 的好設計移植到 `mvp/` 後端。

## 對比

| 面向 | `main` 的強項 | 目前分支的強項 | 建議 |
| --- | --- | --- | --- |
| 前端 | hash routing、較輕量流程 | `mvp/` 已是完整手機 PWA，且已公開 HTTPS 部署 | 保留 `mvp/`，之後移植返回鍵與深層連結 |
| 後端 runtime | Bun / Hono 原型簡單、好測 | Cloudflare / D1 較符合目前部署方向 | 最終採 Worker / D1，概念上吸收 Hono route 設計 |
| 資料來源 | 事先匯入候選資料，不 runtime web search | D1 schema 已涵蓋 users、places、evidence、teams、reports、notifications | 用 D1 實作 pre-ingestion 模型 |
| 搜尋流程 | 先 deterministic filter，再交給 Agent 排序 | 已有 CP engine 與 evidence-first 產品語言 | 合併為 evidence gate + hard filter + CP/cost ranking |
| Agent | paid / free 兩個 Agent 的責任清楚 | UI 已能呈現 CP、Team、Zero-cost 故事 | Agent 只負責排序與說明，不負責創造資料 |
| 驗證 | `Need` + Zod schema，可前後端共用 | `SearchConstraints` 目前偏 TypeScript type | 優先建立共用 Zod schema |
| 日期與位置 | 台北日期由 server 解析，使用者位置不保存 | PWA / location UX 已準備好 | 採用 `main` 的隱私與台北時區規則 |
| 測試 | parser / routes / search contract test 方向明確 | 已有 build 與 PWA smoke 驗證 | 把 contract test 移植到 `mvp` API 層 |

## 建議後端架構

```text
mvp/ PWA 前端
  -> POST /api/v1/search/parse
  -> POST /api/v1/search
  -> GET/PATCH /api/v1/profile
  -> GET/POST /api/v1/lists
  -> GET/PATCH /api/v1/notifications
  -> POST /api/v1/reports

Cloudflare Worker API
  -> 共用 Zod SearchConstraints
  -> 台北時區日期正規化
  -> Evidence Gate
  -> Hard Filter
  -> deterministic cost / CP ranking
  -> paid options agent + free resources agent
  -> D1 persistence

離線資料匯入工作
  -> 官方 / 店家 / 公開來源
  -> candidate records
  -> evidence assertions
  -> optional Places geocoding
  -> freshness / status checks
```

## 後端建置順序

1. 建立共用 `SearchConstraints` Zod schema。

   文字輸入、語音解析、搜尋 API、前端確認畫面都應共用同一份 runtime schema，避免只有 TypeScript 型別但實際 API 接受錯誤資料。

2. 建立 API client 與 route shell。

   先補 30 秒 timeout、request id、錯誤分類、取消搜尋，以及 fixture fallback。這樣後端還沒完全接好時，Demo 主流程不會直接斷掉。

3. 啟用 D1 與既有 migrations。

   先接 profile、saved lists、purchase history、notifications、reports。這些功能 AI 風險較低，也能讓目前前端狀態跨 session 保存。

4. 先完成 deterministic search。

   搜尋先讀取已匯入候選資料，套 evidence gate、hard filters、可比成本與 CP 排序。這一步先不要接 LLM，方便驗證核心商業邏輯。

5. deterministic search 穩定後再加入兩個 Agent。

   paid options agent 與 free resources agent 只排序已通過篩選的候選資料，並產生一句推薦理由。Agent 不可以發明店名、價格、營業時間、資格或優惠。

6. 補上 ingestion / geocoding。

   採用 `main` 的資料規則：一個來源一筆紀錄、未知價格不可當 0、過期或衝突資料退出主要排序、使用者位置只用於當次搜尋且不保存。

7. 移植測試。

   把 `main` 的 parse/search/routes contract test 移到 `mvp` 後端形態，並新增 onboarding -> search -> result -> saved 的瀏覽器 smoke test。

## 應該從 `main` 移植的內容

- `needSchema` 的概念：parser 與 search 共用同一份 schema。
- `/api/parse`、`/api/transcribe` 的 trust boundaries：輸入大小限制、30 秒 timeout、固定錯誤訊息。
- `/api/search` 的事件模型：filter event、各 Agent / category ranking event、done event。
- `SPEC-ingestion.md` 的資料規則：一個來源一筆紀錄、必要 evidence、未知價格用 null、資料狀態處理。
- `SPEC-geocoding.md` 的位置規則：候選地點座標可保存，使用者座標只用於單次 request。
- `prototype-v1/tests` 的 contract test 思路。

## 不應該直接移植的內容

- 不要把前端換回 `old_version/` 或 `prototype-v1/`。
- 除非部署目標改變，否則不要把本機 PostgreSQL 當成最終上線依賴。
- 不要讓 Agent 在使用者搜尋當下即時上網搜尋。
- 不要預設保存原始音檔、逐字稿或精準使用者位置。
- Team 不要在 moderation、abuse、privacy 規則完成前做成真實交易或承諾系統。

## 衝突解法

`.gitignore`：取雙方聯集。保留 build cache、local env、暫存檔、部署輸出等 ignore 規則。

`docs/PRD-all-in-life.md`：不要直接覆蓋。保留官方產品敘事，但把實作章節對齊以下原則：

- 匿名使用者可以搜尋。
- 登入主要用於保存狀態與進行共享 / 回報動作。
- 搜尋使用事先匯入的候選資料，不在 request 當下爬網。
- Agent 只排序已通過篩選的候選資料，不創造事實。
- 使用者位置只用於當次搜尋，不持久化。
- 目前可交付前端是 `mvp/`。

## 最終建議

如果目標是先完成 hackathon 送件，建議先把 PWA / 前端 / README / SPEC / checklist 相關內容合進 `main`，後端只合併文件與規劃，不急著把 runtime 混在一起。

後續再依序開 task 實作：共用 schema、API client、D1 persistence、deterministic search、ingestion、Agent ranking、contract tests。
