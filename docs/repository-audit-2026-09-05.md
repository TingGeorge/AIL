# ALL IN LIFE Repository Audit

**審查日期：** 2026-09-05  
**儲存庫：** `/Users/apple/Desktop/AIL`  
**分支：** `main`  
**HEAD：** `6be730d`  
**遠端狀態：** 與 `origin/main` 一致  
**審查性質：** 檔案用途、執行依賴、歷史資產、文件一致性、建置與測試狀態審查

> 本報告記錄 2026-09-05 的清理前審查快照。2026-09-06 已依本報告完成高可信度清理；清理前完整內容儲存在 `main-copy`（`6be730d`）。規格檔案尚未校正。

## 1. Executive summary

目前分支的**唯一正式 Web App** 是：

```text
prototype-v1/
```

它的入口與主要執行鏈為：

```text
index.html
  → src/client/main.tsx
  → src/client/App.tsx

package.json "start"
  → src/server/index.ts
  → Hono APIs / PostgreSQL / Gemini / catalog / account / group offers
```

整體結論：

1. `prototype-v1/` 是目前應繼續維護、測試和部署的主應用。
2. Active app 內的 **10 個高可信度舊客戶端檔案**已從 `main` 刪除。
3. 兩個未引用舊圖標與根目錄過時 `.env.example` 已刪除；有效環境模板保留在 `prototype-v1/.env.example`。
4. `old_version/`、`AIL-codex-all-in-life-mvp/` 與 `deliverables/` 已從 `main` 移除，並由 `main-copy` 儲存。
5. `.scratch/` 不屬於正常 runtime，但包含研究溯源、一次性擴充工具輸入與第三方網頁快照；不應粗暴刪除，建議移到 archive/artifact storage 並清理敏感樣式內容。
6. 文件存在多項明確漂移：舊 branch、舊 provider/env、錯誤 API 欄位、缺失腳本、斷鏈、舊測試數字和產品範圍衝突。
7. `typecheck` 與 production build 通過；受控離線測試目前仍有 **4 個真實 UI/規格失敗**，所以文件中的“自動測試全綠”不成立。

## 2. 審查方法

本次使用 5 個並行 GPT-5.6 Luna 子代理，分別檢查：

- active runtime 與 import graph；
- 根目錄、歷史目錄與儲存庫衛生；
- 文件和程式碼一致性；
- 測試、建置、CI、依賴與設定；
- `prototype-v1` 與 `AIL-codex-all-in-life-mvp` 的關係。

GPT-5.6 Luna 在目前工具中只提供 `max` reasoning，沒有 `xHigh` 選項，因此實際使用 **GPT-5.6 Luna + Max**。主審查另外交叉檢查了 Git tracked files、原始碼引用、package scripts、建置結果、測試結果和 broken links。

## 3. 清理前儲存庫規模

以下為 2026-09-05、HEAD `6be730d` 的清理前快照，當時共有 **682 個 tracked files**。

| 頂層路徑 | Tracked files | 約佔空間 | 判斷 |
|---|---:|---:|---|
| `.scratch/` | 292 | 13.60 MiB | 研究/issue/抓取工件；非 runtime |
| `prototype-v1/` | 131 | 1.26 MiB | **目前正式 Web App** |
| `AIL-codex-all-in-life-mvp/` | 118 | 8.51 MiB | 獨立舊 MVP/設計快照 |
| `.claude/` | 74 | 0.19 MiB | Agent workflow 基礎設施；非 Web App runtime |
| `old_version/` | 31 | 0.14 MiB | 舊應用快照 |
| `docs/` | 25 | 0.35 MiB | 目前規格、歷史說明和研究文件混合 |
| `deliverables/` | 4 | 0.62 MiB | 歷史展示/審計交付物 |

## 4. 真正有用：目前 Web App 應保留內容

### 4.1 必要入口、設定與依賴

應保留：

