# ALL IN LIFE — Submission & Deployment Specification

- 文件版本：v1.1
- 更新日期：2026-09-06
- 適用程式：`mvp/`
- 目前分支：`codex/all-in-life-backend-plan`
- 產品需求基準：`docs/PRD-all-in-life.md`（本文件不取代 PRD）

## 1. 本次交付目標

提供一個可重現、可安裝的圓山生活決策 PWA。評審可以從匿名、生活帳號或 Demo 入口完成需求輸入、五類候選查詢、證據與 CP 理由檢視，再進行收藏、地圖或揪團操作；AI 與 D1 不可用時，主要流程仍須安全降級。

## 2. 已納入本分支

- Vinext、React 19、TypeScript 的 16 個主要手機 App 畫面與響應式桌面配置。
- 五類橫向分類：食品、日用品、免費／公益資源、活動、交通。
- `POST /api/catalog/search` 與 `GET /api/catalog/categories`，優先讀 D1、失敗時回退同批官方 snapshot。
- OpenAI Responses API 需求解析與推薦說明；strict schema、`store: false`、D1 rate limit 與固定規則 fallback。
- 生活帳號註冊、登入、登出、30 分鐘 session，以及清單、預算、收藏、歷史等 D1 狀態持久化。
- CP Value、Evidence Gate、硬限制與資料 coverage 規則。
- Web App Manifest、192／512／maskable icons、service worker、安裝提示與離線 app shell。
- 亮／暗主題、減少動態偏好、打字機、3D 指南針、粒子與背景音樂控制。

尚未納入的是 production 帳號 migration 驗證、交易式 Team 邀請／承諾、付款、R2 evidence upload、Google Places attribution pipeline 與跨裝置同步衝突處理。

## 3. 三種入口與資料邊界

| 入口 | 初始資料 | 保存方式 | 用途 |
| --- | --- | --- | --- |
| 匿名 | 無帳號預設資料 | 僅裝置端暫時狀態 | 立即探索，不要求註冊 |
| 登入 | 新帳號從空白個人狀態開始 | D1 `account_state`，由 authenticated user 綁定 | 跨重新整理保存清單、預算、收藏與歷史 |
| Demo | 固定評審情境 | 與真實帳號及 catalog 資料分離 | 讓評審穩定操作完整情境；畫面不重複鋪陳模擬聲明 |

正式模式整個 API request 失敗時顯示錯誤，不偷偷混入 Demo fixture。真實候選少於門檻時，若顯示 Demo 補充，也必須放在獨立區塊且不計入真實筆數。

## 4. API 與資料庫範圍

正式 build 目前包含 9 個 route handlers：

| Method | Path | 狀態／用途 |
| --- | --- | --- |
| `POST` | `/api/auth/register` | 建立生活帳號與 session |
| `POST` | `/api/auth/login` | 驗證帳密並建立 session |
| `POST` | `/api/auth/logout` | 撤銷目前 session |
| `GET` | `/api/auth/me` | 讀取目前帳號與個人狀態 |
| `GET`／`PUT` | `/api/me/data` | 讀取／保存登入者個人狀態 |
| `GET` | `/api/catalog/categories` | 類別筆數、資料來源與同步時間 |
| `GET`／`POST` | `/api/catalog/search` | 五類候選查詢；POST 避免把精確位置放在 URL |
| `POST` | `/api/v1/search/parse` | 需求文字轉 strict `SearchConstraints` |
| `POST` | `/api/v1/results/explain` | 只依伺服器重查後的候選事實產生理由代碼 |

來源 migration 為 `mvp/drizzle/0001`–`0007`；Sites build 會整理成 6 份依序部署的 migration，其中 catalog seed 合併為一份且帳號 migration 必須排在最後。production 套用前仍需備份並做 migration smoke test。

## 5. 安全與資料誠信

