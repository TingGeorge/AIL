# ALL in Life

> 圓山生活圈的 CP 值、零元機會與 Team 協作平台。

ALL in Life 是一個以「限制優先、證據可追溯、成本不造假」為原則的生活決策 Demo。使用者可以輸入預算、人數、飲食限制與偏好，從「省錢晚餐」、「Team 團購」或「白嫖一天」三條路徑出發，比較圓山站周邊的餐食、免費資源、活動與交通方案。

目前版本是可互動的單頁前端 MVP：搜尋流程、部分團購資料與狀態是 Demo fixture；D1 schema、多人協作與資料擷取流程已完成技術規格，但尚未接上正式後端。這個邊界會在介面與文件中明確標示，避免把模擬結果誤認為即時優惠。

## 問題與目標

低預算生活決策不只是找最低標價。交通、份量、資格、時間、最低成團人數與資料可信度，都可能讓看似便宜的方案變得不可用。現有搜尋服務通常把這些條件分散在不同頁面，使用者還需要自行判斷資料是否過期。

ALL in Life 的目標使用者是學生、剛進入職場者、精打細算的在地居民，以及希望一起湊優惠的小型熟人團體。產品先排除不符合硬限制或缺乏必要證據的候選，再用可解釋的 CP Value 分數排序，讓使用者知道一個選項為什麼值得選、資料從哪裡來，以及仍有哪些未知成本。

## 核心功能

- 三種任務路徑：省錢晚餐、Team 團購、白嫖一天。
- 預算與限制：設定月預算、保留金、剩餘天數、單次預算、人數、硬性排除與軟偏好。
- 雙 Agent 搜尋演出：付費選項與零成本情報平行整理，並清楚標示目前為前端模擬流程。
- CP Value Engine：綜合價格、食物、品質、便利與折扣五個維度，再以可靠度及資料覆蓋率修正。
- Evidence Gate：缺少必要證據、違反硬限制或資料覆蓋不足時，不產生可比較分數。
- 可追溯結果：顯示來源、查核時間、適用條件、可信度與評分原因。
- Team 團購 Demo：呈現成團門檻、已承諾人數與未達門檻前不可套用優惠價的規則。
- 地圖與清單：內嵌 Google Maps 搜尋結果，並提供外部地圖連結；目前不提供導航。
- 語音輸入：在支援 Web Speech API 的瀏覽器中，可用繁體中文輸入需求。
- 響應式 PWA 外觀：提供 manifest、SVG app icon、手機底部導覽與桌面版配置。

## 目前完成度

| 能力 | 狀態 | 說明 |
| --- | --- | --- |
| 響應式互動介面 | 可操作 | 主要流程集中在 `mvp/app/page.tsx` |
| CP Value 計算 | 可操作 | 純 TypeScript 規則引擎，包含 evidence、hard constraint 與 coverage gate |
| 官方來源連結 | 部分完成 | 北美館等展示資料附原始連結與查核標示 |
| Google 地圖 | Demo | 使用公開 embed/search URL，尚未串 Places API 或儲存 Place ID |
| 搜尋 Agent | 模擬 | 以本地 fixture 與計時器展示平行搜尋狀態，未呼叫 AI 模型 |
| Team 多人協作 | 設計／Demo | UI 與 D1 schema 已備妥，尚無登入、邀請與交易式後端 |
| Cloudflare D1 | Schema ready | migration 已建立，尚未綁定資料庫；hosting config 的 `d1` 目前為 `null` |
| 離線 PWA | 部分完成 | manifest 與 service worker 檔案已建立，尚未註冊與完成離線驗收 |

## 系統架構

![ALL in Life 系統架構](docs/architecture/all-in-life-architecture.visual-check.1440x900.light.png)

目前可執行路徑是 Vinext / React 前端、記憶體狀態、固定 fixture、CP Value Engine 與 Google Maps embed。下圖中的 Worker API、D1、R2、正式 Agent 與 Team Intelligence 是下一階段目標架構；詳細資料表、API contract、freshness 與 evidence 規則請參考 [`docs/SPEC-team-cp-zero-cost-v1.md`](docs/SPEC-team-cp-zero-cost-v1.md)。