```text
prototype-v1/package.json
prototype-v1/bun.lock
prototype-v1/index.html
prototype-v1/tsconfig.json
prototype-v1/vite.config.ts
prototype-v1/.env.example
prototype-v1/src/vite-env.d.ts
.github/workflows/integration.yml
.gitignore
```

`prototype-v1/package.json:5-16` 定義實際使用的 `dev`、`build`、`start`、`typecheck`、`test`、資料匯入和資料驗證流程。

所有 direct dependencies 都找到實際用途，沒有發現明確可刪的 direct package dependency：

- `hono`：HTTP server/routes；
- `busboy`：語音上傳解析；
- `react`、`react-dom`：前端；
- `lucide-react`：圖標；
- `zod`：schema 與輸入驗證；
- Vite、TypeScript 與相應 types：建置和類型檢查。

### 4.2 目前客戶端執行程式碼

以下檔案可從 `main.tsx → App.tsx` 執行鏈到達，應保留：

```text
prototype-v1/src/client/main.tsx
prototype-v1/src/client/ErrorBoundary.tsx
prototype-v1/src/client/App.tsx
prototype-v1/src/client/AccountView.tsx
prototype-v1/src/client/BrowseResults.tsx
prototype-v1/src/client/CatalogNotice.tsx
prototype-v1/src/client/GroupOffers.tsx
prototype-v1/src/client/NeedEditor.tsx
prototype-v1/src/client/ReportView.tsx
prototype-v1/src/client/ResultsView.tsx
prototype-v1/src/client/api.ts
prototype-v1/src/client/display.ts
prototype-v1/src/client/location.ts
prototype-v1/src/client/navigation.ts
prototype-v1/src/client/need-defaults.ts
prototype-v1/src/client/purchases.ts
prototype-v1/src/client/recorder.ts
prototype-v1/src/client/search-state.ts
prototype-v1/src/client/useAccount.ts
```

目前使用的 CSS：

```text
prototype-v1/src/client/mvp.css
prototype-v1/src/client/integration.css
prototype-v1/src/client/compact-support.css
prototype-v1/src/client/group-offers.css
prototype-v1/src/client/results-view.css
```

### 4.3 目前服務端執行程式碼

`prototype-v1/src/server/index.ts` 直接或間接使用目前 `src/server/` 下的全部 TypeScript 服務模塊，均應保留：

```text
account.ts
auth.ts
browse.ts
catalog.ts
data.ts
db.ts
gemini.ts
group-offer-memberships.ts
index.ts
parse.ts
rank.ts
search.ts
voice-upload.ts
voice.ts
```

`prototype-v1/src/server/schema.sql` 也必須保留。它不是靜態 import，但由 `db.ts` 動態讀取並在資料庫初始化時執行。

### 4.4 共享模塊

目前 `prototype-v1/src/shared/` 下的模塊均被 client、server、scripts 或 tests 使用，包括類型-only import；不能因為runtime tree-shaking 而誤判為無用。

### 4.5 資料與資料工具

應保留：

```text
prototype-v1/data/live/*.json
prototype-v1/data/食品.json
prototype-v1/scripts/catalog-files.ts
prototype-v1/scripts/check-data.ts
prototype-v1/scripts/dev.ts
prototype-v1/scripts/import.ts
prototype-v1/scripts/research-manifest.ts
prototype-v1/scripts/verify-live.ts
```

說明：

- `data/live/*.json` 是目前預設真實資料匯入來源；離線驗證為 139 筆、136 筆可比較、3 筆待確認。
- `data/食品.json` 是測試/demo fixture，CI 會使用。
- `scripts/import-expansion.ts` 不屬於日常執行鏈，但有日期化研究文件和一次性匯入用途，分類為“條件性有用”，不是死程式碼。

### 4.6 測試

`prototype-v1/tests/**` 不是 production runtime，但對目前規格驗證和 CI 有實際價值，應保留。目前問題是實作與部分測試契約漂移，而不是測試目錄無用。

