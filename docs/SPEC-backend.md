# ALL in life — Backend 規格（Backend Spec）

- 文件狀態：Hackathon MVP build spec
- 版本：v0.2（Gemini 原生語音／文字／排序契約）
- 日期：2026-09-05
- 上游文件：[PRD-all-in-life.md](./PRD-all-in-life.md)、[SPEC-voice-input.md](./SPEC-voice-input.md)
- 下游文件：[SPEC-ingestion.md](./SPEC-ingestion.md)（候選紀錄的蒐集、欄位契約與匯入）、[SPEC-geocoding.md](./SPEC-geocoding.md)（地址與座標的取得規則）
- 詞彙：以 [CONTEXT.md](../CONTEXT.md) 為準
- 決策紀錄：[ADR 0001](./adr/0001-offline-ingestion-and-per-category-ranking.md)、[ADR 0002](./adr/0002-one-source-one-record.md)
- 決策過程：2026-09-05 五輪設計討論（grill-with-docs）

## 1. 摘要

目前可執行後端在 `prototype-v1`：Bun／Hono／PostgreSQL、兩階段搜尋（deterministic 篩選，再 Gemini 分組推薦排序）、SSE、候選／catalog、帳號與回報。2026-09-05 音訊入口改為 `POST /api/voice` → **Gemini 一次回傳 `{transcript,need}`** → 前端人工確認後才搜尋。文字與 correction 保留 `POST /api/parse` → Need，後端共用 Gemini native Interactions adapter，不串接 STT。官方契約及未驗證事項見 [Gemini 查核紀錄](research/gemini-audio-structured.md)。

有兩個決定偏離原 PRD，本文件明確記錄：

1. **資料事先匯入，執行期不上網搜尋。** 候選紀錄由爬蟲或 API 腳本事先寫進資料庫；Agent 的工作是從已篩選的清單做推薦排序。
2. **揪團只顯示商家兌換碼，沒有共享狀態。** 不追蹤成員、不做加入代碼。

## 2. 實作基線與驗證邊界

- 活躍 package 是 `prototype-v1/`，不是 `old_version/`；不需重新複製舊快照。Bun 提供 SQL／密碼雜湊，Hono 提供 HTTP／SSE，Zod 定義資料邊界。
- `gemini.ts` 直接使用 native `fetch`，共用於音訊、文字與 ranking；無 AI SDK adapter。`voice-upload.ts` 用 busboy 保留 multipart part 的 MIME，不依 filename 推斷。
- `src/shared/records.ts` 是前後端共用的成本、證據與硬限制純函式邊界；資料仍事先匯入，不在搜尋時爬網頁。
- 公開資料涵蓋、數量與來源限制以 `/api/catalog` 及 [整合紀錄](INTEGRATION.md) 為準；不能用原設計估算筆數冒充即時庫存。
- 官方契約與離線 schema 匯出已查核；最新回歸與有限樣本 live Gemini 驗證見 §13。真機麥克風、其他 codec 與廣泛語意品質仍待驗收。

## 3. 定案決策