資料處理原則：

1. 將使用者輸入解析成預算、人數、區域、硬限制與軟偏好。
2. 付費與零成本來源分流產生候選。
3. 正規化價格、份量、資格、有效期限與來源證據。
4. 先套用 Evidence Gate 與硬限制，再計算 CP Value。
5. 以可靠度與覆蓋率修正分數，回傳可解釋的排序與來源。

產品操作流程圖可在 [`docs/architecture/all-in-life-product-flow.html`](docs/architecture/all-in-life-product-flow.html) 中互動檢視。

## 使用技術

| 類型 | 技術／服務 | 用途與目前狀態 |
| --- | --- | --- |
| 前端 | React 19、TypeScript 5、Vinext、Tailwind CSS 4 | 響應式單頁介面與 Cloudflare 相容建置 |
| UI | Base UI、shadcn、Lucide React | Dialog、Tabs、Slider、按鈕與 icon |
| 評分 | 自製 CP Value Engine | 五維加權、可靠度修正、證據與覆蓋率守門 |
| 語音 | Web Speech API | 瀏覽器端 `zh-TW` 語音辨識；不支援時回退文字輸入 |
| 地圖 | Google Maps embed / search URL | Demo 地圖與外部查詢；尚未使用付費 Places API |
| 後端目標 | Cloudflare Workers | Route handlers / server actions；目前尚未實作 |
| 資料庫目標 | Cloudflare D1 / SQLite schema | 已提供 `mvp/drizzle/0001_p0_core.sql`，尚未綁定或 seed |
| 物件儲存目標 | Cloudflare R2 | 規劃存放證據照片與收據；目前未啟用 |
| 部署 | OpenAI Sites + Cloudflare toolchain | 專案已有 hosting 設定，公開展示網址待補 |
| AI 模型 | 尚未串接 | 目前 Agent 是可辨識的 UX 模擬，不會宣稱模型產生即時結果 |

## 專案結構

```text
.
├─ README.md                         # 專案入口與重現說明
├─ submission-checklist.md           # BUILDMODE 送件前逐項檢查
├─ docs/
│  ├─ PRD-all-in-life.md             # 產品需求
│  ├─ SPEC-all-in-life-mvp.md        # MVP UI / UX 規格
│  ├─ SPEC-team-cp-zero-cost-v1.md   # Team、CP、D1 與 evidence 技術規格
│  └─ architecture/                  # 架構圖、流程圖與可檢視 HTML
└─ mvp/
   ├─ app/                           # Vinext App Router 頁面、layout、manifest
   ├─ components/ui/                 # UI 元件
   ├─ db/schema.ts                   # Domain type 與資料表名稱
   ├─ drizzle/0001_p0_core.sql       # D1 / SQLite P0 migration
   ├─ lib/cp-engine.ts               # CP Value 規則引擎
   └─ public/                        # PWA icon、service worker、架構頁
```

## 安裝與執行

### 環境需求

- Node.js `22.13.0` 以上
- npm（隨 Node.js 安裝）
- 建議使用最新版 Chrome、Edge 或 Safari；語音辨識支援度依瀏覽器而異

### 本機開發

```bash
git clone https://github.com/TingGeorge/AIL.git
cd AIL/mvp
npm ci
npm run dev
```

開啟終端機顯示的本機網址，通常是 `http://localhost:3000`。若要讓同一區域網路的手機測試：

```bash
npm run dev:lan
```

接著用手機開啟電腦的區網 IP 與終端機顯示的 port。Windows 防火牆可能會要求允許 Node.js 的私人網路連線。

### 品質檢查與正式建置

```bash
cd mvp
npm run lint
npm run build
```

如需檢查格式，可執行 `npm run format -- --check`。建置輸出位於 `mvp/dist/`；完成 build 後可用下列指令啟動 Cloudflare 本機 runtime：

```bash
npm run start
```

目前 Demo 不需要 `.env` 或 API key。未來若接 Google Places、AI 模型或 Cloudflare 資源，請使用平台 secret / environment binding，絕對不要提交金鑰。

### D1 schema（尚未接上 runtime）