## 5. 高可信度未使用：2026-09-06 已執行清理

### 5.1 Active app 內的舊客戶端樹

以下 10 個檔案沒有從目前 client entrypoint、server entrypoint、package scripts 或 tests 到達：

```text
prototype-v1/src/client/Card.tsx
prototype-v1/src/client/mockResults.ts
prototype-v1/src/client/router.ts
prototype-v1/src/client/screens/Detail.tsx
prototype-v1/src/client/screens/ListScreen.tsx
prototype-v1/src/client/screens/Results.tsx
prototype-v1/src/client/screens/Search.tsx
prototype-v1/src/client/screens/Settings.tsx
prototype-v1/src/client/screens/Shell.tsx
prototype-v1/src/client/screens/Team.tsx
```

`docs/INTEGRATION.md` 也說明 `screens/` 與 `mockResults.ts` 是歷史參考，目前 `main.tsx → App.tsx` 不 import 它們。

**執行狀態：**以上 tracked code 已從 `main` 工作樹刪除；清理前內容儲存在 `main-copy`。刪除後已重跑 typecheck、tests 與 build。

### 5.2 未被目前 HTML/manifest/service worker 引用的 public assets

```text
prototype-v1/public/apple-touch-icon.png
prototype-v1/public/icon.svg
```

目前明確使用的是：

```text
prototype-v1/public/app-icon-192.png
prototype-v1/public/app-icon-512.png
prototype-v1/public/manifest.webmanifest
prototype-v1/public/sw.js
```

**執行狀態：**確認目前 `index.html`、manifest 與 service worker 使用 `app-icon-192.png`／`app-icon-512.png` 後，以上兩個未引用圖標已刪除。

### 5.3 本地生成物：可安全重建，不應提交

以下本地目錄/檔案已被 `.gitignore` 忽略，不是 tracked source：

```text
prototype-v1/node_modules/
prototype-v1/dist/
old_version/node_modules/
old_version/dist/
*.DS_Store
prototype-v1/.scratch/catalog-expansion/   # 目前為空
```

這些可以清理本機磁盤，但不影響 Git branch 內容。`prototype-v1/.env` 含本機設定，不能提交或輸出其值；是否刪除必須由使用者決定。

## 6. 非目前 runtime，但不應直接稱為完全無用

### 6.1 `old_version/`

- 是上一版 Bun/Vite/Hono 應用快照；
- 目前 `prototype-v1` 沒有執行引用；
- 部分歷史 engineering HTML 仍連結其中程式碼；
- 內部 README 又有失效連結。

**處置建議：**移到 archive branch/tag；修正歷史連結後從 main 刪除。

### 6.2 `AIL-codex-all-in-life-mvp/`

這是另一套獨立的 Vinext/React/Tailwind/Cloudflare/Wrangler MVP，不是目前 Bun/Hono/PostgreSQL runtime。它有自己的 package、lockfile、頁面、D1/Drizzle 資產、架構圖和送件資料。

**處置建議：**

- main 只保留 `prototype-v1`；
- 整體遷移到 archive branch，或拆成獨立 legacy demo repo；
- 不應繼續與正式應用並列，避免兩套啟動方式、資料庫和部署架構混淆。

該目錄還包含大量舊 UI kit 組件。對舊 `mvp/app/page.tsx` 的依賴圖顯示約 60 個 UI 檔案中只使用 `button.tsx`、`dialog.tsx`、`progress.tsx`、`slider.tsx`，其餘組件即使在舊 demo 中也大多未使用。

### 6.3 `.scratch/`

`.scratch/` 是儲存庫最大 tracked 類別，但不是 Web App 正常啟動、build 或 request handling 的依賴。它包含：

- `.scratch/ail-mvp/issues/`：本地 issue tracker 資料，供 `.claude` workflow 使用；
- `.scratch/catalog-expansion/`：抓取網頁、headers、body、PDF/PNG、驗證日誌、資料庫 before-import 快照和研究來源。