| 面向 | 決定 |
|---|---|
| 執行環境 | 一個 Bun + Hono process 跑在開發者本機；PostgreSQL 在同一台機器，透過 `Bun.sql` 連線，`DATABASE_URL=postgres://localhost/ail`。 |
| Schema 管理 | 一個 `schema.sql`，伺服器啟動時執行，全部 `CREATE TABLE IF NOT EXISTS`；不用 migration 工具。 |
| 資料匯入 | 欄位契約、可空規則與匯入腳本見 [SPEC-ingestion.md](./SPEC-ingestion.md)；本文件從「資料已在表裡」開始。 |
| 搜尋流程 | 第一階段（不是 Agent）：deterministic 篩選 = 證據閘門 + 硬限制，整個請求跑一次。第二階段：LLM 推薦排序。 |
| Agent | 產品、畫面與 PRD 維持兩個 Agent（付費選項 Agent、免費資源 Agent）。每個 Agent 內部**按類別各打一次 LLM、並行執行**（付費最多 4 條、免費最多 2 條）。某一類失敗只有該類退回成本排序。 |
| Gemini 排序規則 | LLM 對它負責的 (agent, category) 群組排序**整份**篩選後清單；不刪任何一筆；每筆附一句繁中 `reason`。系統提示明講：總可比成本第一、軟偏好第二；排在更便宜項目前面時，理由必須說明原因。 |
| 同類別免費／付費並存 | 類別分頁顯示一張清單：付費與免費兩份排序依名次交錯（付費第 1、免費第 1、付費第 2…）；免費項目掛「免費」標籤；生存模式把免費整段釘在最前（沿用現有前端邏輯）。PRD FR-08 改為「以標籤區分，不合成單一分數」。 |
| 距離 | `candidates.lat／lng`；使用者座標由瀏覽器原生 `navigator.geolocation` 在搜尋當下取得、放在請求 body、不保存、不寫 log。伺服器以 haversine 算直線公里數，標示「估算」；`max_minutes` 以 km ÷ 0.08（步行每分鐘 80 公尺）換算，標示「估算」。沒有座標 → 距離為 null → 不做距離篩選。`address` 與 `lat／lng` 的取得與寫入見 [SPEC-geocoding.md](./SPEC-geocoding.md)。 |
| 候選紀錄持久化 | 五類共用一張 `candidates` 表；保留 `agent` 欄位（`paid`／`free`）；證據放 `jsonb` 陣列（逐欄摘錄）；類別特有零碎欄位放 `extra jsonb`。 |
| 帳號 | 照 PRD／SPEC：username `^[a-z0-9_-]{3,30}$`（不分大小寫唯一，小寫儲存）、password ≥ 12 字元、`Bun.password` Argon2id、32 bytes 隨機 opaque token、只存 SHA-256 hash、固定 30 分鐘到期、`Authorization: Bearer`、token 放 `sessionStorage`。不用 Cookie。忘記密碼只顯示 `SUPPORT_EMAIL`。 |
| 帳號資料 | 每個帳號一列：`account_data(user_id, list, favs, settings, profile, updated_at)` 全部 `jsonb`；`GET／PUT /api/me/data` 整包讀寫。每個帳號一份清單。 |
| 已花費 | 沿用整合版的生活設定／清單行為：清單頁按「標記已買」→ 該筆移出清單、`settings.spent += 總可比成本`。加入清單不累加（加入清單不等於花錢）。跨月歸零：`settings.spent_month` 存 `"2026-09"`，前端載入帳號資料時若不等於當月就把 `spent` 歸零並更新月份。`ponytail:` 純前端、不做記帳歷史；升級路徑是加一張 `monthly_spend` 表。 |
| 匿名使用者 | 可以搜尋、可以改設定（只存在該分頁 `sessionStorage`）。**★ 與加入清單需要登入**（點擊時提示登入）。不做匿名→帳號合併；登入後帳號資料取代 session-local 資料。這推翻 PRD FR-12／FR-15 與 SPEC Case A8。 |
| 回報 | 共享資料，需登入。`reports(id, candidate_id, user_id, reason, note, created_at)`。七種原因（4 種資料回報 + 3 種體驗回報）。回報不自動改 `data_status`。體驗回報顯示時標示「使用者回報，非系統判斷」。 |
| 揪團 | 純顯示。`group_offer jsonb` 增加 `redeem_code`。揪團頁顯示商家兌換碼、人數條件、成本試算（單獨／成團後／每人）、分享按鈕。移除成員列表與加入代碼。不建表。 |
| 搜尋 API | `POST /api/search`，回 Server-Sent Events。 |

## 4. 架構

```text
MediaRecorder（前端最多 30 秒）
  → POST /api/voice：恰好一份 audio File
  → 記憶體 multipart parser → 5 MiB／MIME／基本檔頭檢查
  → Gemini Interactions：audio + today → {transcript,need}（一次請求）
  → 前端逐字稿與 Need 人工確認 ───────────────────────┐
                                                    │
文字／主動編輯逐字稿／文字 correction                 │
  → POST /api/parse：{transcript,current}             │
  → Gemini Interactions → Need → 人工確認 ───────────┤
                                                    │
無 key：手動條件 ───────────────→ 人工確認 ───────────┤
                                                    ▼
                       使用者點搜尋 → POST /api/search
                                    │
                      PostgreSQL 已匯入的五類 candidates
                                    │
                    deterministic 證據／成本／已知硬限制篩選
                                    │
             按 (paid/free, category) 非空群組並行 Gemini 排序
                        30 秒 timeout，失敗群組成本 fallback
                                    │
                     SSE：每組完成即回傳，最後 done
```

語音完成不自動呼叫文字解析或搜尋；文字 correction 只由使用者主動送出。所有模型呼叫使用 server key／fixed Google origin，`store:false`、`background:false`、`stream:false`；搜尋結果 SSE 是本服務的串流，並非 Gemini audio streaming。

## 5. 目錄配置（`prototype-v1/`）

以下是活躍模組的責任，不是重新建立專案的指令：

