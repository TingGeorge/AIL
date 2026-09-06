# ALL IN LIFE

ALL IN LIFE 是一個以來源證據、真實成本與明確限制協助使用者尋找生活選項的 Web App。目前應用提供語音／文字需求輸入、五類資料搜尋、結果與詳情、帳號、收藏、清單、預算、回報和團體優惠參與功能。

## 目前版本

- 目前正式分支：`main`
- 清理前完整備份：`main-copy`
- 唯一可執行應用：`prototype-v1/`
- 技術堆疊：Bun、Hono、React、Vite、PostgreSQL、Zod
- AI provider：Google Gemini native Interactions API
- 目前真實資料快照：139 筆公開資料，136 筆可比較，3 筆待確認

`main-copy` 保留本次儲存庫清理前、commit `6be730d` 的完整內容。舊應用、舊 UI 快照與歷史交付物不再放在 `main` 內作為第二套 runtime。

## 儲存庫結構

```text
prototype-v1/
├── src/client/       # 目前 React UI
├── src/server/       # Hono API、PostgreSQL、Gemini 與業務邏輯
├── src/shared/       # Client/server 共用 schema、types 與規則
├── data/live/        # 目前真實來源資料
├── data/食品.json     # 測試／demo fixture
├── scripts/          # 開發、匯入、驗證與 smoke test 工具
├── tests/            # Bun tests
├── public/           # PWA manifest、service worker 與正式 icons
├── package.json
└── bun.lock

docs/                 # 產品、規格、ADR 與研究說明
.scratch/             # 研究溯源與本地 issue 工件；不是應用 runtime
.claude/、.cursor/     # 開發與 Agent workflow 設定；不是應用 runtime
```

## 已實作功能

| 範圍 | 目前行為 |
|---|---|
| 需求輸入 | 語音經 Gemini 轉成 `{transcript, need}`；文字與人工修正使用 `/api/parse` |
| 搜尋 | PostgreSQL 候選、確定性硬限制、食品份量規則、AI 排序與 SSE 輸出 |
| 未輸入需求時瀏覽 | 可直接瀏覽全部五類資料，不呼叫 AI |
| 結果與詳情 | 顯示價格、條件、資料狀態、來源證據、地區與團體優惠 |
| 帳號 | Username/password、Argon2id、opaque session token、登出與改密碼 |
| 收藏與清單 | 登入後分別儲存至 PostgreSQL；兩者是獨立狀態 |
| 預算與支出 | 月預算、手動支出、標記已買、生存模式、偏好與排除條件 |
| 團體優惠 | 顯示公開名額狀態；登入後可加入或退出，系統儲存必要 membership record |
| 回報 | 登入後提交資料問題與公開備註；回報不會自動變成已驗證資料 |
| PWA | Manifest、service worker 與公開頁面靜態資源快取；API 和帳號內容不快取 |

## 本機啟動

需要：

- Bun 1.4.0 或以上
- 可連接的 PostgreSQL
- Gemini 功能需要有效的 `GEMINI_API_KEY` 與 `GEMINI_MODEL`

所有應用命令都在 `prototype-v1/` 內執行：

```bash
cd prototype-v1
bun install --frozen-lockfile
cp -n .env.example .env
```

在 `.env` 設定資料庫：

```dotenv
DATABASE_URL=postgres://localhost/ail
GEMINI_API_KEY=
GEMINI_MODEL=
PORT=3000
SUPPORT_EMAIL=
ALLOW_DEMO_DATA=0
DATA_DIR=
```

準備資料並啟動：

```bash
bun run data:validate
bun run db:import
bun run dev
```

預設開發網址：

```text
http://localhost:5173
```

Vite 會將 `/api` proxy 到 Bun/Hono server。正式環境流程為先執行 `bun run build`，再執行 `bun run start`。

### 臨時手機 Demo（ngrok）

先完成上方的 `bun install`、`.env` 與資料庫匯入。接著從 repository 根目錄操作，並在兩個 Terminal 分別啟動 Web App 和 ngrok：

