# ALL IN LIFE — Submission & Deployment Specification

- 文件版本：v1.0
- 更新日期：2026-09-05
- 適用程式：`mvp/`
- 產品需求基準：`docs/PRD-all-in-life.md`（本文件不取代或修改 PRD）

## 1. 本次交付目標

將現有 ALL IN LIFE PWA 發布到公開 HTTPS 網址，讓評審可直接體驗目前可操作版本，並完成 manifest、service worker、安裝資格與離線 app shell 的驗證。展示內容必須清楚區分可操作前端、Demo fixture 與尚未串接的正式服務。

## 2. 本次上線範圍

- Vinext / React 19 的 16 畫面手機 App 介面。
- 首次設定、文字／語音需求、搜尋演出、結果排序、詳情、收藏、Team、地圖、通知、歷史、分析與回報流程。
- CP Value 規則引擎、Evidence Gate 與硬限制檢查。
- Web App Manifest、app icons、service worker 與安裝提示。
- HTTPS 公開部署與 PWA 線上／離線 smoke test。

本次不啟用正式登入、後端搜尋 Agent、D1、R2、Google Places API、付款或交易式 Team 承諾。

## 3. 資料與產品誠信

- 搜尋結果仍含展示資料，不代表即時價格、庫存、資格或營業狀態。
- 已附來源的資料仍應在出發或購買前回到原始頁面複核。
- 未知交通、時間、運費、資格與距離不得推定為零。
- 地圖使用公開 embed / search URL；service worker 不快取跨來源地圖內容。
- 專案不需要 API key；未來 secret 只透過部署平台管理，不提交至儲存庫。

## 4. PWA 驗收條件

- 公開網址使用 HTTPS，首頁可正常載入。
- `/manifest.webmanifest` 可讀取，名稱、啟動網址、scope、display 與 icons 正確。
- `/sw.js` 成功註冊並控制頁面。
- 支援的桌面或 Android Chromium 瀏覽器可出現安裝入口；iOS 依「加入主畫面」流程。
- 完成一次線上載入後，切換離線並重新整理仍能顯示同源 app shell。
- service worker 只攔截同源 GET，排除 `/api/`，不快取 Google Maps tiles 或跨來源 Places 內容。
- 重新連線後可正常取得最新版，舊 cache 會在 activate 階段清除。

## 5. 評審 Demo 建議

1. 匿名完成首次設定，從首頁進入「省錢晚餐」。
2. 調整預算、人數與偏好，展示搜尋狀態與結果排序。
3. 打開結果詳情，說明 CP 分解、evidence、查核時間與限制。
4. 展示收藏、Team 成團門檻與人均成本。
5. 展示「零元探索」與地圖來源，強調零元只代表直接費用為零。
6. 最後示範 PWA 安裝入口與離線重新整理。

## 6. 團隊與大致分工

| 成員 | 聯絡方式 | 主要分工 |
| --- | --- | --- |
| 丁肇志（Ting） | conanlong911@gmail.com | 產品方向、核心流程、語音輸入、PWA 與 Demo 串場 |
| 林軒緯（緯） | xuanweilin805@gmail.com | 前端協作、互動與跨裝置測試、部署驗收 |
| Andrew Fai（AF） | andydrewie@gmail.com | 資料來源整理、Evidence 驗證、影片錄製與備援素材 |
| 楊杰倫（Jay Yang） | cl.yang04@gmail.com | CP / Team / Zero-Cost 規格、README、送件文件與發布整合 |

實際工作可由成員互相支援；正式送件前由主要聯絡人確認表單上的名稱、Email 與最終分工一致。

## 7. 下一階段（本次不阻塞上線）

1. 將 state navigation 換成 `main` 的 hash routing 或正式 App Router routes，讓瀏覽器／PWA 返回鍵、重新整理和深層連結可靠。
2. 把 `SearchConstraints` 建成 Zod schema，由前後端共用，避免只有 TypeScript 型別、runtime 卻接受錯誤資料。
3. 建立共用 API client：30 秒 timeout、錯誤分類、retry policy、request id 與取消搜尋。
4. Worker 端採台北時區解析「今天／今晚」，並限制 body、音檔大小與欄位長度。
5. 移植 parser／routes 的 contract test，再新增 onboarding → search → result → saved 的瀏覽器 smoke test。

## 8. 文件優先順序

- 產品需求：`docs/PRD-all-in-life.md`
- 本次送件／部署規格：`SPEC.md`
- 詳細技術規格：`docs/SPEC-team-cp-zero-cost-v1.md`
- UI / UX 規格：`docs/SPEC-all-in-life-mvp.md`
- 官方送件項目：`submission-checklist.md`（保持主辦方原版格式）