```text
prototype-v1/
  src/shared/need.ts           Need／needSchema，文字解析、語音內層與搜尋共用
  src/shared/voice.ts          VoiceResult／voiceResultSchema = {transcript,need}
  src/shared/records.ts        候選、成本與篩選共用純函式
  src/server/index.ts          config／voice／parse；掛 search／data／auth／account
  src/server/gemini.ts         fixed native Interactions fetch、JSON Schema、Zod 驗證
  src/server/voice.ts          MIME alias／基本 magic header、audio → VoiceResult
  src/server/voice-upload.ts   busboy 讀 part MIME，6 MiB multipart／5 MiB 檔案，不落地
  src/server/parse.ts          共用 NEED_SYSTEM；text／current → Need
  src/server/rank.ts           每組 Gemini 排序、結果核對及 deterministic fallback
  src/server/db.ts             lazy SQL；僅直接啟動時 applySchema
  src/server/schema.sql        實際資料庫 schema 的唯一執行來源
  src/server/auth.ts           帳號、session、requireUser
  src/server/account.ts        帳號資料讀寫
  src/server/search.ts         篩選、分組並行、SSE
  src/server/data.ts           候選、catalog、reports
  data/live/*.json             預設真實來源快照；fixture 預設不公開
  scripts/import.ts           驗證資料並原子 upsert
  tests/                      純函式／mocked API 與需隔離 DB 的測試分開
```

### 5.2 兩個會讓現有測試爆掉的陷阱

**一、路由順序。** API routes 必須掛在 `serveStatic` catch-all 之前；未知 `/api/*` 回 JSON 404，不得變成成功的 HTML。不要依賴會隨遷移變動的行號。

**二、`db.ts` 不能在 import 時連線。** 現有的 `tests/routes.test.ts` 直接 `import { app }`，而且不需要資料庫。如果 `index.ts` 掛載 `search.ts` → `search.ts` import `db.ts` → `db.ts` 在模組最上層連線或跑 `schema.sql`，那麼**沒有 PostgreSQL 的環境下整組測試都會爆**，包括原本會過的 parse／voice 測試。

做法：`db.ts` 只 `export const sql`（`Bun.sql` 本身是 lazy，第一次查詢才連線），`schema.sql` 的套用寫成 `export async function applySchema()`，**只在 `index.ts` 的啟動路徑呼叫，不在模組載入時呼叫**。需要資料庫的測試沿用現有做法：沒有 `DATABASE_URL` 就 `test.skip`。

### 5.1 資料庫列 → `Rec` 的轉換

`candidates` 的資料庫列統一透過 `rowToRec(row): Rec` 轉成共享候選契約；`/api/search` 與 `/api/candidates/:id` 共用轉換，不各自實作。下表保留原整合決策，實際完整欄位以 `src/shared/records.ts` 為準。

`Rec` 的修改：

| 現在 | 改成 | 原因 |
|---|---|---|
| `evidence_quote: string` | `evidence: {field, quote, url, checked_at}[]` | FR-10 要求每個排序欄位都有摘錄；同一 `field` 兩筆代表該來源自己前後矛盾（SPEC-ingestion §6.1） |
| （沒有） | `address: string \| null`、`action_url: string \| null`、`extra: Record<string, unknown>` | 詳情頁要顯示地址、開地圖連結（`extra.address_source`、`extra.place_id`） |
| （沒有） | `lat`、`lng`、`valid_until: string \| null`、`distance_km: number \| null`、`reason: string \| null` | 距離估算、過期標示、LLM 推薦理由 |
| `GroupOffer` | 增加 `redeem_code: string` | 揪團改為純顯示兌換碼 |
| `Settings` | 增加 `costco_ok: boolean`、`spent_month: string`（`YYYY-MM`） | §8 的會員開關；`spent` 的跨月歸零（§3） |
| `Report{rec_id, at, by}` | `{candidate_id, created_at, by}`（`by` = nickname，null 時退回 username） | 和 `reports` 表對齊，只有 `by` 是伺服器 JOIN 出來的顯示名稱 |
| `Team` | 刪除 | 揪團不建表、不追蹤成員 |

`rowToRec` 只做三件事：欄位直接對應、`tags`／`eligibility` 的 Postgres array 轉 JS array、`timestamptz` 轉 ISO 字串。`distance_km` 與 `reason` 由搜尋流程後填，預設 null。

## 6. 資料庫 schema（`src/server/schema.sql`）

