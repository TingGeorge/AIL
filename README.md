# ALL IN LIFE

ALL IN LIFE 是一個以來源證據、真實成本與明確限制協助使用者尋找生活選項的 Web App。目前應用提供語音／文字需求輸入、五類資料搜尋、結果與詳情、帳號、收藏、清單、預算、回報和團體優惠參與功能。

## 作品摘要（100–200 字）

ALL IN LIFE 將使用者的預算、時間、距離、資格與偏好整理成可確認的需求，從五類公開來源快照中先以確定性規則排除不符合條件的項目，再由 Gemini 排序既有候選。結果保留價格、份量、必要費用、資料狀態與來源證據；訪客可先在瀏覽器保存，登入後再安全同步，協助使用者把省下的日常成本投入真正重視的目標。

## 問題與解法

生活優惠、免費資源與活動資訊分散在不同來源，價格、份量、資格及時效也常被省略。ALL IN LIFE 不把未知值猜成優惠：伺服器先執行可重現的硬限制，再讓 AI 排序既有候選，最後把來源與限制一起交還使用者確認。

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
| 品牌入口 | AILI、ALL IN 理念、慢速循環打字、立體指南針與金錢雨；遵守 `prefers-reduced-motion` |
| 需求輸入 | 語音經 Gemini 轉成 `{transcript, need}`；文字與人工修正使用 `/api/parse` |
| 搜尋 | PostgreSQL 候選、確定性硬限制、食品份量規則、AI 排序與 SSE 輸出 |
| 未輸入需求時瀏覽 | 可直接瀏覽全部五類資料，不呼叫 AI |
| 結果與詳情 | 顯示價格、條件、資料狀態、來源證據、地區與團體優惠 |
| 帳號 | Username/password、Argon2id、opaque session token、登出與改密碼 |
| 收藏與清單 | 訪客先存此瀏覽器；登入後只聯集合併清單與收藏到 PostgreSQL，不覆蓋帳號設定 |
| 預算與支出 | 月預算、手動支出、標記已買、生存模式、偏好與排除條件 |
| 團體優惠 | 顯示公開名額狀態；登入後可加入或退出，系統儲存必要 membership record |
| 回報 | 登入後提交資料問題與公開備註；回報不會自動變成已驗證資料 |
| PWA | AILI `any`／`maskable` icons、manifest、service worker 與公開 app shell 快取；API 和帳號內容不快取 |

## 架構與產品流程

- [互動式 main 系統架構](docs/architecture/all-in-life-main-architecture.html)
- [互動式探索與登入同步流程](docs/architecture/all-in-life-product-flow.html)
- [本次 branch → main 精選整合比較](docs/branch-main-comparison.md)
- [API、資料與隱私整合紀錄](docs/INTEGRATION.md)

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

2026-09-06 精選整合後本機復核結果：

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

目前離線測試結果（Bun 1.4.0）：

```text
279 pass
30 skip
3 infrastructure-only fail
312 tests / 38 files
```

結果 UI 的食品份量、pending 原因、條件摘要及 demo 安全警告已修復。剩餘 3 項都是同一個導覽測試在目前 Codex 執行環境內使用 `Bun.spawnSync(process.execPath)` 時得到 `ENOENT`；Bun 1.3.13 與專案指定的 1.4.0 都重現，沒有進入畫面斷言。遠端 CI 仍須確認這 3 項在標準 runner 的結果，因此此處不宣稱全綠。

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
- [Third-party notices](THIRD_PARTY_NOTICES.md)

規格檔案目前仍包含部分歷史狀態，後續會另行校正；本 README 以目前 `main` 的實際程式碼與驗證結果為準。

## BUILDMODE 2026 作品繳交檢查表

以下只勾選能由目前儲存庫或實際檢查證明的項目；報名系統、影片與送出結果仍由隊伍最後確認。

### 隊伍資料

- [ ] 隊伍編號、隊名、成員與主要聯絡人正確
- [ ] 已選擇一條主賽道
- [ ] 僅勾選實際符合條件的 Sponsor Challenge／Bounty
- [x] 專案名稱與 100–200 字摘要已校對

### 程式碼與文件

- [x] GitHub／GitLab 儲存庫為公開可讀（送出前仍請用無痕視窗複查）
- [x] 儲存庫包含可辨識的實作內容
- [x] README 包含問題、功能、架構、技術、執行方式與限制
- [x] 已加入明確的 LICENSE 檔案
- [x] 第三方套件、模型、資料與素材的來源及授權已揭露
- [x] 已掃描且未發現真實 API Key、Token、密碼或個人資料

### 作品展示與影片

- [ ] 若有提供作品展示網址，已用無痕視窗確認可直接開啟
- [x] README 已提供完整安裝與執行方式
- [ ] 評選影片不超過 2:00
- [ ] YouTube 影片設為「知道連結即可觀看」
- [ ] 影片聲音、字幕與畫面可正常播放
- [ ] 已準備本機備援影片或截圖

### 送出前

- [ ] 所有表單連結均已再次開啟測試
- [ ] 已保留送出成功畫面或確認信
- [ ] 已在截止前預留處理連結與權限問題的時間
