# `codex/all-in-life-mvp` 與 `main` 差異、取捨與整合建議

> 最新比對：2026-09-05。`origin/main` = `45f57ed`，目前功能分支 `codex/all-in-life-mvp` = `07c34b0`。本文件已納入 PWA HTTPS 上線整理、送件文件、官方 checklist 保留、更新後團隊名單，以及最新 merge-tree 衝突檢查。

## 結論

兩邊是平行實作，不宜直接混合 runtime。`main` 的可執行作品位於 `old_version/` 與 `prototype-v1/`，採 Bun + Vite + React + Hono，強項是 hash routing、共享 Zod schema、API timeout／錯誤邊界、台北日期解析、事先匯入資料、兩階段搜尋與 Bun 測試。功能分支的作品位於 `mvp/`，採 npm + Vinext + React + Tailwind，自成一套較完整的手機 App 體驗、CP／evidence 規則、PWA、D1 schema、Sites 部署設定與公開 HTTPS 展示。

建議以 `mvp/` 作為本次送件與展示入口，保留 `main` 的 `prototype-v1/` 作為後端/API 參考，不交叉覆蓋 lockfile 或 build config；將 `main` 較成熟的路由、schema、API client、server validation、資料匯入與測試觀念選擇性移植到 `mvp/`。本輪已完成公開站與 PWA 驗收，後端部分則以 API contract 與 migration 預留，不假裝已正式上線。

## 快速比較

| 面向 | `main` | 目前分支 | 決策 |
| --- | --- | --- | --- |
| App 位置 | `old_version/`、`prototype-v1/` | `mvp/` | `mvp/` 為目前展示入口；`prototype-v1/` 作後端/API 移植來源 |
| 工具鏈 | Bun、Vite 8、Hono | npm、Vinext、Cloudflare Vite plugin | 不共用 lockfile；部署前只選一套入口 |
| 導覽 | hash route，可使用瀏覽器返回 | 16 個 state-driven screens | 短期保留 state flow；下一階段移植 hash/history 行為 |
| 需求模型 | `Need` + Zod，client/server 共用 | `Filters` + TypeScript types | 採用 `main` 的 runtime validation，對齊 `SearchConstraints` |
| API | Hono `/api/parse`、`/api/transcribe`，並規格化 `/api/search` SSE、auth、account data | 正式 API 尚未接 | 沿用 timeout、payload 限制、錯誤不洩漏 upstream 細節 |
| 日期 | server 以 `Asia/Taipei` 解析 | 前端日期欄位 | 正式 API 採 `main` 的 server-resolved date |
| UI | 黑底酸綠、清楚多畫面流程 | 黑底酸綠加紫／藍／珊瑚狀態色 | 保留主支高對比與節奏，分支補資訊層級和多類別辨識 |
| PWA | manifest、icons、safe area | manifest、icons、SW 註冊、安裝提示 | 以分支版本為準，HTTPS 部署後驗收 installability |
| 資料 | 事先匯入候選資料、PostgreSQL schema 規格、geocoding/ingestion spec | 圓山展示資料、CP engine、D1 migrations | 以 evidence、freshness、total cost 與 hard filter 統一 |
| 測試 | Bun parser／routes tests | TypeScript、oxlint、build | 移植 parser contract test，再補核心 journey smoke test |

## 已從 `main` 採用的好設計

- **產品 SOP**：匿名可直接用，登入後才保存；先確認需求與限制，再搜尋、比較、收藏／分享。
- **語音主流程**：首頁把語音操作放在主要 CTA 前，同時保留可直接編輯的文字輸入；兩者共用同一份結構化需求。
- **手機 App 節奏**：Welcome、Confirm、Search、Results、Detail、List、Settings、Team 分畫面，避免一頁式無限下滑。
- **高對比視覺**：保留黑底、酸綠 CTA、粗體 CJK 標題、手機安全區與明確按壓狀態。
- **限制語意**：硬限制會排除，軟偏好只加權；免費、優惠與成團價都必須揭露條件。
- **後端防線**：API client timeout、Zod 驗證、音檔大小限制、upstream error 不回傳給使用者、台北時區由 server 決定。

## 本分支擴充且應保留的部分

