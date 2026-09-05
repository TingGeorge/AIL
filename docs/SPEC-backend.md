# ALL in life — Backend 規格（Backend Spec）

- 文件狀態：Hackathon MVP build spec
- 版本：v0.1
- 日期：2026-09-05
- 上游文件：[PRD-all-in-life.md](./PRD-all-in-life.md)、[SPEC-voice-input.md](./SPEC-voice-input.md)
- 下游文件：[SPEC-ingestion.md](./SPEC-ingestion.md)（候選紀錄的蒐集、欄位契約與匯入）、[SPEC-geocoding.md](./SPEC-geocoding.md)（地址與座標的取得規則）
- 詞彙：以 [CONTEXT.md](../CONTEXT.md) 為準
- 決策紀錄：[ADR 0001](./adr/0001-offline-ingestion-and-per-category-ranking.md)、[ADR 0002](./adr/0002-one-source-one-record.md)
- 決策過程：2026-09-05 五輪設計討論（grill-with-docs）

## 1. 摘要

目前後端只有 `POST /api/transcribe` 與 `POST /api/parse` 兩條無狀態路由；搜尋、Agent、帳號、資料庫、回報與揪團都只有規格。本文件定義接下來要建的後端：本機 PostgreSQL、一張候選紀錄表、兩階段搜尋（先 deterministic 篩選、再 LLM 推薦排序）、username／password 帳號，以及這些決定連帶要修改的 PRD／SPEC／CONTEXT 條文。

有兩個決定偏離原 PRD，本文件明確記錄：

1. **資料事先匯入，執行期不上網搜尋。** 候選紀錄由爬蟲或 API 腳本事先寫進資料庫；Agent 的工作是從已篩選的清單做推薦排序。
2. **揪團只顯示商家兌換碼，沒有共享狀態。** 不追蹤成員、不做加入代碼。

## 2. 已驗證的事實

- Bun 1.4.0 內建 `Bun.sql`（原生 PostgreSQL client）、`Bun.password`（Argon2id）、`Bun.CryptoHasher`（SHA-256）。Hono 4.13.5 有 `streamSSE`。**不需要新增任何套件。**
- 這台 Mac 尚未安裝 PostgreSQL；見 §11 安裝步驟。
- 現有程式全部在 `old_version/`；新版本放在 `prototype-v1/`。
- 證據閘門、硬限制、成本計算與排序的純函式已存在於 `old_version/src/client/records.ts`（`comparableTotal`、`passesGate`、`passesHard`、`bucket`、`saving`、`groupTotal`），搬到 `src/shared/` 後前後端共用。
- 資料量：五類各 7–10 筆，總計約 35–50 列。這個量級允許整表讀出後在 TypeScript 篩選。

## 3. 定案決策