`mvp/drizzle/0001_p0_core.sql` 定義 P0 資料模型。它目前是設計與 migration artifact，不會在啟動前端時自動建立資料庫。正式啟用前需先在 Cloudflare 建立 D1 binding、確認 migration 指令與備份策略，再更新 `mvp/.openai/hosting.json`。

## 作品展示

- 公開展示網址：待部署後補上
- 評選影片：待上傳後補上（需不超過 2:00，且設為知道連結即可觀看）
- 本機展示：依上方「安裝與執行」使用 `npm run dev`

建議 Demo 順序：省錢晚餐 → 查看 CP 分解與 evidence → Team 團購門檻 → 白嫖一天 → 地圖／來源連結。完整送件狀態請看 [`submission-checklist.md`](submission-checklist.md)。

## 限制與未來工作

- 搜尋結果仍含 fixture，不代表即時價格、庫存或成團承諾；使用前必須回原始來源查核。
- 目前沒有登入、持久化 Profile、真實 Team 邀請、承諾交易或併發控制。
- 沒有正式 crawler、AI 模型、後端 API、D1 binding 或 R2 evidence upload。
- Google 地圖採 embed/search URL，沒有 2 km geofence、Places attribution pipeline 或路線導航。
- 語音辨識依賴瀏覽器能力，結果不會上傳至本專案後端，但瀏覽器供應商可能依其政策處理語音。
- Service worker 尚未在 app 中註冊，因此目前不能宣稱完整離線或可安裝驗收已通過。
- CP 分數使用 Demo 維度值；正式上線需加入 cohort normalization、policy version、freshness 與 score audit。
- Community report、食安事件與商家合作需先完成 moderation、隱私、濫用防護及法務規則。

下一步優先順序為：接上 evidence-backed 資料與 D1 → 完成登入及 Team transaction → Google Places 合規整合 → PWA / accessibility / offline 驗收 → 正式部署與監控。

## 第三方服務、資料與素材

| 項目 | 來源 | 用途／授權或使用說明 |
| --- | --- | --- |
| npm 套件 | 各套件 registry / repository | 依各套件授權；完整版本鎖定於 `mvp/package-lock.json` |
| Google Maps | [Google Maps](https://www.google.com/maps) | 使用公開 embed 與 search URL；受 Google Maps 條款約束，不在本 repo 儲存 map tiles |
| 臺北市立美術館 | [時間與票價](https://www.tfam.museum/Common/editor.aspx?ddlLang=zh-tw&id=230) | 展示票價／免費條件的來源連結；內容權利屬原發布者 |
| 臺北典藏植物園 | [臺北市政府公開頁面](https://english.udd.gov.taipei/News_Content.aspx?n=DD9CEC17A97FBC64&s=40E52F644FD67A6C&sms=72544237BBE4C5F6) | 展示免費導覽資訊的來源連結；出發前需再查核 |
| 字型 | Geist / Geist Mono | 由應用程式框架載入；依其 SIL Open Font License 使用 |
| Icons | Lucide | ISC License；用於介面圖示 |
| 架構圖 | 本專案產製 | 原始 JSON、HTML 與 PNG 位於 `docs/architecture/` |
| Demo fixture | 本專案程式碼 | 只用於驗證 UI 與排序，不是第三方商業事實 |

本儲存庫不應包含 API key、Token、密碼、真實個資或未授權的使用者證據照片。第三方內容只保留必要短摘、canonical URL、查核時間與授權／保留政策。

## 團隊成員

| 姓名／提交者 | 分工 |
| --- | --- |
| Ting | 產品流程、語音輸入、PWA、主要 UI 與互動流程 |
| Jay | 月度生存任務 UI、Team / CP / Zero-Cost 規格與送件文件 |
| Codex | MVP 實作協作、Budget / Squad / Community 規劃 |

正式送件前請由團隊確認顯示姓名、隊伍資料、聯絡人與最終分工。

## License

目前儲存庫尚未加入 `LICENSE`，因此預設保留所有權利，不能視為開源授權。送件前請由專案權利人選定授權（例如 MIT）並在根目錄加入明確的 `LICENSE` 檔案；此項已在 checklist 標為未完成。