仍存在的用途：

- `prototype-v1/scripts/import-expansion.ts` 會讀取它；
- `docs/research/expansion-2026-09-05.md` 記錄該流程；
- 部分 `data/live/*-expansion.json` 的 provenance 欄位指向其中快照。

風險：

- tracked 了大量第三方網頁與 bundle；
- 有重複檔案、空 `.error.txt`、測試日誌和資料庫快照；
- 抓取頁面中存在第三方站點公開 API key 樣式字符串，雖未證明是本項目 secret，仍可能觸發 secret scanner，並造成不必要的資料留存。

**處置建議：**先製作不可變 provenance archive，sanitize key-like 內容，再將大體積抓取資料移出 main。保留精簡 manifest、checksum、來源 URL、取得日期與必要證據即可。

### 6.4 `.claude/` 與 `.cursor/`

它們不是 Web App runtime，而是開發/Agent 工作流基礎設施。

- 團隊繼續使用這些 workflow：保留；
- 儲存庫目標是純應用原始碼：遷至獨立 tooling 或 archive；
- `.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc` 是合法 symlink，不是壞檔案。

### 6.5 `deliverables/`

包含歷史 PNG、HTML、JSON 審計/展示交付物，目前 build/test 不使用。其中 HTML/JSON 含本機絕對路徑或失效相對連結，跨機器不可攜帶。

**處置建議：**歸檔，不作為 current source of truth。

## 7. 重複內容

確認存在的重複/近重複資產包括：

- `old_version/src/client/router.ts` 與 active dead `prototype-v1/src/client/router.ts`；
- `old_version/src/client/screens/Shell.tsx` 與 active dead版本；
- `AIL-codex-all-in-life-mvp` 與 `prototype-v1` 的 192/512 app icons；
- `AIL-codex-all-in-life-mvp/docs/architecture/*.html` 與其 `mvp/public/architecture/*.html`；
- 根與舊 MVP 的 submission checklist；
- `.scratch` 中多份抓取快照、空 error files 和相似輸出。

重複不一定等於可直接刪除：若一個副本是歷史快照，應先明確 archive policy。

## 8. 文件一致性審查

### 8.1 P1：會直接誤導開發或驗收

| 檔案/位置 | 不一致 | 目前事實 | 建議 |
|---|---|---|---|
| `CLAUDE.md:3,8` | 寫 Vercel AI SDK、OpenAI-compatible provider、根 `.env.example` | 目前使用 Gemini native Interactions endpoint 與 `GEMINI_API_KEY`/`GEMINI_MODEL` | **已於 2026-09-06 更新** |
| 根 `.env.example` | 使用 `STT_*`、`LLM_*` | 有效模板是 `prototype-v1/.env.example` 的 Gemini vars | **已於 2026-09-06 刪除** |
| `README.md:151`、`docs/INTEGRATION.md:166` | 連結 `docs/testing/full-app-acceptance-2026-09-05.md` | 檔案與 `docs/testing/` 目錄均不存在 | README 斷鏈已移除；INTEGRATION 歷史內容留待後續 |
| README/SPEC 的“全綠”描述 | 聲稱自動測試全綠 | 受控離線測試有 4 fail | README 已改為日期化實際狀態；SPEC 留待後續 |
| `prototype-v1/engineering/app_features_sheet.html` | 聲稱 Auth/DB/Search 未完成、存在 `/api/transcribe`、OpenAI-compatible provider | 目前已有 Auth/DB/Search；API 是 `/api/voice` 與 `/api/parse` | **已於 2026-09-06 刪除** |
| `docs/SPEC-ingestion.md`、`docs/SPEC-geocoding.md` | 引用不存在的 `scripts/geocode.ts`；geocoding 是否已實作前後矛盾 | 沒有該腳本；坐標主要來自來源資料和 ingestion validation | 修正命令和 capability status |