| 面向 | 決定 |
|---|---|
| 執行環境 | 一個 Bun + Hono process 跑在開發者本機；PostgreSQL 在同一台機器，透過 `Bun.sql` 連線，`DATABASE_URL=postgres://localhost/ail`。 |
| Schema 管理 | 一個 `schema.sql`，伺服器啟動時執行，全部 `CREATE TABLE IF NOT EXISTS`；不用 migration 工具。 |
| 資料匯入 | 欄位契約、可空規則與匯入腳本見 [SPEC-ingestion.md](./SPEC-ingestion.md)；本文件從「資料已在表裡」開始。 |
| 搜尋流程 | 第一階段（不是 Agent）：deterministic 篩選 = 證據閘門 + 硬限制，整個請求跑一次。第二階段：LLM 推薦排序。 |
| Agent | 產品、畫面與 PRD 維持兩個 Agent（付費選項 Agent、免費資源 Agent）。每個 Agent 內部**按類別各打一次 LLM、並行執行**（付費最多 4 條、免費最多 2 條）。某一類失敗只有該類退回成本排序。 |
| LLM 排序規則 | LLM 對它負責的 (agent, category) 群組排序**整份**篩選後清單；不刪任何一筆；每筆附一句繁中 `reason`。系統提示明講：總可比成本第一、軟偏好第二；排在更便宜項目前面時，理由必須說明原因。 |
| 同類別免費／付費並存 | 類別分頁顯示一張清單：付費與免費兩份排序依名次交錯（付費第 1、免費第 1、付費第 2…）；免費項目掛「免費」標籤；生存模式把免費整段釘在最前（沿用現有前端邏輯）。PRD FR-08 改為「以標籤區分，不合成單一分數」。 |
| 距離 | `candidates.lat／lng`；使用者座標由瀏覽器原生 `navigator.geolocation` 在搜尋當下取得、放在請求 body、不保存、不寫 log。伺服器以 haversine 算直線公里數，標示「估算」；`max_minutes` 以 km ÷ 0.08（步行每分鐘 80 公尺）換算，標示「估算」。沒有座標 → 距離為 null → 不做距離篩選。`address` 與 `lat／lng` 的取得與寫入見 [SPEC-geocoding.md](./SPEC-geocoding.md)。 |
| 候選紀錄持久化 | 五類共用一張 `candidates` 表；保留 `agent` 欄位（`paid`／`free`）；證據放 `jsonb` 陣列（逐欄摘錄）；類別特有零碎欄位放 `extra jsonb`。 |
| 帳號 | 照 PRD／SPEC：username `^[a-z0-9_-]{3,30}$`（不分大小寫唯一，小寫儲存）、password ≥ 12 字元、`Bun.password` Argon2id、32 bytes 隨機 opaque token、只存 SHA-256 hash、固定 30 分鐘到期、`Authorization: Bearer`、token 放 `sessionStorage`。不用 Cookie。忘記密碼只顯示 `SUPPORT_EMAIL`。 |
| 帳號資料 | 每個帳號一列：`account_data(user_id, list, favs, settings, profile, updated_at)` 全部 `jsonb`；`GET／PUT /api/me/data` 整包讀寫。每個帳號一份清單。 |
| 已花費 | 沿用現有行為（`old_version/src/client/App.tsx:262`）：清單頁按「標記已買」→ 該筆移出清單、`settings.spent += 總可比成本`。加入清單不累加（加入清單不等於花錢）。跨月歸零：`settings.spent_month` 存 `"2026-09"`，前端載入帳號資料時若不等於當月就把 `spent` 歸零並更新月份。`ponytail:` 純前端、不做記帳歷史；升級路徑是加一張 `monthly_spend` 表。 |
| 匿名使用者 | 可以搜尋、可以改設定（只存在該分頁 `sessionStorage`）。**★ 與加入清單需要登入**（點擊時提示登入）。不做匿名→帳號合併；登入後帳號資料取代 session-local 資料。這推翻 PRD FR-12／FR-15 與 SPEC Case A8。 |
| 回報 | 共享資料，需登入。`reports(id, candidate_id, user_id, reason, note, created_at)`。七種原因（4 種資料回報 + 3 種體驗回報）。回報不自動改 `data_status`。體驗回報顯示時標示「使用者回報，非系統判斷」。 |
| 揪團 | 純顯示。`group_offer jsonb` 增加 `redeem_code`。揪團頁顯示商家兌換碼、人數條件、成本試算（單獨／成團後／每人）、分享按鈕。移除成員列表與加入代碼。不建表。 |
| 搜尋 API | `POST /api/search`，回 Server-Sent Events。 |

## 4. 架構圖

```
瀏覽器 ──POST /api/search {need, exclude, location}──► Hono
                                                        │ SELECT * FROM candidates
                                                        ▼
                                  第一階段：共用純函式篩選（證據閘門 + 硬限制）
                                   → main（通過）、pending（待確認）、excluded_by 各限制的排除數
                                                        │ 依 (agent, category) 分組
                      ┌──────────────┬─────────────────┼──────────────┬──────────────┐
                 paid·食品       paid·日用品       paid·活動      paid·交通    free·免費／公益  free·活動
                      └──────────────┴──── 各自 LLM 排序，30 秒逾時，Promise.allSettled ────┘
                                                        │ 每組完成就推一個 SSE 事件
                                                        ▼
                                  瀏覽器依類別合併（名次交錯；生存模式免費在前）
```

## 5. 目錄配置（`prototype-v1/`）

先把 `old_version/{package.json,tsconfig.json,vite.config.ts,public,tests,src}` 複製過來，再新增：

```
prototype-v1/
  .env.example                 新增 DATABASE_URL、AUTH_SESSION_TTL_SECONDS=1800、SUPPORT_EMAIL
  src/shared/need.ts           不動
  src/shared/records.ts        從 client 搬來；Rec 依 §5.1 對齊資料庫欄位並加上 rowToRec；純函式不動
  src/server/index.ts          現有路由 + 掛載 auth／search／data（**必須加在 serveStatic 的 `app.get("/*")` catch-all 之前**）
  src/server/db.ts             `import { sql } from "bun"`；**連線與 schema 套用都必須 lazy**，見 §5.2
  src/server/schema.sql
  src/server/llm.ts            從 parse.ts 抽出的 createOpenAICompatible 工廠
  src/server/auth.ts           register／login／logout／change-password／me + requireUser middleware
  src/server/search.ts         第一階段篩選、第二階段分組並行、SSE
  src/server/data.ts           /api/me/data、/api/candidates/:id、reports
  data/<category>.json         人工蒐集的候選紀錄；欄位契約見 SPEC-ingestion.md
  scripts/import.ts            讀 data/*.json，以 id upsert 進 candidates（冪等）
  scripts/geocode.ts           匯入後補 address／lat／lng；規格見 SPEC-geocoding.md（本文件不實作）
  scripts/check-data.ts        匯入驗收檢查；不過就不算匯入完成（SPEC-ingestion §9）
  tests/search.test.ts         純篩選 + LLM 輸出驗證（不需資料庫）
  tests/auth.test.ts           需要 DATABASE_URL，沒有就跳過（同現有 parse test 的做法）
```