```sql
create table if not exists users (
  id            text primary key default gen_random_uuid()::text,
  username      text not null unique,            -- 小寫儲存
  password_hash text not null,                   -- Bun.password（argon2id）
  nickname      text,                            -- null = 未填；顯示時退回 username
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists auth_sessions (
  id         text primary key default gen_random_uuid()::text,
  user_id    text not null references users(id) on delete cascade,
  token_hash text not null unique,               -- sha256(原始 token)；原始 token 永不儲存
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,               -- created_at + AUTH_SESSION_TTL_SECONDS
  revoked_at timestamptz
);

create table if not exists account_data (
  user_id    text primary key references users(id) on delete cascade,
  list       jsonb not null default '[]',        -- 候選紀錄 id 陣列
  favs       jsonb not null default '[]',
  settings   jsonb not null default '{}',        -- {monthly_budget, spent, spent_month, survival, exclude, prefs, costco_ok}
  profile    jsonb not null default '{}',        -- {color}
  updated_at timestamptz not null default now()
);

create table if not exists candidates (
  id                         text primary key,   -- 短而穩定的 id，例如 f_a3k9
  category                   text not null check (category in ('食品','日用品','免費／公益資源','活動','交通')),
  agent                      text not null check (agent in ('paid','free')),
  title                      text not null,
  provider                   text not null,
  price_total_twd            integer,            -- null = 未知；絕不當 0
  mandatory_fees_twd         integer not null default 0,
  discount_twd               integer not null default 0,
  price_unit                 text,
  quantity_or_servings       text,
  eligibility                text[] not null default '{}',
  registration_required      boolean not null default false,
  availability_or_event_time text,
  valid_until                timestamptz,        -- 來源明示的有效期限；null = 未明示，不會過期
  address                    text,               -- 來源原文地址；null = 無地址或線上服務
  lat                        double precision,
  lng                        double precision,
  distance_or_time_text      text,               -- 來源原文，原樣顯示
  tags                       text[],             -- null = 成分未標示
  source_url                 text not null,
  source_type                text not null check (source_type in ('curated','web-searched')),
  source_authority           text not null check (source_authority in ('official','provider','public','other')),
  evidence                   jsonb not null default '[]',  -- [{field, quote, url, checked_at}]
  collected_at               timestamptz not null,
  verified_at                timestamptz,
  data_status                text not null check (data_status in ('已驗證','部分驗證／待確認','過期／待確認','衝突待確認','無法納入比較')),
  action_url                 text,
  action_label               text,
  baseline                   jsonb,              -- {name, total_twd, basis, as_of}
  group_offer                jsonb,              -- {min_people, discount_pct?, price_per_person?, redeem_code, note}
  extra                      jsonb not null default '{}'
);
create index if not exists candidates_category_status on candidates (category, data_status);

create table if not exists reports (
  id           bigserial primary key,
  candidate_id text not null references candidates(id) on delete cascade,
  user_id      text not null references users(id) on delete cascade,
  reason       text not null check (reason in ('價格過期','條件錯誤','來源失效','分類錯誤','食安','過敏','身體不適')),
  note         text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists reports_candidate on reports (candidate_id, created_at desc);
```

### 6.1 候選紀錄範例

| id | category | agent | title | price_total_twd | address | lat／lng | tags | data_status |
|---|---|---|---|---|---|---|---|---|
| f_a3k9 | 食品 | paid | 雙人便當組合 | 260 | 台北市大安區…（來源原文） | 25.07／121.52 | {豬,雞} | 已驗證 |
| r_77x1 | 免費／公益資源 | free | 社區共餐（週六） | 0 | null | null | {素} | 已驗證 |
| d_2p0q | 日用品 | paid | 洗碗精 1L | null | 台北市信義區…（Google 回填） | 25.07／121.53 | {} | 無法納入比較 |

對「2 人、預算 300、排除牛」的請求，洗碗精因為沒有價格進不了閘門，只會出現在「待確認」清單，不會送給 LLM。

### 6.2 資料匯入者要遵守的規則

- `agent` 由匯入者決定：直接費用為零且來源明說免費 → `free`；有價格 → `paid`。
- `price_total_twd` 不知道就填 null，不填 0。
- `evidence` 每個參與排序的欄位（價格、份量、資格、時間、地點）至少一條摘錄。
- `address` 能從來源取得就必須存原文，並附一條 `evidence` 摘錄、設 `extra.address_source = "source"`。
- `lat／lng` 不由匯入者填，由 `scripts/geocode.ts` 解析後寫入；沒有就留 null，該筆將「顯示但不做距離篩選」。規則見 [SPEC-geocoding.md](./SPEC-geocoding.md)。
- `data_status` 只有「已驗證」會進主要排序；其餘進「待確認」。

## 7. API 契約

### 語音、文字與能力狀態

