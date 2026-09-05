# ALL IN LIFE — 前後端整合版

保留 **All in Life MVP 的深色／螢光綠 UI**，接到 **main 的 Bun + Hono + PostgreSQL 後端**。找生活選項、核對來源與成本，登入後儲存收藏、清單及設定。

> **預設使用 `data/live` 的五類第一手來源資料：39 筆公開、37 筆可比較、2 筆待確認。** 這是有限範圍的研究快照，不是全網資料或即時庫存。舊 10 筆虛構 fixture 只用於測試、預設不公開。詳見 [來源研究、涵蓋與限制](docs/research/README.md)。

## 這個分支結合了什麼？

- 分支：`codex/integrate-mvp-ui-main-backend`
- UI 來源：`codex/all-in-life-mvp`，commit `39148e9`。
- 後端基礎：本機 `main`，commit `cd1767c`；保留其較 `origin/main` `45f57ed` 多出的搜尋 SSE／候選 API／PWA 實作。
- **單一可執行套件：`prototype-v1/`**。沒有同時啟動 Vinext、Cloudflare 與 Bun 三套 runtime，也不使用巢狀資料夾內的舊快照。
- [串接方式、API 表格與差異處理](docs/INTEGRATION.md)
- [HTML 串接圖與功能對照](docs/integration-canvas.html)（下載／以瀏覽器開啟；GitHub 檔案頁不直接執行 HTML）

## 已接通的功能

| 畫面 | 真實行為 |
|---|---|
| 首頁、需求確認 | 語音 → Gemini 一次回傳 `{transcript,need}` → 人工確認；文字／修正仍走 `/api/parse`；無 key 可手動填寫 |
| 搜尋、五類結果 | PostgreSQL 候選 → 證據與限制篩選 → 付費／免費分組排序 → SSE；AI 失敗明示成本排序 |
| 詳情、優惠 | 真實欄位、來源摘錄、已知／未知成本、商家團購門檻／兌換碼與試算；不假造 CP 分數、成員或訂單 |
| 帳號 | username/password、Argon2id、30 分鐘 opaque token、登出撤銷、改密碼撤銷所有 session |
| 收藏、清單 | 登入後保存到 PostgreSQL；重整從 API 還原，不靠 mock/localStorage |
| 設定、支出 | 月預算、手動支出、明確「標記已買」累計、跨月處理、生存模式、排除與偏好；不是付款服務 |
| 回報 | 七類原因與公開註記，需登入；使用者陳述不自動變成已驗證資料 |
| PWA | 主畫面安裝／公開介面快取；API、帳號內容與搜尋結果不快取 |

## 本機啟動

需要 **Bun 1.4.0 或以上**與可連線的 **PostgreSQL**。以下指令都在 `prototype-v1/` 執行。

```bash
cd prototype-v1
bun install --frozen-lockfile
# 若已經有 .env，請保留它，只補缺少的欄位。
cp -n .env.example .env
```

1. 建立專用資料庫（例如 `createdb ail`），在 `.env` 設定自己的 `DATABASE_URL`。帳號需能建立表；啟動時套用 `src/server/schema.sql`。
2. 選擇資料來源：

```bash
# 預設匯入 data/live 的五類真實來源資料；先驗證、再原子寫入。
bun run data:validate
bun run db:import
bun run data:check

# 自訂經驗證的來源資料夾：
DATA_DIR=/absolute/path/to/candidate-json bun run db:import
```

舊示範資料不會刪除，但 API 預設不顯示。只有測試資料庫才使用 `DATA_DIR=./data ALLOW_DEMO_DATA=1 bun run db:import`；啟動時也需明確允許 demo 才會公開顯示。

3. 啟動：

```bash
bun run dev
```

開啟終端顯示的 Vite 網址（通常是 `http://localhost:5173`）。Vite 將 `/api` 代理到 Bun，預設 3000；設定 `PORT` 時兩邊會一起調整。Ctrl-C 會停止兩個子程序。

### Production build／同源執行

```bash
bun run typecheck
bun run build
bun run start
```

Bun 會同時提供 `dist/` 和 `/api/*`。正式部署需 HTTPS、資料庫備份及存取限制。語音／定位需要安全環境與使用者同意。不要把 Vite 開發伺服器當成正式部署。

### 可選的 AI 語音與排序

2026-09-05 改用 **Gemini 原生 Interactions API**。錄音停止後只呼叫一次 `/api/voice`，直接取得逐字稿與 Need，進入條件頁供人工確認；不再串接獨立 STT 或自動呼叫文字解析。使用者主動編輯文字／輸入修正時才呼叫 `/api/parse`。API key 僅在 server env，不會嵌入前端。契約與官方文件差異見 [Gemini 查核紀錄](docs/research/gemini-audio-structured.md)。