### 5.2 兩個會讓現有測試爆掉的陷阱

**一、路由順序。** `src/server/index.ts:60` 是 `app.use("/*", serveStatic({ root: "./dist" }))`，`:61` 是 `app.get("/*", serveStatic({ path: "./dist/index.html" }))` — 這是 catch-all。新的 `auth`／`search`／`data` 路由**必須掛在這兩行之前**，否則 `POST /api/search` 會被 static handler 接走，回 200 + `index.html`，看起來像「API 沒反應」但沒有任何錯誤訊息。

**二、`db.ts` 不能在 import 時連線。** 現有的 `tests/routes.test.ts` 直接 `import { app }`，而且不需要資料庫。如果 `index.ts` 掛載 `search.ts` → `search.ts` import `db.ts` → `db.ts` 在模組最上層連線或跑 `schema.sql`，那麼**沒有 PostgreSQL 的環境下整組測試都會爆**，包括原本會過的 parse／transcribe 測試。

做法：`db.ts` 只 `export const sql`（`Bun.sql` 本身是 lazy，第一次查詢才連線），`schema.sql` 的套用寫成 `export async function applySchema()`，**只在 `index.ts` 的啟動路徑呼叫，不在模組載入時呼叫**。需要資料庫的測試沿用現有做法：沒有 `DATABASE_URL` 就 `test.skip`。

### 5.1 資料庫列 → `Rec` 的轉換

`candidates` 的一列和前端 `Rec`（現在的 `old_version/src/client/records.ts`）欄位對不起來。搬到 `src/shared/records.ts` 時一次改掉，並寫**一個** `rowToRec(row): Rec` 函式；`/api/search` 與 `/api/candidates/:id` 都只能走這個函式，不各自轉一次。

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

現有、不動：`POST /api/transcribe`、`POST /api/parse`。

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

錯誤 body 沿用現有 `{error, message}` 固定文案；供應商錯誤只寫 log，不回傳。

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
5. `rankGroup`：`generateText` + `Output.object({ order: [{id, reason}] })`，使用從 `parse.ts` 抽出的 `createOpenAICompatible` 工廠。每筆送給 LLM 的欄位：id、title、provider、總可比成本、price_unit、quantity_or_servings、distance_km、availability、eligibility、tags。不送 URL、證據原文、baseline。系統提示：總可比成本第一、軟偏好第二、不刪任何一筆、理由一句繁中、排在更便宜項目前面時理由必須說明。
6. 驗證輸出：不在輸入清單的 id 丟掉；漏掉的 id 依成本順序補到最後、`reason: null`；逾時或格式不合 → 整組依成本排序，`status:"failed"` 加固定文案。
7. 每組完成就推事件；最後推 `{step:"done", pending}`。

前端在類別分頁合併：付費與免費兩份依名次交錯；`settings.survival` 為 true 時免費整段在前。

`settings.costco_ok` 是「我有 Costco 會員」的開關（預設 false），不是顯示偏好：為 false 時 `passesHard` 排除 `eligibility` 含 `Costco 會員` 的候選（計入 `excluded_by.costco`），前端同時隱藏 `baseline.basis === "costco"` 的節省。沒有會員就買不到，用買不到的價格算節省是假的。欄位規則見 [SPEC-ingestion.md §8](./SPEC-ingestion.md)。

`need.budget` 為 null（使用者沒設預算）時不做預算篩選；排序仍以總可比成本為第一考量，單位成本（CP 值）為第二考量，LLM 系統提示不變。

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

```sh
brew install postgresql@17 && brew services start postgresql@17
createdb ail
cd prototype-v1 && cp .env.example .env   # 填 STT_*、LLM_*、DATABASE_URL=postgres://localhost/ail
bun install && bun run dev
```

## 12. 文件連動修改（已於 2026-09-05 完成）

以下修改已套用；ADR 見 [adr/0001](./adr/0001-offline-ingestion-and-per-category-ranking.md)。

