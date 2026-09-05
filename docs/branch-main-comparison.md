# `codex/all-in-life-mvp` 與 `main` 差異與整合建議

> 比對基準：2026-09-05，開始調整前的功能分支 `d761a9f` 對 `origin/main` `3def882`，當時為 4 個提交在前、12 個提交在後；本文件與新版手機 App 介面是基於這次比較追加的變更。

## 結論

兩邊不是同一套前端逐步演進，而是兩個平行實作：`main` 把主要作品放在 `old_version/`，採 Bun + Vite + React + Hono；目前分支把作品放在 `mvp/`，採 npm + Vinext + React + Tailwind/shadcn，並規劃 Cloudflare Sites、D1 與 PWA。最安全的整合方式是保留 `mvp/` 為展示主體，吸收 `main` 的多畫面流程與互動語言，不直接把兩套 App 原始碼混在同一個 runtime。

## 快速比較

| 面向 | `main` | `codex/all-in-life-mvp` | 建議 |
| --- | --- | --- | --- |
| App 位置 | `old_version/` | `mvp/` | 保留兩個目錄，明確指定 `mvp/` 為目前展示入口 |
| Package manager | Bun | npm | 不共用 lockfile；各目錄維持自己的工具鏈 |
| 前端 | React 19 + Vite | React 19 + Vinext | 不直接搬 bootstrap；只移植 screen flow 與 domain logic |
| 後端 | Hono + Bun server | 尚未接後端，目標 Cloudflare Workers | 後端 contract 先統一，再選一個 runtime |
| 樣式 | 大量自訂 CSS | Tailwind 4 + 自訂 CSS + shadcn | 新版以 design tokens 與 App shell 統一 |
| 路由 | 自製 pathname router、多個 screen component | React state screen navigation | 展示階段 state navigation 較穩；上線前再補 browser history 或正式 routes |
| AI | AI SDK / OpenAI-compatible 依賴 | 尚未呼叫模型 | UI 不宣稱即時 AI，等 API contract 穩定再接 |
| 資料 | mock records + server parse | 本地資料 + CP engine + D1 schema | 共用資料 shape、evidence gate 與 score policy |
| 測試 | Bun tests、TypeScript | TypeScript、oxlint、Vinext build | 將 CP engine 補單元測試，UI 補核心 journey smoke test |
| PWA | manifest + icon | manifest + icons + service worker 草稿 | 最終只保留一份 manifest / service worker 策略 |

## 架構差異

### `main`

```text
Mobile SPA (Vite + React)
  ├─ pathname router
  ├─ Search / Results / Detail / List / Settings / Team screens
  └─ client fetch
       ↓
Hono API on Bun
  ├─ natural-language parse
  ├─ voice transcription adapter
  └─ provider records
```

優點是畫面切換清楚、流程接近真正手機 App，而且 server、parser 與測試已分層。限制是部署 runtime 與目前分支的 Cloudflare Sites/Vinext 方向不同。

### 目前分支

```text
Responsive App shell (Vinext + React + Tailwind)
  ├─ Home / Search / Results / Detail / Saved / Team / Settings / Map
  ├─ CP Value Engine
  ├─ in-memory interaction state
  └─ PWA assets
       ↓ future
Cloudflare Workers + D1 + R2
```

目前分支的優點是視覺系統、CP 計算、D1 schema、架構圖與 Sites 部署方向較完整。限制是正式 API、登入與資料持久化尚未接上。

## 程式語言與主要依賴

- 共同語言：TypeScript、TSX、CSS、HTML、SQL。
- `main` 額外重心：Bun runtime、Hono、Zod、AI SDK、Vite。
- 目前分支額外重心：Vinext、Tailwind CSS、shadcn/Base UI、Lucide、Cloudflare Vite plugin、Wrangler、D1 SQL。
- 兩邊 React major 相同，但 TypeScript、React patch version 與 build pipeline 不同；不要把 lockfile 或 build config 互相覆蓋。