### 8.2 P2：歷史狀態、API 或產品範圍漂移

| 檔案/位置 | 問題 | 建議 |
|---|---|---|
| `README.md:9-12`、`docs/INTEGRATION.md:3` | 把 `codex/integrate-mvp-ui-main-backend` 寫成目前 branch；實際為 `main`/`6be730d` | 改為“歷史整合基線” |
| `.github/workflows/integration.yml` | push filter 仍含舊 branch 名 | 保留 `main`，移除過期 filter |
| `docs/INTEGRATION.md:51`、`docs/SPEC-backend.md:312,345` | Search request 寫有不存在的 `costco_ok` | 按 `src/server/search.ts` 與 `src/client/api.ts` 更新 contract |
| `docs/SPEC-backend.md:335-346` | 將已完成前端接點寫成“後端完成後再做” | 改為目前實作狀態或歷史計劃 |
| `docs/PRD-all-in-life.md:630-650` | 將 Auth/Dashboard 等已實作能力列為未來 roadmap | 標注歷史或更新完成狀態 |
| `docs/SPEC-ingestion.md:83` | 寫“平台不追蹤成員” | 目前持久化 `group_offer_memberships` | 改寫為準確的隱私與可見性邊界 |
| `CONTEXT.md:27`、PRD | 固定圓山區 | 目前 catalog 含台北延伸、線上商品、全台服務 | 產品需正式選擇 strict 圓山或“圓山 pilot + 擴展資料” |
| `docs/integration-canvas.html` | 舊 branch、舊測試數、舊資料數 | 標為 historical 或重生成 |
| `AIL-codex-all-in-life-mvp/docs/branch-main-comparison.md` | 把舊 `mvp/` 視為展示入口、`prototype-v1` 視為參考 | 歸檔並加歷史聲明 |

### 8.3 其他 broken links / historical docs

- `old_version/README.md:5-7` 指向不存在的舊版 docs/CONTEXT；
- `deliverables/ail-integration-canvas.html` 的多個相對連結在 `deliverables/` 下無法解析；
- `docs/README-template.md` 是投稿模板，不是目前項目說明；
- `docs/submission-checklist.md` 是比賽/送件清單，不是完成證明；
- 目前根目錄沒有發現 `LICENSE`，但模板/清單要求 LICENSE，應確認發佈許可。

### 8.4 仍值得保留的文件

以下內容仍有實質價值，但應按上表更新：

```text
README.md
CONTEXT.md
docs/SPEC-backend.md
docs/SPEC-voice-input.md
docs/SPEC-ingestion.md
docs/research/README.md
docs/research/gemini-audio-structured.md
docs/adr/0001-offline-ingestion-and-per-category-ranking.md
docs/adr/0002-one-source-one-record.md
prototype-v1/engineering/backend-design.md
```

日期化 research 檔案應保留為歷史證據，但不應代替 current runtime 文件。

## 9. 驗證結果

### 9.1 通過

```text
bun run typecheck  → pass
bun run build      → pass
bun run data:validate → pass（139 筆；136 可比較；3 待確認）
```

Build 成功處理約 1,918 modules；目前 production bundle 可生成。

### 9.2 目前真實失敗

受控離線命令：

```bash
DATABASE_URL= TEST_DATABASE_URL= GEMINI_API_KEY= GEMINI_MODEL= RUN_LIVE_GEMINI_TESTS=0 bun test
```

結果：

```text
269 pass
30 skip
4 fail
303 tests / 36 files
2283 assertions
```

失敗位置：

```text
prototype-v1/tests/food-portions.test.ts:119
prototype-v1/tests/result-view.test.ts:203
prototype-v1/tests/result-view.test.ts:471
prototype-v1/tests/catalog-view.test.tsx:123
```

共同問題是 `ResultsView.tsx` 精簡後沒有繼續呈現測試/規格要求的：