- `CONTEXT.md`：Agent 改為「負責一種推薦排序任務的 LLM 執行單元；不上網搜尋」；新增：第一階段篩選、推薦排序、推薦理由、資料回報／體驗回報、團體優惠（含兌換碼，由商家到店驗證，平台不追蹤成員）、生存模式、每月預算／已花費、排除項目、估算距離。
- `docs/PRD-all-in-life.md`：§3.2 與 NFR-05 的位置條文改為「經同意後僅於該次搜尋使用目前位置，不保存」；§7.1／§7.2 Agent 對事先匯入的資料庫做推薦排序、每個 Agent 內部按類別並行；§9.1 增加 lat／lng、證據陣列、redeem_code；§9.7 以 `account_data` 取代清單／收藏各表；FR-08 免費／付費改為標籤區分；FR-12／FR-15 匿名不可 ★／清單、不做合併；揪團改為純顯示。
- `docs/SPEC-voice-input.md`：§1.1／§2.4／§4 移除合併（Case A8）；`/api/auth/me` 回傳 data；§8 環境變數已列。
- `.env.example`：新增 `DATABASE_URL`、`AUTH_SESSION_TTL_SECONDS=1800`、`SUPPORT_EMAIL`。
- ADR `docs/adr/0001-offline-ingestion-and-per-category-ranking.md`：難以回頭、與 PRD「即時網路搜尋」相反、有真實取捨（誠實與成本 vs 廣度）。

## 13. 建置順序與驗證

### 13.1 建置順序

每一步都有一個「跑得起來就算過」的檢查；沒過就不要往下一步。

| 步驟 | 做什麼 | verify |
|---|---|---|
| 1 | 複製 `old_version` → `prototype-v1`，改 `package.json` 名稱 | `bun run dev` 打得開、`bun test` 全過（現有 parse／routes 測試） |
| 2 | `db.ts` + `schema.sql`（含 `valid_until`） | 啟動後 `psql ail -c "\dt"` 看到五張表 |
| 3 | `shared/records.ts`：搬過來 + §5.1 的 `Rec` 改造 + `rowToRec` + haversine | `tests/search.test.ts` 的純函式測試通過（不需資料庫、不需 LLM） |
| 4 | `search.ts` 第一階段：篩選 + SSE，**先不接 LLM**，直接依成本排序 | `curl -N` 看得到 filter 事件與各類 done 事件；**再從瀏覽器（經 vite proxy）確認事件是逐一到達、不是最後一次全到** — `curl` 直打 3000 測不到 proxy 這一層 |
| 5 | `search.ts` 第二階段（LLM 排序）→ `auth.ts` → `data.ts` | 拿掉 `LLM_BASE_URL` 仍出得來結果（fallback 有效） |

第 3 步是地基，而且它的測試不需要資料庫也不需要 LLM，壞了最容易查。第 4 步刻意先不接 LLM：結果不對時，你確定是篩選邏輯的問題，不是模型的問題。`auth` 排在最後是因為搜尋不需要登入 — 帳號壞掉頂多不能存清單，Demo 主線還是走得完。

資料蒐集與程式可以並行，但**先只做食品 3 筆**，跑完 `import → geocode → check-data → /api/search →瀏覽器` 確認欄位契約沒問題，再回頭補滿 35–50 筆（見 [SPEC-ingestion.md](./SPEC-ingestion.md) §3）。用 3 筆發現契約要改，改一次；用 50 筆發現，改 50 次。

### 13.2 驗證

1. 在 `prototype-v1/` 跑 `bun run typecheck` 與 `bun test`。`tests/search.test.ts` 涵蓋：閘門與硬限制（含距離、登記）、`excluded_by` 計數（含 `costco`）、`valid_until` 過期的紀錄退到 pending、`rowToRec` 的欄位對應（§5.1）、LLM 輸出驗證（未知 id 丟棄、漏掉的 id 補回、輸出不少於輸入）。`tests/auth.test.ts`（需資料庫）涵蓋 SPEC Case A1–A7：註冊、重複 409、登入、過期 401、登出、修改密碼撤銷 sessions、固定 401 文案。
2. 開發資料：`scripts/seed-dev.ts` 把現有標示為虛構的 `MOCK_RECORDS` 只塞進另一個 `ail_dev` 資料庫；Demo 資料庫永遠不放。
3. 手動：`curl -N -X POST localhost:3000/api/search -d '{"need":{...情境 A...},"exclude":["牛"],"location":null}'` 看到 filter 事件、各類事件、done。帶 `location` 再跑一次看 `distance_km` 與距離排除。拿掉 `LLM_BASE_URL` 看各類 `failed` fallback。
4. 瀏覽器：情境 A、B 走完；匿名按 ★ 會提示登入；登入後清單還原；揪團頁顯示兌換碼且沒有成員 UI。

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