## Merge 衝突預測

已用 merge base 做三方預演，會產生文字衝突的檔案有：

- `.gitignore`：分支加入 `prototype/`、`.mvp-sites-git/`、`mvp-site.tar.gz`；主支加入 `node_modules`、`dist`、`.env`、`.DS_Store`。解法是保留雙方規則並補上 `mvp/.vite/`。
- `docs/PRD-all-in-life.md`：雙方都改了端到端流程。分支強調快速填寫／直接說、硬限制與 evidence；主支加入匿名／登入、帳號保存與語音主流程。應以「匿名可直接用、登入後可保存；文字與語音共用同一份可編輯結構化需求」合併，而不是選一邊覆蓋。

低風險或不會直接衝突的部分：

- `main` 的 `old_version/`、`.claude/`、`.cursor/`、`CONTEXT.md` 與語音規格多為新增檔案。
- 分支的 `mvp/`、`docs/architecture/`、CP engine、D1 migration 與根目錄 README 多為新增檔案。
- 兩套 package manifest 位於不同目錄，不會產生 Git 文字衝突，但會造成維護與部署入口的認知衝突，README 必須指定哪一套是正式入口。

## UI / UX 吸收策略

新版分支採用 `main` 與 Figma 的優點：

- 手機尺寸 App shell；桌面只作為裝置展示背景。
- Home、Search、Results、Detail、Saved、Team、Settings、Map 分成獨立 screen。
- 固定 header 與 bottom navigation；每個 screen 只在內容區內部捲動。
- 高對比黑底、螢光綠主行動，加入紫、藍、珊瑚紅作模式和狀態辨識。
- 搜尋進度、skeleton、screen transition、按壓縮放、hover 浮起、toast 與 evidence bottom sheet。
- 結果卡加入少量餐食照片，但避免變成外送平台式大圖瀑布。
- 不在使用者畫面顯示 `DEMO`、`fixture` 或 `MVP` 字樣；資訊可信度改用「可信來源、資料依據、適用條件」表達。

## 流程與架構連結

- [互動式產品流程圖](architecture/all-in-life-product-flow.html)
- [互動式系統架構圖](architecture/all-in-life-architecture.html)
- [產品流程 PNG（淺色）](architecture/all-in-life-product-flow.visual-check.1440x900.light.png)
- [產品流程 PNG（深色）](architecture/all-in-life-product-flow.visual-check.1440x900.dark.png)
- [系統架構 PNG（淺色）](architecture/all-in-life-architecture.visual-check.1440x900.light.png)
- [系統架構 PNG（深色）](architecture/all-in-life-architecture.visual-check.1440x900.dark.png)

## Figma 交付方式

程式碼無法直接、完整且可靠地轉成可編輯 Figma components。建議交付流程：

1. 以 390 × 844 viewport 開啟網站，逐一截取 Home、Search、Results、Detail、Saved、Team、Settings、Map。
2. 在既有 Figma 的 `Screens` section 建立同名 frames，依流程由左至右排列。
3. 將顏色、字級、間距、圓角與陰影整理成 variables / styles；先建立 Button、Chip、Header、Bottom Nav、Result Card 五個 components。
4. 把截圖放在 frame 最底層並降低透明度，於上方重建可編輯元件；完成後隱藏截圖。
5. 在 Prototype 分頁連接主要互動：開始探索 → Search → Results → Detail；底部導覽連到 Home / Results / Saved / Team。
6. 開啟 Dev Mode 檢查 spacing、font、color token 與 asset export，確保程式與 Figma 使用同一組命名。
7. 若要快速把現有頁面帶進 Figma，可評估 URL-to-Figma 類第三方 plugin，但匯入後仍需整理 auto layout、components 與 accessibility；不要把自動匯入結果當成最終 design system。

建議 frame 名稱：`01 Home`、`02 Search`、`03 Results`、`04 Detail`、`05 Saved`、`06 Team`、`07 Settings`、`08 Map`。