- “標示 2 份／需求 5 人或份”；
- “不代表足夠全員食用”；
- pending 原因，例如“份量缺乏足夠證據，待確認”；
- “需符合資格”／“條件與詳情”；
- demo 資料的完整醒目警告與部分隱藏操作規則。

另一次繼承本機 `.env` 的完整測試出現更多 PostgreSQL connection-refused 失敗。這些額外失敗來自“環境變數存在但資料庫不可連接”；CI 會提供 PostgreSQL，但測試前置檢查仍可改善為同時判斷資料庫可達性。

**結論：**目前 main 可以 typecheck/build，但不能宣稱測試全綠；CI 的 `bun test` 步驟在 UI contract drift 修復前有失敗風險。

## 10. 建議的清理順序

### Phase 1：低風險修復

1. ~~刪除/歸檔 active app 內 10 個高可信度舊客戶端檔案。~~ **已完成**
2. ~~確認後刪除兩個未引用 public assets。~~ **已完成**
3. ~~修正 `CLAUDE.md`、根 `.env.example`、README branch 和 broken links。~~ **README、CLAUDE 與根 env 已處理；其他歷史文件留待後續**
4. 修復 4 個 UI/test contract failures。**未處理，本輪不改產品行為／規格**
5. 移除 CI 的過期 branch filter。**未處理**
6. ~~重跑 typecheck、tests、build、data validation。~~ **已完成；測試維持既有 4 fail**

### Phase 2：歸檔歷史項目

1. ~~建立 archive tag/branch。~~ **已建立 `main-copy`，指向 `6be730d`**
2. ~~將 `old_version/`、`AIL-codex-all-in-life-mvp/`、`deliverables/` 移出 main。~~ **已完成**
3. 對確實要保留的舊 demo 建獨立 repo 或明確的 `archive/` 分支；
4. 保證 current README 不再連結 archive 內檔案作為實時事實。

### Phase 3：研究資料瘦身

1. 為 `.scratch/catalog-expansion` 生成 checksum/manifest；
2. 保留最小可驗證 provenance；
3. sanitize key-like 與第三方 bundle 內容；
4. 將完整快照遷至 release artifact、object storage 或 archive branch；
5. 更新 `data/live` provenance references。

## 11. 最終分類速查

### 保留在 main

```text
prototype-v1/ 的 current runtime、shared modules、data/live、tests、有效 scripts、設定與 lockfile
.github/workflows/integration.yml
README/CONTEXT/核心 SPEC/ADR（修訂後）
```

### 已從 main 刪除（由 main-copy 保留）

```text
prototype-v1/src/client/Card.tsx
prototype-v1/src/client/mockResults.ts
prototype-v1/src/client/router.ts
prototype-v1/src/client/screens/*.tsx
prototype-v1/public/apple-touch-icon.png
prototype-v1/public/icon.svg
.env.example（根目錄過時重複模板）
本機 dist/node_modules/.DS_Store/空目錄
```

### 已從 main 移除並由 main-copy 歸檔

```text
old_version/
AIL-codex-all-in-life-mvp/
deliverables/
```

### 仍保留（不可判定為絕對安全刪除）

```text
.scratch/catalog-expansion/
日期化研究快照
```

### 需要產品/團隊決定

```text
.claude/ 與 .cursor/ 是否屬於儲存庫標準工具鏈
圓山 strict scope 或圓山 pilot + 擴展 catalog
是否保留獨立 legacy Vinext/Cloudflare demo
研究抓取證據的長期儲存位置與保留期限
```

---

**審查結論：**主應用邊界已經明確為 `prototype-v1/`。2026-09-06 已刪除 active app 內的明確死程式碼，並將兩套舊項目與歷史交付物從 `main` 移除；`main-copy` 保留清理前快照。`.scratch` 研究溯源、Agent workflow、測試、scripts、資料與規格因仍有用途或存在不確定性而保留。4 個既有 UI 測試仍失敗，規格漂移尚待後續處理。
