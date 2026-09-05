# ALL IN LIFE

> 圓山生活圈的 CP 值、零元機會與 Team 協作平台。

## 評審快速入口

| 項目 | 連結／狀態 |
| --- | --- |
| HTTPS 展示站 | [all-in-life-ail.chiehlun.chatgpt.site](https://all-in-life-ail.chiehlun.chatgpt.site)（新版已公開上線） |
| PWA 驗收 | Chrome 已顯示「可安裝到主畫面」；manifest、icons、service worker 與離線 fallback 已驗證 |
| 本次交付規格 | [`SPEC.md`](SPEC.md) |
| 官方作品繳交檢查表 | [`submission-checklist.md`](submission-checklist.md) |
| 系統架構 | [互動式架構圖](docs/architecture/all-in-life-architecture.html) |
| 產品流程 | [互動式流程圖](docs/architecture/all-in-life-product-flow.html) |
| 評選影片 | 待上傳；需不超過 2:00 並設為「知道連結即可觀看」 |

目前展示以可操作前端與 PWA 為主；正式搜尋 Agent、登入與雲端資料仍是下一階段。Fixture、估算與已查證來源會在介面及文件中明確區分。

ALL IN LIFE 是一個以「限制優先、證據可追溯、成本不造假」為原則的圓山生活決策 App。使用者可匿名直接使用，或選擇登入以銜接日後的跨裝置保存；文字與語音都會進入同一份可編輯的結構化需求，再比較餐飲、日用、育樂與交通選項。

目前版本是可操作的手機 App 型前端，共 16 個畫面：首次設定、首頁、搜尋、結果、詳情、清單、揪團、設定、個人檔案、篩選、通知、消費分析、歷史、回報與地圖等。它包含頁面轉場、語音／文字輸入、前端搜尋載入演出、收藏與到期提醒、標記已買、預算統計、分享及成團成本比較。正式 API、帳號驗證與雲端持久化尚未接上；畫面中的估算與整理資料會標示來源、查核時間與適用條件。

## 問題與目標

低預算生活決策不只是找最低標價。交通、份量、資格、時間、最低成團人數與資料可信度，都可能讓看似便宜的方案變得不可用。現有搜尋服務通常把這些條件分散在不同頁面，使用者還需要自行判斷資料是否過期。

ALL IN LIFE 的目標使用者是學生、剛進入職場者、精打細算的在地居民，以及希望一起湊優惠的小型熟人團體。產品先排除不符合硬限制或缺乏必要證據的候選，再用可解釋的 CP Value 分數排序，讓使用者知道一個選項為什麼值得選、資料從哪裡來，以及仍有哪些未知成本。

## 核心功能

- 首次設定 SOP：匿名可直接使用，登入後可保存；先設定暱稱、頭像、預算、硬限制與偏好。
- 統一需求編輯器：語音和文字共用日期、時段、類別、預算、人數、距離、排除與偏好欄位。
- 四類任務結果：餐飲、日用、育樂、交通，支援成本、距離、營業時間與服務方式比較。
- 勞動錯覺搜尋介面：以計時器和狀態管理逐步顯示來源、限制、成本與證據檢查。
- CP Value Engine：綜合價格、食物、品質、便利與折扣五個維度，再以可靠度及資料覆蓋率修正。
- Evidence Gate：缺少必要證據、違反硬限制或資料覆蓋不足時，不產生可比較分數。
- 可追溯結果：顯示來源、查核時間、適用條件、可信度與評分原因。
- 圖片可信原則：只有可確認來源與使用權的真實照片才顯示；沒有真實圖片時，以類別色塊與圖示呈現，不使用示意照冒充店家或商品實景。
- Team 揪團：呈現餐點內容、成團門檻、單獨／成團人均、承諾人數、分享與門檻前取消。
- 個人中心：可修改匿名暱稱與頭像，查看通知、收藏到期提醒、歷史與消費分析。
- 地圖與清單：內嵌 Google Maps 搜尋結果，並提供外部地圖連結；目前不提供導航。
- 語音輸入：在支援 Web Speech API 的瀏覽器中，可用繁體中文輸入需求。
- 響應式 PWA 外觀：提供 manifest、SVG app icon、手機底部導覽與桌面版配置。

## 目前完成度

| 能力 | 狀態 | 說明 |
| --- | --- | --- |
| 手機 App 多畫面介面 | 可操作 | 16 個 state-driven screens 集中在 `mvp/app/page.tsx`，固定導覽且只捲動內容區 |
| CP Value 計算 | 可操作 | 純 TypeScript 規則引擎，包含 evidence、hard constraint 與 coverage gate |
| 官方來源連結 | 部分完成 | 北美館等展示資料附原始連結與查核標示 |
| Google 地圖 | Demo | 使用公開 embed/search URL，尚未串 Places API 或儲存 Place ID |
| 搜尋流程 | 前端可操作 | 計時器與狀態管理呈現處理步驟；尚未呼叫正式搜尋或 AI API |
| Team 多人協作 | 設計／Demo | UI 與 D1 schema 已備妥，尚無登入、邀請與交易式後端 |
| Cloudflare D1 | Schema ready | migration 已建立，尚未綁定資料庫；hosting config 的 `d1` 目前為 `null` |
| PWA | 已公開驗收 | HTTPS、manifest、192/512 icons、service worker、Chrome installability 與離線 app-shell fallback 已驗證 |

## 系統架構

![ALL IN LIFE 系統架構](docs/architecture/all-in-life-architecture.visual-check.1440x900.light.png)

目前可執行路徑是 Vinext / React 前端、記憶體狀態、固定 fixture、CP Value Engine 與 Google Maps embed。下圖中的 Worker API、D1、R2、正式 Agent 與 Team Intelligence 是下一階段目標架構；詳細資料表、API contract、freshness 與 evidence 規則請參考 [`docs/SPEC-team-cp-zero-cost-v1.md`](docs/SPEC-team-cp-zero-cost-v1.md)。

資料處理原則：

1. 將使用者輸入解析成預算、人數、區域、硬限制與軟偏好。
2. 付費與零成本來源分流產生候選。
3. 正規化價格、份量、資格、有效期限與來源證據。
4. 先套用 Evidence Gate 與硬限制，再計算 CP Value。
5. 以可靠度與覆蓋率修正分數，回傳可解釋的排序與來源。

![ALL IN LIFE 產品流程](docs/architecture/all-in-life-product-flow.visual-check.1440x900.dark.png)

文件導覽：

- [本次送件與部署規格](SPEC.md)
- [互動式產品流程圖](docs/architecture/all-in-life-product-flow.html)
- [互動式系統架構圖](docs/architecture/all-in-life-architecture.html)
- [目前分支與 main 的架構、語言與衝突比較](docs/branch-main-comparison.md)
- [Team / CP / Zero-Cost 技術規格](docs/SPEC-team-cp-zero-cost-v1.md)
- [API、登入與資料持久化串接規劃](docs/API-integration-plan.md)
- [BUILDMODE 送件 checklist](submission-checklist.md)

## 使用技術

| 類型 | 技術／服務 | 用途與目前狀態 |
| --- | --- | --- |
| 前端 | React 19、TypeScript 5、Vinext、Tailwind CSS 4 | 手機 App shell、多畫面狀態導覽與 Cloudflare 相容建置 |
| UI | Base UI、shadcn、Lucide React | Dialog、Tabs、Slider、按鈕與 icon |
| 評分 | 自製 CP Value Engine | 五維加權、可靠度修正、證據與覆蓋率守門 |
| 語音 | Web Speech API | 瀏覽器端 `zh-TW` 語音辨識；不支援時回退文字輸入 |
| 地圖 | Google Maps embed / search URL | Demo 地圖與外部查詢；尚未使用付費 Places API |
| 後端目標 | Cloudflare Workers | Route handlers / server actions；目前尚未實作 |
| 資料庫目標 | Cloudflare D1 / SQLite schema | 已提供 `0001_p0_core.sql` 與 `0002_product_flow.sql`，尚未綁定或 seed |
| 物件儲存目標 | Cloudflare R2 | 規劃存放證據照片與收據；目前未啟用 |
| 部署 | OpenAI Sites + Cloudflare toolchain | 新版已發布到公開 HTTPS 展示站 |
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
   ├─ drizzle/                       # D1 / SQLite 核心與產品流程 migrations
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

### API 與 D1 schema（尚未接上 runtime）

`mvp/drizzle/0001_p0_core.sql` 定義核心資料模型，`0002_product_flow.sql` 補上搜尋需求、清單、通知、購買紀錄與揪團品項。它們目前是 migration artifact，不會在啟動前端時自動建立資料庫。完整 API 順序、資料契約、匿名轉登入與外部服務策略請見 [`docs/API-integration-plan.md`](docs/API-integration-plan.md)。

## 作品展示

- 公開展示網址：[https://all-in-life-ail.chiehlun.chatgpt.site](https://all-in-life-ail.chiehlun.chatgpt.site)（新版已公開上線）
- 評選影片：待上傳後補上（需不超過 2:00，且設為知道連結即可觀看）
- 本機展示：依上方「安裝與執行」使用 `npm run dev`

建議 Demo 順序：省錢晚餐 → 查看 CP 分解與 evidence → Team 團購門檻 → 白嫖一天 → 地圖／來源連結。完整送件狀態請看 [`submission-checklist.md`](submission-checklist.md)。

## 限制與未來工作

- 搜尋結果仍含 fixture，不代表即時價格、庫存或成團承諾；使用前必須回原始來源查核。
- 目前沒有登入、持久化 Profile、真實 Team 邀請、承諾交易或併發控制。
- 沒有正式 crawler、AI 模型、後端 API、D1 binding 或 R2 evidence upload。
- Google 地圖採 embed/search URL，沒有 2 km geofence、Places attribution pipeline 或路線導航。
- 語音辨識依賴瀏覽器能力，結果不會上傳至本專案後端，但瀏覽器供應商可能依其政策處理語音。
- Chrome 已確認觸發 PWA installability，service worker 與離線 app-shell fallback 亦已驗證；正式送件前仍建議在目標 Android／iOS 實機各完成一次安裝與飛航模式重載。
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

| 姓名 | Email | 大致分工 |
| --- | --- | --- |
| 丁肇志（Ting） | [conanlong911@gmail.com](mailto:conanlong911@gmail.com) | 產品方向、核心流程、語音輸入、PWA 與 Demo 串場 |
| 林軒緯（緯） | [xuanweilin805@gmail.com](mailto:xuanweilin805@gmail.com) | 前端協作、互動與跨裝置測試、部署驗收 |
| Andrew Fai（AF） | [andydrewie@gmail.com](mailto:andydrewie@gmail.com) | 資料來源整理、Evidence 驗證、影片錄製與備援素材 |
| 楊杰倫（Jay Yang） | [cl.yang04@gmail.com](mailto:cl.yang04@gmail.com) | CP / Team / Zero-Cost 規格、README、送件文件與發布整合 |

分工是送件用的大方向，實際工作可互相支援。正式送件前請由主要聯絡人確認表單上的姓名、Email 與最終分工一致。

## License

目前儲存庫尚未加入 `LICENSE`，因此預設保留所有權利，不能視為開源授權。送件前請由專案權利人選定授權（例如 MIT）並在根目錄加入明確的 `LICENSE` 檔案；此項已在 checklist 標為未完成。
