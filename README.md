# ALL IN LIFE — 前後端整合版

保留 **All in Life MVP 的深色／螢光綠 UI**，接到 **main 的 Bun + Hono + PostgreSQL 後端**。找生活選項、核對來源與成本，登入後儲存收藏、清單及設定。

> **目前附帶的是 10 筆虛構示範紀錄，不是真實店家清單。** 介面會標示「示範測試資料」，禁止以示範資料進行購買導向、地圖導航或兌換。正式展示前，請匯入有真實來源與證據的資料。

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
| 首頁、需求確認 | 文字／語音 → 逐字稿確認 → 共用 Need schema；沒有 AI 設定仍可手動填寫 |
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
# 只用於本機開發／Demo；明確允許匯入附帶的虛構 fixture。
ALLOW_DEMO_DATA=1 bun run db:import

# 或匯入真正來源的 JSON（請改成你自己的絕對路徑）。
DATA_DIR=/absolute/path/to/candidate-json bun run db:import
```

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

`.env.example` 列出完整設定；沒有任何 key 會嵌入前端。

| 設定 | 用途 |
|---|---|
| `DATABASE_URL` | PostgreSQL；搜尋、帳號與回報需要它 |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | OpenAI-compatible 需求解析與各群组推薦排序 |
| `STT_BASE_URL` / `STT_API_KEY` / `STT_MODEL` | OpenAI-format `/audio/transcriptions` |
| `SUPPORT_EMAIL` | 可選；忘記密碼時顯示支援聯絡方式，未設定就不假造支援信箱 |
| `PORT` | Bun 監聽埠，預設 3000 |
| `DATA_DIR` / `ALLOW_DEMO_DATA` | 自訂匯入資料夹／明確允許示範資料 |
| `GOOGLE_MAPS_API_KEY` | 留給既有離線資料處理；搜尋／瀏覽器不使用它、不曝光它 |

Session 固定 **1,800 秒**，不是 sliding expiration；舊範本的 `AUTH_SESSION_TTL_SECONDS` 不再列出，避免看似可調但實際未生效。

## 驗證

2026-09-05 本機隔離資料庫驗證：**101 通過、6 跳過、0 失敗**；型別檢查與正式版建置通過。

```bash
# 必須使用獨立測試資料庫；匯入測試會 upsert fixture，不能指向正式資料庫。
DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:5432/ail_test \
LLM_BASE_URL= LLM_MODEL= STT_BASE_URL= STT_MODEL= bun test
bun run typecheck
bun run build
```

- 沒有 `DATABASE_URL` 時 DB 測試會 skip；設了錯誤連線字串會失敗，不會偽裝測試通過。
- 實際 provider 的 6 個需求解析測試，只有明確設定 provider 才執行。
- CI 使用隔離 PostgreSQL，安裝鎖定依賴、匯入 fixture、檢查型別、測試、建置；不使用真實 provider key。
- 瀏覽器人工驗證與限制詳見整合文件。尚未宣稱已部署到公開網址，亦未宣稱真實 STT／LLM 已驗收。

## 仍需明確知道的限制

- 人數／份量、日期、時段與資格部分仍是文字欄位，無法保證結構化硬篩選。未標示成分不等於無過敏原；距離未知不等於符合限制。
- 現成 fixture 只有食品類；其餘類別介面與契約已接通，但空資料不會由 UI 假造。
- 团購是商家優惠資訊與試算，不是成員管理、付款或下單。
- 目前帳號 PUT 是完整文件、單分頁序列化；不同裝置同時儲存是最後寫入者優先，未實作多裝置衝突合併。
- 登入限流是有上限的單程序防護；正式公開部署仍需 edge／反向代理針對註冊、搜尋、語音與回報設置流量／成本限制，多實例需共享限流。
- 音訊、逐字稿、Need、精確位置不寫入本應用資料庫。語音與解析會將必要內容送到你設定的 provider；該 provider 的保留政策需由部署者確認。精確座標不送到排名模型。