```bash
# 只需在首次設定 ngrok 時執行（macOS / Homebrew）
brew install ngrok
ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>

# Terminal 1：從 repository 根目錄啟動 Web App
cd prototype-v1
bun run build
bun run start

# Terminal 2：ngrok 可在任何目錄執行
ngrok http 3000

# Demo 結束：在兩個 Terminal 分別按 Ctrl-C
```

`bun run start` 應在 `http://localhost:3000` 提供 production build；ngrok 會輸出一個臨時 HTTPS URL，可在手機瀏覽器開啟。Demo 使用與本機相同的資料庫和 server 環境變數；不要公開分享長期有效的憑證，也不要把臨時 ngrok URL 當作正式部署網址。

## 常用命令

```bash
bun run dev            # API + Vite development server
bun run start          # 啟動 Bun/Hono server
bun run typecheck      # TypeScript 檢查
bun test               # 執行測試
bun run build          # Vite production build
bun run check          # typecheck + test + build
bun run data:validate  # 驗證 JSON 來源資料
bun run db:import      # 匯入 PostgreSQL
bun run data:check     # 檢查資料庫或資料狀態
bun run data:smoke     # HTTP/live catalog smoke test
bun run data:manifest  # 更新研究 manifest
```

## 資料模式

預設使用：

```text
prototype-v1/data/live/*.json
```

目前資料類別：

- 食品：44 筆
- 日用品：21 筆
- 免費／公益資源：21 筆
- 活動：29 筆，其中 3 筆待確認
- 交通：24 筆

真實資料與虛構 fixture 分開。若明確需要 demo fixture：

```bash
DATA_DIR=./data ALLOW_DEMO_DATA=1 bun run db:import
```

不要在正式環境開啓 `ALLOW_DEMO_DATA=1`。

## 目前驗證狀態

2026-09-06 清理後本機復核結果：

```text
bun run typecheck      PASS
bun run build          PASS
bun run data:validate  PASS
```

安全離線測試命令：

```bash
DATABASE_URL= TEST_DATABASE_URL= \
GEMINI_API_KEY= GEMINI_MODEL= \
RUN_LIVE_GEMINI_TESTS=0 bun test
```

目前結果：

```text
269 pass
30 skip
4 fail
303 tests / 36 files
```

4 個失敗集中在結果 UI 與既有測試契約的差異：食品份量不足警示、pending 原因、資格／條件摘要，以及 demo 資料警告。**因此目前版本尚不能宣稱自動測試全綠。**

資料庫整合測試必須使用獨立測試資料庫；不要將 fixture tests 指向正式資料庫。實際 Gemini 測試也必須顯式設定 `RUN_LIVE_GEMINI_TESTS=1`，且會產生外部 API 請求與費用。

## 重要邊界

- 目前以圓山區作為預設需求語義，但資料也包含台北延伸地區、線上商品與全台公共服務；每筆結果仍須依自己的地區、配送、資格和時段判斷。
- 資料是日期化研究快照，不代表即時價格、庫存、名額或全市場覆蓋。
- 系統提供團體優惠資訊、人數進度與 membership 記錄，但不代訂、不付款、不代替商家確認。
- 音訊、逐字稿、Need 和精確位置不寫入本應用資料庫；語音和必要文字會送往 Gemini。`store:false` 不等於 Google 整體零保留承諾。
- 精確位置不會送入排名模型；正式部署仍須設定 edge／反向代理限流、秘密管理與資料庫備份。

## 文件

- [領域詞彙與產品邊界](CONTEXT.md)
- [Backend 規格](docs/SPEC-backend.md)
- [語音輸入規格](docs/SPEC-voice-input.md)
- [資料匯入規格](docs/SPEC-ingestion.md)
- [Geocoding 規格](docs/SPEC-geocoding.md)
- [資料研究、覆蓋與限制](docs/research/README.md)
- [Repository audit](docs/repository-audit-2026-09-05.md)

規格檔案目前仍包含部分歷史狀態，後續會另行校正；本 README 以目前 `main` 的實際程式碼與驗證結果為準。