| 方法／路徑 | Request → Response |
|---|---|
| `GET /api/config` | `{database:boolean,parse:boolean,voice:boolean,ranking:boolean,support_email:string或null,area:"圓山區"}`；設定旗標，不是遠端健康檢查 |
| `POST /api/voice` | multipart：恰好一份 `audio` File → `{transcript:string,need:Need}`；不寫 DB，不需登入 |
| `POST /api/parse` | JSON `{transcript:string,current:Need或null}` → Need；不需登入，保留主動文字解析及 correction |

`voice` 取代舊 config 的 `transcribe`。`/api/transcribe` 不再是有效路由；音訊不會自動接 `/api/parse`。`voice:false` 時 client 不顯示可用錄音入口；沒有 Gemini key 仍可手動填寫條件，DB 配置與 AI 配置獨立。

**語音邊界：** file ≤ 5 MiB、multipart request ≤ 6 MiB、空檔拒絕；busboy 保留 part Content-Type，拒絕非 multipart、額外 fields／duplicate files。`audio/mp4`／`audio/x-m4a` canonicalize 為 `audio/m4a`；其他 alias 與格式清單见 [語音規格 §4](SPEC-voice-input.md#4-api-契約)。核對基本 magic header，不能把 filename 或 MIME 當成已解碼證據；不轉碼、不使用 ffmpeg。前端最多錄 30,000 ms，後端不驗證音檔實際時長。

**文字邊界：** transcript 長度 1–2000，request ≤ 32 KiB；current 預設 null。server 以 Asia/Taipei 提供 `today`；音訊 current 固定 null，文字 current 非 null 表示只更新提到的欄位。每次模型呼叫有 30 秒 timeout 與 request abort。

| HTTP | `/api/voice` error | 意義 |
|---|---|---|
| 400 | `voice_failed` | multipart／欄位／空檔錯誤 |
| 413 | `too_large` | 檔案或總請求超限 |
| 415 | `unsupported_audio` | 不支援 MIME 或基本檔頭不符 |
| 422 | `no_speech` | 沒有可辨識語音 |
| 502 | `voice_failed` | 上游失敗或回應不符 JSON／Zod 契約 |
| 503 | `voice_failed` | Gemini 未設定 |
| 504 | `timeout` | 處理逾時 |

`/api/parse` 400／502／503 對應 `parse_failed`，413 為 `too_large`，504 為 `timeout`。錯誤格式 `{error,message}` 固定，不洩漏 provider body、音訊、key；多個錯誤同時存在時以實際檢查順序為準。所有 API no-store。

### 其他 API（保留搜尋／資料／帳號契約）

| 方法 | 路徑 | 需登入 | Request → Response |
|---|---|---|---|
| POST | `/api/search` | 否 | `{need: Need, exclude: string[], location: {lat, lng} \| null}` → SSE 串流（見 §7.1）。zod 驗證：`need` 用 `shared/need.ts` 既有 schema；`exclude` ≤ 20 項、每項 ≤ 20 字；`location` 需在 lat 21.5–25.5、lng 118–122.5（台灣）內，否則當 `null` |
| GET | `/api/candidates/:id` | 否 | → `Rec`；不存在 404 |
| GET | `/api/candidates?ids=a,b,c` | 否 | → `Rec[]`（找不到的 id 直接略過，不報錯）；ids 上限 200，超過 400。清單／收藏頁重新整理或換裝置登入後靠這條取回紀錄 |
| POST | `/api/auth/register` | 否 | `{username, password, nickname?}` → 201 `{user, session_token, expires_at, data}`；格式錯 400；重複 409 |
| POST | `/api/auth/login` | 否 | `{username, password}` → 200 同上；錯誤 401 `{error:"invalid_credentials"}`；同一 username 15 分鐘內失敗 10 次 → 429 |
| GET | `/api/auth/me` | 是 | → `{user, data}`（data = account_data 那列）；401 時前端清除 token |
| POST | `/api/auth/logout` | 是 | → 204，撤銷目前 session |
| POST | `/api/auth/change-password` | 是 | `{current_password, new_password}` → 204，撤銷該帳號所有 sessions |
| GET | `/api/me/data` | 是 | → `{list, favs, settings, profile, updated_at}` |
| PUT | `/api/me/data` | 是 | 同上形狀（zod 驗證，id 數 ≤ 200）→ 200 |
| GET | `/api/candidates/:id/reports` | 否 | → `[{reason, note, created_at, by: nickname}]` |
| POST | `/api/candidates/:id/reports` | 是 | `{reason, note}` → 201 |

錯誤 body 使用 `{error, message}` 固定文案。Gemini wrapper 遮罩 provider 內容，route 僅記錄 error 類型，不記錄完整上游回應、key 或使用者輸入。

### 7.1 `/api/search` 的 SSE 事件

SSE（Server-Sent Events）是同一個 HTTP 連線保持打開，伺服器有進度就推一行 JSON，全部做完才關。每個事件一行 `data:`：

```
{step:"filter", found: 48, passed: 17, pending: 9, excluded_by: {budget: 12, free_only: 0, distance: 6, exclude: 4, registration: 0, costco: 3}}
{agent:"paid", category:"食品",  status:"ranking"}
{agent:"paid", category:"食品",  status:"done",   records:[Rec & {reason: string|null, distance_km: number|null}]}
{agent:"free", category:"活動",  status:"failed", reason:"推薦排序逾時，已改依成本排列", records:[...依成本排序, reason:null]}
{step:"done", pending:[Rec...]}
```

前端保留兩個 Agent 面板；面板步驟改為「篩選硬限制（共用）→ 推薦排序 n/m 類 → 完成」。`excluded_by` 用來實作 FR-13「說明是哪個限制造成空結果」。

## 8. 搜尋流程細節（`src/server/search.ts`）

1. `SELECT * FROM candidates`（約 100 列以內）。`ponytail:` 整表讀出、TypeScript 篩選；上限約 1 萬列，升級路徑是把條件推進 SQL `WHERE`。
2. 有 `location` 且該列有 `lat／lng` 時算 `distance_km`（haversine，一個函式放在 `shared/records.ts`）。
3. 第一階段用共用純函式：`passesGate`（已驗證、總可比成本可算，且 `valid_until` 為 null 或 `> now()`；已過期的視同「過期／待確認」退到 pending）→ 否則進 pending；`passesHard(need, exclude)` 擴充距離（`max_distance_km`）、時間（`max_minutes` 對 `km ÷ 0.08`）、`registration_ok === false` 時要求 `registration_required` 為 false。統計每個限制的 `excluded_by`。`ponytail:` `people_or_servings`、`date`、`time_window`、`eligibility_notes` 維持文字，只顯示並交給 LLM，不做機器篩選；紀錄沒有對應的結構化欄位。
4. `main` 依 `(agent, category)` 分組；每個非空群組跑 `rankGroup()`，`Promise.allSettled`，各自包在現有 `withTimeout`（30 秒）。
5. `rankGroup`：使用共用 `gemini.ts` 的 `generateStructured`，以 strict Zod schema 取得 `{order:[{id,reason}]}`；native Interactions 的 text input／JSON response_format，沒有 OpenAI adapter。每筆送給 LLM 的欄位：id、title、provider、總可比成本、price_unit、quantity_or_servings、distance_km、availability、eligibility、tags。不送 URL、證據原文、baseline。系統提示：總可比成本第一、軟偏好第二、不刪任何一筆、理由一句繁中、排在更便宜項目前面時理由必須說明。
6. 驗證輸出：不在輸入清單的 id 丟掉；漏掉的 id 依成本順序補到最後、`reason: null`；逾時或格式不合 → 整組依成本排序，`status:"failed"` 加固定文案。
7. 每組完成就推事件；最後推 `{step:"done", pending}`。

前端在類別分頁合併：付費與免費兩份依名次交錯；`settings.survival` 為 true 時免費整段在前。

`settings.costco_ok` 是「我有 Costco 會員」的開關（預設 false），不是顯示偏好：為 false 時 `passesHard` 排除 `eligibility` 含 `Costco 會員` 的候選（計入 `excluded_by.costco`），前端同時隱藏 `baseline.basis === "costco"` 的節省。沒有會員就買不到，用買不到的價格算節省是假的。欄位規則見 [SPEC-ingestion.md §8](./SPEC-ingestion.md)。

`need.budget_total_twd` 為 null（使用者沒設預算）時不做預算篩選；模型排序仍以總可比成本第一、軟偏好第二；不捏造 CP 分數。前端已套用並讓使用者確認的設定預填，以送來的 Need 為準；server 不替使用者補預算。

### 8.1 排序範例

篩剩「水餃 160（步行 8 分）」與「便當組合 260（可外帶）」，使用者偏好可外帶。LLM 回：

```json
{"order":[{"id":"f_bd01","reason":"符合可外帶，兩人份剛好；比水餃貴 100 元但水餃需內用"},
          {"id":"f_a3k9","reason":"最便宜，但需內用"}]}
```

## 9. 帳號細節（`src/server/auth.ts`）

- 每次查詢與寫入前把 username 轉小寫；正規表達式與長度在邊界檢查；password 長度檢查。
- `Bun.password.hash(pw)`／`Bun.password.verify`。username 不存在時仍對一個固定的假 hash 跑 `verify`，避免用時間差判斷帳號是否存在。
- Token：`crypto.getRandomValues(new Uint8Array(32))` 轉 base64url；儲存 `new Bun.CryptoHasher("sha256").update(token).digest("hex")`。
- `requireUser` middleware：讀 Bearer → hash → 一個 JOIN `auth_sessions` 與 `users` 的查詢，條件 `revoked_at is null and expires_at > now()`；把 user 放進 `c.var.user`。
- 登入失敗計數：記憶體內 `Map<username, {n, until}>`。`ponytail:` 重啟歸零、只適用單一 process。
- `change-password`：驗證目前 password、hash 新的、`UPDATE users`、`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`。
- 註冊／登入時若 `account_data` 那列不存在就建立並一併回傳，前端一次呼叫就能還原狀態。

## 10. 前端接點（後端完成後再做，範圍最小）

- `api.ts`：`search()` 用 `fetch` + `ReadableStream` 讀 SSE；auth 呼叫；`me/data` GET／PUT；reports；`candidates?ids=` 批次取回。
- `screens/ListScreen.tsx`：現在的 `items: Rec[]` 來自搜尋當下的記憶體，重新整理就空了。改為進入清單／收藏頁時以 `list`／`favs` 的 id 呼叫 `GET /api/candidates?ids=`。
- `App.tsx`：token 存 `sessionStorage` key `ail.token`；啟動時呼叫 `/api/auth/me`；匿名時 ★／清單按鈕提示登入；登入後以帳號資料取代本機清單／收藏／設定；每次變更 debounce 後 PUT。
- `screens/Search.tsx`：消費事件；維持兩個面板；步驟改為篩選 → 推薦排序 n/m → 完成；各類失敗文案。
- `screens/Team.tsx`：移除成員與加入代碼；顯示 `group_offer.redeem_code`、條件、成本列、分享。
- `screens/Detail.tsx`：顯示 `reason`、「免費」標籤、`address`（`extra.address_source` 為 `geocoded` 時標示為系統比對所得）與不需金鑰的開地圖連結（`google.com/maps/search/?api=1&query=`）、「直線距離估算」文字、來自 API 的回報列表、「使用者回報，非系統判斷」標示。
- 分享：**純前端，沒有後端路由**。已登入使用者按分享 → 跳出可複製的文字，內容為 標題、提供者、總可比成本、資料時間、地址（有的話）、來源連結；不含使用者位置與任何個資（PRD FR-12）。用 `navigator.share`，不支援時退回 `navigator.clipboard.writeText`。
- 新增最小的帳號畫面（註冊／登入／修改密碼／忘記密碼 → `SUPPORT_EMAIL`）。設定增加 `costco_ok`（標示為「我有 Costco 會員」）。
- 搜尋前向瀏覽器要一次定位（`getCurrentPosition`，`timeout: 8000`）；拒絕、逾時或非 https／localhost → `location: null`。見 [SPEC-geocoding.md](./SPEC-geocoding.md) §10。

## 11. 安裝與啟動

需要可用的 PostgreSQL；不要以本文件推定某台機器已安裝或未安裝。完整啟動與真實資料匯入程序見根目錄 README。已有設定檔時保留，只補缺欄位。

```sh
cd prototype-v1
bun install --frozen-lockfile
cp -n .env.example .env
# 在自己的 server env 設 DATABASE_URL、GEMINI_API_KEY、GEMINI_MODEL；勿提交 key。
bun run dev
```

設定欄位範例（空值表示尚未設定）：

```dotenv
DATABASE_URL=postgres://localhost/ail
GEMINI_API_KEY=
GEMINI_MODEL=
SUPPORT_EMAIL=
PORT=3000
```

`GEMINI_MODEL` 使用帳號可用、支援音訊與結構化輸出的 `gemini-*` 模型 ID，建議 bare name，無預設。缺 key 或 model 時 voice／parse／ranking 停用；搜尋可走 deterministic fallback。`gemini.ts` 固定 Google origin，不提供可將 key 導向其他站的 base URL。

Session 固定 1,800 秒，不因請求延長；不是可調的 env 參數。所有模型請求設 `store:false`，但這不是整體零保留、不作訓練或免除安全日誌的承諾；部署者需核對 Google 條款，見研究紀錄。

## 12. 文件沿革與本次更新

以下保留原後端整合的歷史紀錄；ADR 見 [adr/0001](./adr/0001-offline-ingestion-and-per-category-ranking.md)。

- `CONTEXT.md`：Agent 改為「負責一種推薦排序任務的 LLM 執行單元；不上網搜尋」；新增：第一階段篩選、推薦排序、推薦理由、資料回報／體驗回報、團體優惠（含兌換碼，由商家到店驗證，平台不追蹤成員）、生存模式、每月預算／已花費、排除項目、估算距離。
- `docs/PRD-all-in-life.md`：§3.2 與 NFR-05 的位置條文改為「經同意後僅於該次搜尋使用目前位置，不保存」；§7.1／§7.2 Agent 對事先匯入的資料庫做推薦排序、每個 Agent 內部按類別並行；§9.1 增加 lat／lng、證據陣列、redeem_code；§9.7 以 `account_data` 取代清單／收藏各表；FR-08 免費／付費改為標籤區分；FR-12／FR-15 匿名不可 ★／清單、不做合併；揪團改為純顯示。
- `docs/SPEC-voice-input.md`：§1.1／§2.4／§4 移除合併（Case A8）；`/api/auth/me` 回傳 data；§8 環境變數已列。
- 舊規格曾把 session TTL 列為 env；目前固定 1,800 秒。有效 AI 設定以本文件 §11 的 Gemini 欄位為準。
- ADR `docs/adr/0001-offline-ingestion-and-per-category-ranking.md`：難以回頭、與 PRD「即時網路搜尋」相反、有真實取捨（誠實與成本 vs 廣度）。

## 13. 遷移驗證與驗收

### 13.1 無 live key 的回歸檢查

1. 共享 schema、API body、MIME／filename／magic header、5 MiB 檔案及 6 MiB multipart 邊界、重複／額外 fields，以 mocked provider 測試，不需真實 DB。
2. 驗證 Gemini endpoint／header／response_format／store:false；completed → model_output → text → JSON.parse → Zod，拒絕錯誤／不完整／非文字結果。這只能驗證程式契約，不證明 Google 遠端接受。
3. 驗證錄音 deadline 是 `30 * 1000`，停止僅一次上傳；client FormData 保留 MIME，response 同時進逐字稿與 Need review，不自動 parse／search；abort／revision 舊結果不可覆蓋。
4. 關閉 Gemini 設定，確認手動條件可用、config voice／parse／ranking 為 false，搜尋分組明示成本 fallback。
5. 保留純篩選／SSE／ranking sanitization／帳號隔離與撤銷測試。需要 DB 的 fixtures 只用專用測試資料庫；不得把匯入或寫入型測試指向真實資料庫。
6. `bun run typecheck`、`bun run build`；型別／建置成功不等於真機麥克風或 live Gemini 成功。

### 13.2 2026-09-05 驗證紀錄與限制

- **最新全套結果：151 pass / 28 skip / 0 fail，942 assertions**；typecheck 與 build 通過。fixture suite 未觸及真實 DB。
- **UI smoke：** 實際文字解析→確認→39 筆真實 catalog 搜尋→AI 排序通過；日用品顯示 2 筆主候選，修復後無 AI fallback 警告，詳情／來源正常。
- **Live Gemini：** `gemini-3.5-flash-lite` 文字解析 HTTP 200；約 5 秒合成中文 WebM 音訊 HTTP 200，約 2.6 秒取得 transcript／Need。排序 schema 的 `maxItems:500` 在單筆與多組搜尋均造成 HTTP 400；只移除該 provider 約束即成功，後端仍保留 500 筆／欄位長度／strict object 驗證。
- **仍待驗收：** 使用者真機麥克風、OGG／M4A、噪音／口音／廣泛數字否定詞案例、其他模型、配額與網路失敗及正式部署。上述有限樣本的延遲不是效能承諾，mocked tests 或略過數不能代替真機結果。

## 14. 延後與不在範圍

- 實際的來源清單與蒐集工作（規格見 [SPEC-ingestion.md](./SPEC-ingestion.md)，內容由開發者填）。
- 有共享狀態的揪團（teams 表）：Demo 後再議。
- Google Routes API（`computeRouteMatrix`；舊稱 Distance Matrix API，已進入維護模式）：只需換掉 haversine 那個函式；已存的 `place_id` 可直接當 waypoint。見 [SPEC-geocoding.md](./SPEC-geocoding.md) §14。
- 本機以外的部署。

## 15. 未經討論的假設（請審閱）

- 類別分頁的合併規則是兩個 Agent 清單依名次交錯。
- ~~新增 `settings.costco_ok`；未開啟時隱藏 Costco 基準。~~ 已定案：會員開關，未開啟時連同需會員的候選一起排除（§8）。
- `people_or_servings`、`date`、`time_window`、`eligibility_notes` 不做機器篩選（紀錄沒有結構化欄位）。
- `prototype-v1/` 是複製 `old_version/` 原始碼再修改，不是重寫。
- `/api/auth/me` 在同一個回應裡回傳帳號資料。