- 16 個獨立畫面，新增 Profile、Filters、Notifications、Analytics、History、Report 與 Map。
- 日期、時段、類別、需求、預算、人數、距離、排除與偏好均可編輯。
- 勞動錯覺搜尋 loading 以 5.2 秒前端計時器呈現逐步處理；不冒充後端真實百分比。
- 餐飲、日用、育樂、交通統一結果模型，顯示距離、營業時間、服務方式、總成本、人均、節省、CP 值與 evidence。
- 收藏、到期提醒、標記已買、移除、分享、歷史與消費分析已有前端互動。
- 揪團顯示實際品項／店家、門檻、單獨與成團成本、分享及門檻前取消。
- `0002_product_flow.sql` 補上搜尋、清單、通知、購買紀錄與團體訂單資料表；API 串接順序見 [API integration plan](API-integration-plan.md)。

## 尚未移植、但值得排入下一階段

1. 將 state navigation 換成 `main` 的 hash routing 或正式 App Router routes，讓瀏覽器／PWA 返回鍵、重新整理和深層連結可靠。
2. 把 `SearchConstraints` 建成 Zod schema，由前後端共用；避免只有 TypeScript 型別、runtime 卻接受錯誤資料。
3. 建立共用 API client：30 秒 timeout、錯誤分類、retry policy、request id 與取消搜尋。
4. Worker 端採台北時區解析「今天／今晚」，並限制 body、音檔大小與欄位長度。
5. 移植 parser／routes 的 contract test，再新增 onboarding → search → result → saved 的瀏覽器 smoke test。

## 目標架構

```text
Mobile App shell (Vinext + React + routes/history)
  ├─ onboarding / editable constraints / results / personal center
  ├─ CP Value + evidence gate
  └─ PWA manifest + service worker
       ↓ typed API client + timeout
Cloudflare Worker API
  ├─ Zod runtime validation
  ├─ parse / search / list / team / report services
  ├─ Taipei server time + trust boundaries
  └─ D1 persistence + optional R2 evidence
```

目標不是把 Bun server 原封搬入 Vinext，而是保留其邊界：UI 只送結構化 request；Worker 驗證、正規化、查資料、算成本與保存；外部 API key 永遠留在 server secret。

## Merge 衝突與風險

`git merge-tree --write-tree --messages HEAD origin/main` 已確認直接合併會產生文字衝突：

- `.gitignore`：雙方新增規則不同；合併時取聯集，不覆蓋任一套 build cache／secret 規則。
- `docs/PRD-all-in-life.md`：雙方都修改端到端流程。本分支已整合為「匿名直接用、登入後保存；文字與語音共用同一份可編輯結構化需求」。

不一定產生文字衝突、但會造成架構衝突的項目：

- `old_version/` 與 `mvp/` 有兩套 package manager、啟動命令、manifest 與 PWA 策略；README 必須指定正式入口。
- `main` 的 `Need.target_categories` 是五類，本分支 UI 是餐飲／日用／育樂／交通四類；API 層需用穩定 enum mapping，不可直接靠顯示文字。
- `main` 說搜尋輸入與歷史不保存；本分支新增歷史／分析。正式產品應預設只保存使用者明確標記的清單與消費事件，原始音檔不保存，逐字稿與搜尋紀錄提供獨立同意和刪除機制。
- 直接 merge `origin/main` 會帶入大量 `old_version/` 與工具設定；應先開 PR 檢視，再以選擇性移植取代盲目覆蓋。

## UI / UX 檢查結論

- 首頁只保留一個主要任務入口；語音是顯眼捷徑，文字框仍可直接操作。
- 篩選集中在 Filters，個人資料／分析／歷史集中在 Settings，通知由鈴鐺進入，避免同一功能出現在多處。
- Results 負責比較、Detail 負責證據與行動、Saved 負責預算及完成狀態、Team 負責共同門檻，頁面責任已分離。
- 實際價格或即時營業狀態尚未有 API 保證，因此以「估算、來源、查核日期、適用條件」表達；回報頁只收使用者經驗，不直接覆蓋官方資料。

## 流程、架構與 Figma

- [互動式產品流程圖](architecture/all-in-life-product-flow.html)
- [互動式系統架構圖](architecture/all-in-life-architecture.html)
- [產品流程 PNG（深色）](architecture/all-in-life-product-flow.visual-check.1440x900.dark.png)
- [系統架構 PNG（淺色）](architecture/all-in-life-architecture.visual-check.1440x900.light.png)

Figma 建議以 390 × 844 frames 建立 Welcome、Onboarding、Home、Search、Results、Detail、Saved、Team、Settings、Notifications、Analytics；先整理 Color／Type／Spacing variables，再建立 Button、Chip、Header、Bottom Nav、Result Card、Cost Summary components。截圖只作底層參考，需以 Auto Layout 重建；Prototype 串接主要流程與通知、設定、揪團支線。