- 密碼使用 PBKDF2-SHA256、隨機 salt 與 210,000 次迭代；版本庫不保存明文密碼。
- session token 使用 32-byte 隨機值，只在 D1 保存 SHA-256 雜湊，30 分鐘後過期；登出立即標記 revoked。
- 瀏覽器只在 `sessionStorage` 保存 session token；所有個人資料 API 都從 bearer token 推導 owner，不接受前端指定 `user_id`。
- 單一帳號狀態最多 750 KB；格式錯誤或過大請求會被拒絕。
- `OPENAI_API_KEY` 只由 server-side secret 讀取，不進 React bundle、Git、URL 或 API 回應。
- AI 不產生店名、價格、距離、庫存、資格或 CP 分數；這些欄位由 catalog、Evidence Gate 與確定性規則決定。
- 未知價格、庫存、營業或資格保持未知，不推定為零；即時 assertion 過期後不再顯示即時值。

## 6. PWA 驗收條件

- 公開網址使用 HTTPS，首頁、manifest、icons、背景音樂與 service worker 可讀取。
- `/sw.js` 成功註冊；完成一次線上載入後，離線重新整理仍能顯示同源 app shell。
- service worker 只處理同源 GET，排除 `/api/`，不快取 Google Maps tiles 或跨來源內容。
- 支援 Chromium 安裝入口；iOS 依「加入主畫面」流程。
- 動畫遵守 `prefers-reduced-motion`；背景音樂必須由使用者手勢啟動且可隨時關閉。

## 7. 評審 Demo 建議

1. 從首頁說明「省下日常，投資未來」，選擇 Demo 入口。
2. 輸入「今晚兩人、預算 500、圓山附近、不要辣」，展示 AI 條件整理與可編輯確認。
3. 切換五類橫向分類，打開結果詳情查看總成本、距離、證據、查核時間與 CP 理由。
4. 展示登入後收藏／預算可在重新整理後還原，再登出確認 session 失效。
5. 展示 Team UI 時明確說明目前是意願登記，不會自動付款或代替下單。
6. 最後示範 PWA 安裝入口、背景音樂開關與離線 app shell。

## 8. 團隊與大致分工

| 成員 | 主要分工 |
| --- | --- |
| 丁肇志（Ting） | 產品方向、核心流程、語音輸入、PWA 與 Demo 串場 |
| 林軒緯（緯） | 前端協作、互動與跨裝置測試、部署驗收 |
| Andrew Fai（AF） | 資料來源整理、Evidence 驗證、影片錄製與備援素材 |
| 楊杰倫（Jay Yang） | CP / Team / Zero-Cost 規格、README、送件文件與發布整合 |

聯絡方式只保留在主辦方表單，不公開在版本庫。正式送件前需由主要聯絡人確認成員與分工。

## 9. 交付驗收

- `npm ci` 後可執行 `npm run lint`、`npx tsc --noEmit`、`npm run test:unit`、`npm run db:verify`、`npm run test:e2e` 與 `npm run build`。
- 核心 E2E 涵蓋匿名主流程、真實／Demo 資料分流、帳號註冊與持久化、登出失效、背景音樂與窄螢幕 coverage。
- 互動式架構圖與流程圖通過 `showcase` 幾何檢查，以及 1440×900 至 2048×1320 的深／淺色視覺檢查。
- push 前必須完成 tracked-file 機密、Email、私鑰與 diff whitespace 掃描。

## 10. 文件優先順序

- 專案入口與官方 checklist：`README.md`
- 本次送件／部署規格：`SPEC.md`
- 工程驗證與人工待辦：`submission-checklist.md`
- 目前系統圖：`docs/architecture/all-in-life-current.architecture.json`
- 目前產品流程：`docs/architecture/all-in-life-judge-flow.workflow.json`
- API 與 D1：`docs/API-integration-plan.md`
- AI 契約與安全：`docs/AI-integration-plan.md`
- 詳細 Team / CP / evidence 規格：`docs/SPEC-team-cp-zero-cost-v1.md`