| 設定 | 用途 |
|---|---|
| `DATABASE_URL` | PostgreSQL；搜尋、帳號與回報需要它 |
| `GEMINI_API_KEY` | server-only Google Gemini API key；語音、文字解析與分組推薦排序共用 |
| `GEMINI_MODEL` | 部署者選擇且帳號可用、支援音訊及結構化輸出的 `gemini-*` 模型 ID；接受 `models/` 前綴並在呼叫前移除；無預設模型 |
| `SUPPORT_EMAIL` | 可選；忘記密碼時顯示支援聯絡方式，未設定就不假造支援信箱 |
| `PORT` | Bun 監聽埠，預設 3000 |
| `DATA_DIR` / `ALLOW_DEMO_DATA` | 預設 `data/live`；自訂匯入資料夾／明確允許匯入與公開示範資料 |
| `GOOGLE_MAPS_API_KEY` | 可留空；本批次只提升附官方證據的來源座標，無座標不猜測；未實作需 key 的批次 geocoding |

`GET /api/config` 回傳 `voice`、`parse`、`ranking`、`database`、`support_email`、`area`；這些旗標是設定狀態，不是健康檢查。`voice:false` 不顯示錄音入口；`parse:false` 仍可手動填條件並搜尋（搜尋需 DB）。Google endpoint 固定，沒有可自訂的 AI base URL。

語音入口提示「停止後音訊會傳送給 Gemini 解析」。錄音最多 **30 秒（30,000 ms）**；檔案最多 **5 MiB**，multipart 最多 **6 MiB**。保留實際 WebM／OGG；Safari 的 AAC MP4 容器以 `audio/m4a`、`.m4a` 上傳，不改寫音訊 bytes、不假冒 WAV。後端保留 multipart part 的 Content-Type 並核對基本檔頭；不是完整解碼器，也不以伺服器 timeout 驗證音檔長度。

Session 固定 **1,800 秒**，不是 sliding expiration；舊範本的 `AUTH_SESSION_TTL_SECONDS` 不再列出，避免看似可調但實際未生效。

## 驗證

**最新驗證（2026-09-05）**：全套安全測試 **151 pass / 28 skip / 0 fail，942 assertions**；typecheck 與 production build 通過。fixture suite 未觸及真實 DB。另以實際 `gemini-3.5-flash-lite` 通過文字解析、約 5 秒合成中文 WebM → `{transcript,need}`，以及 39 筆真實 catalog 的確認→搜尋→AI 排序 UI smoke；已修復排序 schema 的 `maxItems:500` 造成 HTTP 400。這是有限樣本實測，不代表真機麥克風、其他 codec 或所有語意品質已驗收。

```bash
# 安全的離線測試；明確覆蓋本機 .env，不連資料庫或真實 Gemini。
DATABASE_URL= GEMINI_API_KEY= GEMINI_MODEL= RUN_LIVE_GEMINI_TESTS=0 bun test
bun run typecheck
bun run build

# DB 整合測試必須使用獨立測試資料庫；會 upsert fixture，不能指向正式資料庫。
DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:5432/ail_test \
GEMINI_API_KEY= GEMINI_MODEL= RUN_LIVE_GEMINI_TESTS=0 bun test
```

- 沒有 `DATABASE_URL` 時 DB 測試會 skip；設了錯誤連線字串會失敗，不會偽裝測試通過。
- 實際模型測試須設定有效的 `GEMINI_API_KEY`／`GEMINI_MODEL` 並明確啟用 `RUN_LIVE_GEMINI_TESTS=1`；mock 測試不證明 Gemini 可用性或語音品質。
- CI 使用隔離 PostgreSQL，安裝鎖定依賴、匯入 fixture、檢查型別、測試、建置，再匯入真實資料做五類 HTTP／SSE 驗收；不使用真實 provider key。
- 瀏覽器人工驗證與限制詳見整合文件。尚未宣稱已部署到公開網址；Gemini live smoke 範圍與真機／跨瀏覽器待驗項目見 [查核紀錄](docs/research/gemini-audio-structured.md)。

## 仍需明確知道的限制

- 所選類別只決定優先顯示，依規格仍搜尋全部五類；不是類別硬篩選。
- 人數／份量、日期、時段與資格部分仍是文字欄位，無法保證結構化硬篩選。未標示成分不等於無過敏原；距離未知不等於符合限制。
- 資料主要為圓山／大龍峒／花博，另含明示的士林場館、線上配送與全臺服務；與原 PRD 固定圓山範圍的差異記錄於整合文件，不保證全部是步行內選項。
- 真實資料與測試 fixture 分開；首頁 `/api/catalog` 顯示實際資料庫五類涵蓋。網頁來源是查核快照，不代表即時價格、庫存、名額或完整覆蓋所有圓山商家。
- 团購是商家優惠資訊與試算，不是成員管理、付款或下單。
- 目前帳號 PUT 是完整文件、單分頁序列化；不同裝置同時儲存是最後寫入者優先，未實作多裝置衝突合併。
- 登入限流是有上限的單程序防護；正式公開部署仍需 edge／反向代理針對註冊、搜尋、語音與回報設置流量／成本限制，多實例需共享限流。
- 音訊、逐字稿、Need、精確位置不寫入本應用資料庫。語音送往 Gemini，文字／修正與必要候選內容也會送往 Gemini。`store:false` 不保存可供後續取回的 Interaction，**不是整體零保留、不用於訓練或無安全日誌的承諾**；部署者須核對服務層級、地區及 Google 當期條款。精確座標不送到排名模型。
