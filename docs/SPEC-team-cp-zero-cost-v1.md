# ALL IN LIFE — Team Mode、CP Value Engine、Zero-Cost Mode 技術與產品規格

- 文件狀態：Implementation proposal / 下一輪實作依據
- 版本：v1.0
- 日期：2026-09-04
- 依據：`PRD-all-in-life.md` v0.1、`SPEC-all-in-life-mvp.md` v1.0、`RFC-next-phase-budget-squad-community.md` v0.2、目前 `/mvp` 程式碼
- Pilot area：圓山生活圈
- 原則：先 Audit → Proposal → Data Model → Implementation；本文件不直接授權重寫現有 MVP

## 1. 結論先行

目前產品是一個可操作的單頁前端 Demo，不是已經有後端的多人平台。它已證明遊戲化 UI、月／次預算、兩個 Agent 的平行演出、五類結果、證據 Dialog、語音入口與基本響應式；但所有狀態都在 React 記憶體，搜尋是 `setTimeout` 演出，結果是程式碼內固定資料，尚無資料庫、API、登入、Profile、Team、Crawler、Google 地圖或 PWA。

下一輪不應先做 Marketplace、支付或完整社交網路。建議把 P0 收斂為一條可在評審現場完成的閉環：

1. 使用者可以 Guest 身分直接進入，不被登入卡住；登入後建立 Profile。
2. 在圓山生活圈地圖上找到一個有欄位級證據的餐廳／零元機會。
3. 系統先套用硬限制，再顯示可拆解、可重算的 Base CP Score。
4. 使用者新增一筆有來源與期限的優惠情報。
5. 建立邀請制 Team，其他 Demo persona 加入，畫面由 `3/5` 變為 `5/5`。
6. 評審可打開 Evidence，清楚看見「官方／公開／社群／已驗證社群」的差別。

推薦部署維持既有 **OpenAI Sites + Cloudflare Workers**，把目前 static export 升級為 server-backed Vinext，結構化持久資料用 **Cloudflare D1**；證據照片到 P1 才啟用 R2。既有 Vinext 架構正是 Cloudflare 官方目前建議的 Next.js on Workers 路徑，但 Vinext 仍為 beta，因此發布前要固定版本並跑 compatibility/build smoke test。[Cloudflare Next.js / Vinext](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)

## 2. SPEC 對齊與變更邊界

### 2.1 必須保留的不變條件

- Constraints first：預算、人數／份量、時間、區域、資格與明確排除先於分數。
- Evidence before ranking：關鍵成本、份量、有效期或資格沒有證據，不進主要排序。
- Unknown is not zero：未知價格、運費、交通費、等待時間與營養不得填 0。
- Like-for-like：只在相同份量／人數／服務內容下比較。
- Free is conditional：`direct_cost_twd = 0` 只表示直接費用為零，不代表交通、時間、門票、會員或行動成本為零。
- Safety is separate：食安警示是獨立政策層，不能被低價或高 CP 抵銷。
- Actionable, not autonomous：P0 只導向外部行動；不代付、不代訂、不保證成團履約。
- 圓山限定、無導航：地圖用於「位置理解與範圍篩選」，不做 turn-by-turn directions。
- 未查證營養不推估：熱量、蛋白質只有官方營養標示或可追溯來源時才有值。

### 2.2 本輪對原 MVP 的必要擴充

PRD v0.1 將帳號、Profile、地圖與持久化排除，是為了匿名 Hackathon MVP；本輪需求明確把它們納入下一階段。因此採「不破壞 Guest Demo、登入後解鎖持久化」：

| 能力 | Guest | Signed-in Personal | Team |
|---|---|---|---|
| 瀏覽與 CP 比較 | 可 | 可 | 可共享 |
| 地圖 | 可，固定圓山 | 可，仍不保存精確住址 | 可分享集合點文字 |
| 收藏 | 本裝置／本 session | 跨裝置持久化 | 團隊共同收藏 |
| Profile | Demo persona | 首次登入建立 | 成員只看被允許欄位 |
| 新增情報 | Demo sandbox 或要求登入 | 可追溯到使用者 | 可限定 Team 可見 |
| 建立／加入團 | 不可或只做導覽演出 | 可 | 邀請制 |

## 3. 現況 Audit

### 3.1 十項盤點

| 項目 | 現有狀態 | 判定 | 下一步 |
|---|---|---|---|
| Personal / Profile | 只有 local state：月預算、安全墊、剩餘天數、人數、hard rules、soft prefs、收藏 | 部分重疊；非 Profile、不可持久化 | 建立 User/Profile/Preference/Place interaction |
| Team / Social | RFC 有 Squad 與 Commitment 草案；程式碼無實作 | 缺少 | P0 邀請制 Team + join progress |
| Restaurant schema | `Result` 只有 title/provider/cost/unit/meta/condition/verified/evidence/url | 過度扁平，無法支援欄位證據或 CP 維度 | 拆 Place、Offer/Menu、Observation、Evidence |
| CP / Ranking | 陣列順序即排名；文案稱成本低到高，但沒有實際 filter/sort | 缺少 | deterministic constraints + scorer v1 |
| Crawler / external source | 無；只有硬編碼 URL | 缺少 | 先 curated importer，再做受控 source adapters |
| 優惠／活動模型 | 只有通用 Result；RFC 有 MerchantOffer 草案 | 部分重疊 | Offer 與 ZeroCostOpportunity 分開建模 |
| Jay / Tim 重疊 | Git 只看得到 Jay 的 `a70d43a`：月預算、語音、模式、偏好與版面重設；無 Tim／Andy artifact | 無法做品質比較 | 先定共同契約，再以同一 acceptance rubric 比較 |
| 可共用底層 | Constraint parser、source/evidence、Place、Offer、scoring、map、profile preference、moderation | 可抽共用 | 不讓 Jay／Tim 各自發明 schema |
| 需新增 schema | Identity、Profile、Place、Restaurant、Offer、Opportunity、Evidence、Team、Report、Score | 缺少 | 見第 7 節 |
| 不應現在做 | 支付、Marketplace、中央廚房、陌生人共乘、即時導航、完整社交 feed、黑箱 ML | 應暫緩 | P2 或另立安全／法規 RFC |

### 3.2 已完成的 UI／UX 能力

- 單頁 working surface，第一屏可直接設定任務。
- 月總預算、安全墊、剩餘天數、每日額度與單次任務預算。
- 快速填寫與瀏覽器語音辨識入口；逐字內容可編輯。
- 最低生存／可以過活模式，以及 hard rule／soft preference。
- 兩個 Agent 分別顯示 STANDBY → SCANNING → COMPLETE。
- 五類 Tabs、結果卡、收藏、Evidence Dialog、外部連結。
- 320px 起的基本 mobile-first 結構、觸控按鈕、reduced-motion。
- WebMCP `configure_survival_mission` 只會更新畫面 state。

### 3.3 仍是假象或 Fixture 的能力

- `runSearch()` 只用 850ms／1350ms timer，沒有 Agent 或 API。
- 結果筆數 `26 → 8` 與 `14 → 7` 是固定文字。
- 排名沒有執行 hard constraint、evidence gate 或排序函式。
- 食品與日用品是黃色 Fixture；每類也未達 7–10 筆。
- 收藏重新整理後消失。
- 月預算沒有支出帳本，不會反映真實使用。
- 語音只取 transcript，沒有 confidence、結構化解析或低信心確認。
- `verified: boolean` 無法表達 partial、expired、conflicted、community-verified。
- 目前 `npm run build` 已完成 5 階段編譯與兩個 route 的 static prerender，但在 Windows process teardown 觸發 libuv `UV_HANDLE_CLOSING` assertion，最終 exit code 為 1；部署前必須把它列為 P0 build blocker，確認 CI/Linux build 是否正常或升級／固定相容的 Vinext 版本，不能只看到 `Build complete` 就當成功。

## 4. Jay / Tim 雙軌的治理方式

目前可以容許 UI、影片與產品敘事雙軌，但只允許「上層解法競爭」，不允許「底層契約分裂」。

### 4.1 雙方必須共用

- 本文件的 domain enums、API contract、D1 migrations 與 seed fixture。
- 同一套 constraint evaluator、evidence gate、CP scorer 與 demo scenarios。
- 同一組 Google Map `place_id`／圓山 geofence 定義。
- 同一組 PWA manifest、offline boundary 與部署環境。
- 同一 acceptance rubric：正確性 35%、可解釋性 25%、Demo 穩定 20%、響應式／可及性 15%、視覺完整 5%。

### 4.2 可以競爭

- 首屏資訊密度與個人／團隊模式切換方式。
- 地圖與清單的視覺佈局。
- Team progress、情報提交與 Evidence 的互動。
- 60–90 秒影片敘事、動效與剪輯。

### 4.3 剩四小時時的切換規則

以 `T-4h` 為 freeze point：停止新分支功能，選定一個 UI 主線；另一線只提供已驗證、可 cherry-pick 的小修改。Schema、seed、scorer 與 Demo script 立即凍結，只接受 P0 blocker。指定一位 release owner，其他人分別負責資料查核、Demo 操作與回歸測試。

## 5. 目標架構

```text
Responsive PWA (Vinext / React)
  ├─ Guest read-only/demo session
  ├─ Signed-in Personal Mode
  ├─ Team Mode
  ├─ List / Google Map / Evidence UI
  └─ IndexedDB: app shell + last verified read-only payload only
                    ↓ HTTPS
Cloudflare Worker route handlers / server actions
  ├─ identity + authorization
  ├─ constraint evaluator
  ├─ evidence gate
  ├─ CP scorer (versioned, deterministic)
  ├─ team / report commands
  └─ source adapter orchestration
                    ↓
Cloudflare D1                         R2 (P1)
  ├─ product relational data          └─ user evidence images
  ├─ field-level provenance
  ├─ score snapshots
  └─ demo seed / audit trail
                    ↓
External sources
  ├─ official/provider pages
  ├─ public/open data
  ├─ Google Maps JavaScript + Places
  └─ community reports (never silently promoted to official)
```

D1 適合目前規模的關聯式資料與 Workers 整合；官方說明它是具 SQLite 語意的 serverless database。單一 D1 database 會依序處理 query，因此 P0 要避免每張卡 N+1 查詢，使用 prepared statements、批次查詢與預先計算 score snapshot。[D1 overview](https://developers.cloudflare.com/d1/)、[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

## 6. 資料值設計規則

### 6.1 共通格式

| 類型 | 規則 |
|---|---|
| ID | `TEXT`，UUIDv7；外部 ID 不直接作主鍵 |
| 時間 | UTC ISO-8601 `TEXT`；顯示時轉 `Asia/Taipei` |
| 金額 | 整數 `INTEGER`，單位 TWD；不知道為 `NULL`，不可為 0 |
| 小數量 | 固定精度整數，例如 `rating_x100=432`、`lat_e6=25070000`，避免浮點比較 |
| boolean | `INTEGER CHECK(value IN (0,1))` |
| enum | 大寫 snake-case `TEXT CHECK(...)`；API 對外用小寫字串 |
| JSON | 只存低頻、非主要查詢結構；核心 filter 欄位必須正規化 |
| 軟刪除 | 重要使用者／情報資料使用 `deleted_at`，不直接消失 |
| optimistic locking | 可協作資料加 `version INTEGER NOT NULL DEFAULT 1` |
| 未知值 | `NULL`；`0` 只代表經證據確認的真零值 |

### 6.2 核心 enum

```text
origin_type:
  OFFICIAL | PROVIDER | PUBLIC | COMMUNITY | VERIFIED_COMMUNITY

verification_status:
  UNVERIFIED | CORROBORATED | PROVIDER_CONFIRMED | OFFICIAL_CONFIRMED |
  REJECTED | EXPIRED | CONFLICTED

data_status:
  ELIGIBLE | PARTIAL | STALE | CONFLICTED | EXCLUDED

visibility:
  PRIVATE | TEAM | PUBLIC

team_role:
  OWNER | ADMIN | MEMBER

team_status:
  OPEN | THRESHOLD_MET | CLOSED | CANCELLED | EXPIRED

report_type:
  DATA_ERROR | QUALITY_EXPERIENCE | OFFER_TIP | SAFETY_INCIDENT

score_dimension:
  PRICE | FOOD | QUALITY | CONVENIENCE | DISCOUNT | RELIABILITY
```

### 6.3 Freshness 預設值

以下是 V1 operational default，不是永遠真理；全部放在 `data_policy` 設定並版本化：

| Fact | fresh_for | 到期行為 |
|---|---:|---|
| 限時優惠 | 以 `valid_until` 為準 | 立即 EXPIRED |
| 菜單／價格 | 7 天 | STALE，不進「已驗證最低價」主張 |
| 營業時間 | 30 天 | 顯示待確認；若用於當下營業篩選則排除 |
| Google rating/count | 即時或短暫 cache；依 Google 條款 | 不作永久自有快照 |
| 社群優惠情報 | 14 天或原作者期限 | 降權並要求重新確認 |
| 食安使用者經驗 | 不因過期刪除 | 依事件日期、佐證與官方狀態分層顯示 |
| 活動／零元機會 | `ends_at` | 結束即 EXPIRED |

## 7. D1 Data Schema

### 7.1 P0 身份與 Profile

#### `users`

| 欄位 | 型別／限制 | 值的意義 |
|---|---|---|
| `id` | TEXT PK | 內部 user id |
| `auth_subject` | TEXT UNIQUE NOT NULL | 平台提供的穩定 user subject；不可由 client 傳入 |
| `email` | TEXT NULL | 顯示／通知用途；權限判斷不靠 email |
| `status` | ACTIVE / SUSPENDED / DELETED | 帳號狀態 |
| `created_at`, `updated_at`, `deleted_at` | TEXT | audit lifecycle |

#### `profiles`

| 欄位 | 型別／限制 | 值的設計 |
|---|---|---|
| `user_id` | TEXT PK/FK | 一人一 Profile |
| `display_name` | TEXT 1–60 | 登入預填但可修改 |
| `nickname` | TEXT 1–30 | Team 中主要顯示名 |
| `avatar_ref` | TEXT NULL | P0 用預設 avatar code；上傳到 P1/R2 |
| `home_area_id` | TEXT FK NULL | 預設 `YUANSHAN_PILOT`，不是精確住址 |
| `budget_min_twd` | INTEGER NULL >=0 | 一般可接受每人低標 |
| `budget_max_twd` | INTEGER NULL >= min | 一般可接受每人高標 |
| `default_party_size` | INTEGER 1–20 DEFAULT 1 | 常見用餐人數 |
| `profile_visibility` | PRIVATE / TEAM | P0 不提供完全公開 Profile |
| `onboarding_completed_at` | TEXT NULL | NULL 表示首次登入尚未完成 |

#### `preference_rules`

| 欄位 | 型別／限制 | 範例 |
|---|---|---|
| `id`, `user_id` | TEXT | owner |
| `rule_key` | TEXT | `NO_BEEF`, `VEGAN`, `TAKEOUT`, `WILL_SPLIT` |
| `rule_type` | HARD_EXCLUSION / SOFT_PREFERENCE | 硬限制不可被 score 抵銷 |
| `strength` | INTEGER 1–5 | 只對 soft preference 有效 |
| `value_json` | TEXT NULL | 需要參數時使用，例如最大等待分鐘 |
| `source` | USER_CONFIRMED | P0 不從行為猜過敏或宗教限制 |
| `confirmed_at` | TEXT | 最近確認時間 |

#### `user_place_events`

`id, user_id, place_id, event_type(FAVORITE|VISITED|SHARED), occurred_at, metadata_json`

評價使用獨立 `reviews`，團購紀錄由 commitments 反查，不在 Profile 複製陣列。

### 7.2 圓山、地點與 Restaurant Data Standard

#### `areas`

| 欄位 | 型別 | P0 值 |
|---|---|---|
| `id` | TEXT PK | `YUANSHAN_PILOT` |
| `name` | TEXT | `圓山生活圈` |
| `anchor_place_provider` | TEXT | `GOOGLE` |
| `anchor_place_id` | TEXT | 圓山站的已查核 Google Place ID；seed 前取得 |
| `center_lat_e6`, `center_lng_e6` | INTEGER | 由 anchor geocode 後凍結在 seed，不手猜 |
| `radius_m` | INTEGER | `2000`，對齊原 SPEC 的 2 公里 Demo 條件 |
| `boundary_geojson` | TEXT NULL | P1 若需要非圓形邊界再補 |
| `timezone` | TEXT | `Asia/Taipei` |

「圓山區」不是正式行政區名稱，因此 UI 應改寫為「圓山生活圈（圓山站 2 km）」；資料篩選以 anchor + radius 為準，避免地圖邊界語意不清。

#### `places`

| 欄位 | 型別／限制 | 說明 |
|---|---|---|
| `id` | TEXT PK | 內部 place id |
| `kind` | RESTAURANT / STORE / VENUE / PUBLIC_RESOURCE / TRANSIT | 類型 |
| `name` | TEXT NOT NULL | 店／場館名稱 |
| `address_text` | TEXT NULL | 公開營業地址，不是 user address |
| `lat_e6`, `lng_e6` | INTEGER NULL | marker 與 geofence |
| `area_id` | TEXT FK | P0 固定 YUANSHAN_PILOT |
| `phone_public` | TEXT NULL | 僅官方公開聯絡方式 |
| `website_url` | TEXT NULL | provider URL |
| `status` | ACTIVE / TEMP_CLOSED / PERM_CLOSED / UNKNOWN | 不等同即時開門狀態 |
| `created_at`, `updated_at` | TEXT | lifecycle |

#### `external_place_refs`

`place_id, provider(GOOGLE|OSM|TAIPEI_OPEN_DATA|OTHER), external_id, canonical_url, last_checked_at`

Google Places 的 `place_id` 可長期保存；其他 Places content 不應任意永久 cache。要顯示 Google rating、review count、hours 時，使用即時／條款允許的短 cache 並附 attribution、`fetched_at`、`expires_at`，不要把 Google 資料混成自有永久事實。[Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)

#### `restaurants`

`place_id PK/FK, cuisine_primary, cuisine_tags_json, service_modes_json, reservation_supported, last_menu_verified_at`

`cuisine_primary` 使用受控 taxonomy；`service_modes_json` 只允許 `DINE_IN|TAKEOUT|DELIVERY`。配送能力未知時為 NULL，不設 false。

#### `menu_items`

| 欄位 | 型別／限制 | 說明 |
|---|---|---|
| `id`, `restaurant_id` | TEXT | 關聯 |
| `name` | TEXT NOT NULL | 品項／套餐 |
| `item_type` | SINGLE / SET / BUFFET / GROUP_PACKAGE | 比較單位 |
| `base_price_twd` | INTEGER NULL >=0 | 官方／provider 價格；未知 NULL |
| `servings_min`, `servings_max` | INTEGER NULL >0 | 可支持人數範圍 |
| `portion_grams` | INTEGER NULL | 只有證據時填 |
| `calories_kcal`, `protein_g_x10` | INTEGER NULL | 禁止 AI 猜值；需營養 evidence |
| `satiety_score_x100` | INTEGER NULL 0–10000 | 社群量表，不能標為營養事實 |
| `variety_count` | INTEGER NULL >=1 | 可區分菜色數 |
| `drink_included`, `soup_included`, `rice_refill` | INTEGER NULL | NULL=未知、0=明確否、1=明確是 |
| `availability_rule_json` | TEXT NULL | 時段、星期、售完條件 |
| `status` | ACTIVE / UNAVAILABLE / UNKNOWN | 資料狀態 |

#### `offers`

| 欄位 | 型別／限制 | 說明 |
|---|---|---|
| `id`, `place_id`, `menu_item_id` | TEXT | menu_item 可 NULL |
| `offer_type` | STUDENT / GROUP / MEMBER / COUPON / HAPPY_HOUR / LIMITED / BUY_X_GET_Y / BULK | 類型 |
| `title`, `description` | TEXT | 不用 marketing copy 取代條件 |
| `regular_price_twd`, `offer_price_twd` | INTEGER NULL | 可比基準相同才可算 discount |
| `discount_bps` | INTEGER NULL 0–10000 | 85 折 = 1500 bps off，不存模糊字串 |
| `min_people`, `min_quantity` | INTEGER NULL | 團體門檻 |
| `membership_required`, `registration_required` | INTEGER NULL | NULL=未知 |
| `valid_from`, `valid_until` | TEXT NULL | limited offer 必填 valid_until |
| `origin_type`, `verification_status` | enum | 來源與驗證分開 |
| `visibility` | PUBLIC / TEAM | 隱藏情報可只給 Team |
| `created_by` | TEXT FK NULL | community/provider attribution |

#### `restaurant_value_observations`

用於份量、飽足度、等待等非菜單核心量測：

`id, restaurant_id, menu_item_id NULL, metric_key(PORTION_SCORE|SATIETY_SCORE|WAIT_MIN|POSITIVE_RATIO|NEGATIVE_RATIO), value_x100, sample_size, source_id, observed_at, valid_until, verification_status`

相同比較 cohort 至少有 5 筆才產 percentile；不足時顯示原始值，不製造看似精確的區域排名。

### 7.3 Source、Evidence 與 crawler audit

#### `sources`

`id, origin_type, authority_level(1..5), publisher_name, canonical_url, license_note, terms_checked_at, fetch_allowed, retention_policy, created_at`

建議 authority：官方機關 5、商家正式頁 4、可靠公共頁 3、已驗證社群 2、未驗證社群 1。這只影響 Reliability，不替代欄位證據。

#### `source_snapshots`

`id, source_id, fetched_at, http_status, content_hash, short_excerpt, expires_at, fetch_run_id`

只保存必要短摘錄與 hash；不大量複製網頁。對禁止保存的 provider，`short_excerpt` 為 NULL，只記 request metadata／external id。

#### `evidence_assertions`

| 欄位 | 說明 |
|---|---|
| `id` | assertion id |
| `subject_type`, `subject_id` | AREA / PLACE / MENU_ITEM / OFFER / OPPORTUNITY / REPORT |
| `field_key` | 例如 `base_price_twd`, `min_people`, `food_provided` |
| `claimed_value_json` | 當下宣稱值 |
| `source_snapshot_id` | 支持來源 |
| `evidence_quote` | 短摘錄；受 retention policy 管理 |
| `observed_at`, `valid_from`, `valid_until` | 時間語意 |
| `verification_status`, `verified_by`, `verified_at` | 驗證流程 |

同一欄位有兩個有效且權威度相近的不同值時，產生 `CONFLICTED`，不靠 last-write-wins 靜默覆蓋。

#### `fetch_runs` / `fetch_items`

- `fetch_runs`: `id, agent_type(PAID|ZERO_COST), query_hash, started_at, finished_at, status, timeout_ms, candidate_count, accepted_count, error_code`
- `fetch_items`: `run_id, source_id, external_ref, status, reject_reason, latency_ms, snapshot_id`

P0 先做可重跑的 curated JSON/CSV importer + schema validator；Crawler adapter 到 P1。AI Agent 只做 candidate generation／欄位抽取建議，證據閘門與排序仍是 deterministic code。

### 7.4 Team Mode

#### `teams`

`id, name(1..60), owner_id, description, visibility(INVITE_ONLY), status(ACTIVE|ARCHIVED), created_at, updated_at, version`

P0 只有邀請制，不提供公開搜尋陌生團。

#### `team_members`

`team_id, user_id, role, member_status(INVITED|ACTIVE|LEFT|REMOVED), joined_at, left_at`

Unique `(team_id, user_id)`；所有 team write 先驗 active membership。

#### `team_invites`

`id, team_id, token_hash UNIQUE, created_by, expires_at, max_uses, use_count, revoked_at`

資料庫只存 token hash；邀請 link 預設 72 小時、最多 10 次使用，可撤銷。

#### `team_saved_places`

`team_id, place_id, saved_by, note, created_at`，Unique `(team_id, place_id)`。

#### `group_campaigns`

| 欄位 | 說明 |
|---|---|
| `id`, `team_id`, `offer_id`, `created_by` | ownership |
| `title` | 「5 人便當 85 折」 |
| `target_people`, `target_quantity` | 門檻分開 |
| `deadline` | 必填 |
| `unit_price_twd`, `estimated_total_twd` | 只在有證據時填 |
| `pickup_text` | 粗略公開地點描述，不存個人住址 |
| `status` | OPEN / THRESHOLD_MET / CLOSED / CANCELLED / EXPIRED |
| `version` | 避免同時加入造成進度覆寫 |

#### `group_commitments`

`id, campaign_id, user_id, quantity, max_cost_twd NULL, note, status(PLEDGED|CONFIRMED|WITHDRAWN), created_at, updated_at`

Unique `(campaign_id, user_id)`。進度以 active commitment 即時計算，不另存 `3/5` 字串；若為 Demo 效能可存 materialized summary，但 source of truth 仍是 commitments。

### 7.5 Community Intelligence 與食安

#### `community_reports`

`id, subject_type, subject_id, reporter_id, report_type, title, description, occurred_at, submitted_at, origin_type=COMMUNITY, verification_status, moderation_status(PENDING|VISIBLE|HIDDEN|ESCALATED), visibility, team_id NULL, allow_provider_response, deleted_at`

#### `report_evidence`

`id, report_id, evidence_type(RECEIPT|PHOTO|URL|TEXT), source_url NULL, object_key NULL, captured_at NULL, created_at`

P0 只接受 URL／文字；照片與 receipt 上傳在 P1 啟用 R2 後加入，並移除 EXIF、限制內容類型與大小。

#### `report_verifications`

`id, report_id, verifier_id, action(CORROBORATE|DISPUTE|PROVIDER_CONFIRM|OFFICIAL_CONFIRM|REJECT), evidence_assertion_id NULL, note, created_at`

不能單靠按讚升級為 VERIFIED_COMMUNITY。至少兩位獨立 active user 佐證且沒有高可信衝突，才可進 `CORROBORATED`；`OFFICIAL_CONFIRMED` 必須連官方 evidence。

#### `reviews`

`id, place_id, author_id, rating_x100(100..500), portion_score_x100 NULL, value_score_x100 NULL, wait_min NULL, text, visited_at NULL, created_at, moderation_status`

主觀評價與安全事件分表；Review 不允許直接寫入 official fact。

### 7.6 Zero-Cost Opportunity

#### `opportunities`

| 欄位 | 型別／限制 | 說明 |
|---|---|---|
| `id` | TEXT PK | opportunity |
| `name` | TEXT NOT NULL | 名稱 |
| `category` | EVENT_FOOD / GOVERNMENT / NGO_VOLUNTEER / EXPO_SAMPLE / COMMERCIAL_REWARD / PUBLIC_RESOURCE | 類型 |
| `place_id` | TEXT FK NULL | 可在地圖定位 |
| `starts_at`, `ends_at` | TEXT | 起訖時間 |
| `direct_cost_twd` | INTEGER NULL | 必須有 evidence 才能為 0 |
| `food_provided` | NONE / SNACK / MEAL / UNKNOWN | 不用 boolean 掩蓋份量 |
| `food_detail` | TEXT NULL | Lunch provided 等原始條件 |
| `registration_required`, `membership_required` | INTEGER NULL | NULL=未知 |
| `volunteer_minutes` | INTEGER NULL >=0 | Time → Contribution → Meal |
| `admission_cost_twd`, `required_purchase_twd` | INTEGER NULL | 免費食物但需門票／消費 |
| `estimated_duration_min` | INTEGER NULL | 活動／排隊時間 |
| `source_id`, `verification_status` | TEXT / enum | 證據 |
| `valid_until`, `last_verified_at` | TEXT | freshness |
| `action_url` | TEXT NULL | 報名／官方頁 |

#### `opportunity_requirements`

`id, opportunity_id, requirement_type(AGE|RESIDENCY|STUDENT|MEMBERSHIP|REGISTRATION|PURCHASE|VOLUNTEER|OTHER), operator(EQ|GTE|LTE|IN), value_json, is_mandatory, evidence_assertion_id`

#### Effective Cost

```text
money_cost
  = direct_cost_twd
  + admission_cost_twd
  + required_purchase_twd
  + known_mandatory_fees_twd

transport_cost
  = user-confirmed fare OR sourced fare estimate
  = NULL when unknown

time_cost
  = (travel_minutes + wait_minutes + volunteer_minutes + required_action_minutes)
    × user_time_value_twd_per_minute

effective_cost_twd = money_cost + transport_cost + time_cost
```

預設 `user_time_value_twd_per_minute` 不應偷偷假設最低工資。P0 顯示兩個值：「現金支出」與「總時間」；只有使用者在 Profile 主動設定時間價值時才顯示 monetized Effective Cost。任何必要成本未知，`effective_cost_twd = NULL` 並顯示「成本不完整」。

### 7.7 CP score 與 audit

#### `score_policies`

`id, version UNIQUE, cohort_rule_json, base_weights_json, normalization_rule_json, missing_rule_json, active_from, retired_at, created_by`

#### `user_score_profiles`

`user_id PK, price_weight_bps, food_weight_bps, quality_weight_bps, convenience_weight_bps, discount_weight_bps, time_value_twd_per_hour NULL, updated_at`

五個偏好權重總和必須為 10000 bps。Reliability 不由 user 降到 0，因為它是可信度乘數。

#### `score_runs` / `score_components`

- `score_runs`: `id, subject_id, subject_type, user_id NULL, policy_version, cohort_key, base_score_x100, personalized_score_x100 NULL, reliability_x100, coverage_x100, computed_at, input_hash`
- `score_components`: `score_run_id, dimension, raw_value_json, normalized_x100, weight_bps, evidence_status, reason_code`

保存 score 的輸入 hash 與 policy version，確保 Demo 能回答「為什麼今天分數跟昨天不同」。

### 7.8 P0 indexes

只針對實際 query 建索引：

```text
UNIQUE users(auth_subject)
UNIQUE external_place_refs(provider, external_id)
INDEX places(area_id, kind, status)
INDEX menu_items(restaurant_id, status, base_price_twd)
INDEX offers(place_id, valid_until, verification_status)
INDEX evidence_assertions(subject_type, subject_id, field_key, verification_status)
UNIQUE team_members(team_id, user_id)
INDEX team_members(user_id, member_status)
UNIQUE group_commitments(campaign_id, user_id)
INDEX group_campaigns(team_id, status, deadline)
INDEX community_reports(subject_type, subject_id, report_type, moderation_status)
INDEX opportunities(starts_at, ends_at, verification_status)
INDEX score_runs(subject_type, subject_id, policy_version, computed_at)
```

Migration 使用 Drizzle schema + append-only migration；不在 runtime 自動建表。每次 migration 後以 representative query 跑 `EXPLAIN QUERY PLAN`，再 `PRAGMA optimize`。

## 8. CP Value Data Standard V1

### 8.1 Pipeline，不是單一魔法公式

```text
Candidate generation
  → Evidence gate
  → Hard-constraint filter
  → Cohort construction
  → Dimension normalization
  → Base CP score
  → Personalized CP score (optional)
  → Policy re-ranking: safety, freshness, diversity
  → Explanation
```

這符合推薦系統常見的 candidate generation → scoring → re-ranking 分層；安全與垃圾訊號應是 policy layer，而不是跟品質混成一個可互相抵銷的分數。[Google recommendation overview](https://developers.google.com/machine-learning/recommendation/overview/types)、[Rules of ML](https://developers.google.com/machine-learning/guides/rules-of-ml/)

### 8.2 比較 cohort

只有同 cohort 才 normalization：

```text
area = YUANSHAN_PILOT
category = restaurant meal / zero-cost opportunity / ...
party_size_bucket = 1 | 2 | 3-4 | 5+
time_window = breakfast | lunch | dinner | late
service_mode = dine-in | takeout | delivery
```

餐廳與活動不互相比；免費與付費不混為一個榜。Cohort 少於 5 筆時，V1 不顯示 percentile CP，只顯示可驗證成本與 dimension raw values。

### 8.3 Normalization

每個連續值在 cohort 內先做 5th／95th percentile winsorization，再轉 empirical percentile 0–100，降低極端錯誤值支配排名。價格方向反轉：越低越高分。Winsorized statistics 的基本做法是把尾端觀測值替換為指定 percentile 邊界。[NIST Winsorized mean](https://www.itl.nist.gov/div898/software/dataplot/refman2/ch2/winsmean.pdf)

```text
higher_is_better(x) = percentile_rank(winsorize(x)) × 100
lower_is_better(x)  = 100 - higher_is_better(x)
```

類別值採明確 mapping 並版本化，不把「有／沒有」任意轉成黑箱小數。

### 8.4 五個價值維度 + Reliability

#### Price Value

- 主值：`comparable_total_cost_twd / satisfied_servings`。
- Group 模式使用達標後的 `estimated_cost_per_person`，未達標不得用團購價冒充現價。
- 未知 mandatory fee → 排除主要排序。

#### Food Value

- `serving_coverage = min(1, supported_servings / requested_servings)`；小於 1 是 hard fail。
- portion、satiety、variety、included items 可形成 food score。
- calories／protein 只有官方標示或可追溯 evidence；健身 profile 可提高 protein 的子權重，但不推估。

#### Quality Value

- 評分跨平台先各自在來源內正規化，不直接平均 Google 4.5 與另一平台 90 分。
- 對星等採 Bayesian shrinkage：`adjusted = v/(v+m)*R + m/(v+m)*C`，避免 1 筆五星擊敗 500 筆 4.6 星；`C` 是 cohort mean，`m` 是 cohort review_count 的 60th percentile，兩者都由資料算出而非硬寫。
- 社群 positive/negative ratio 需 sample size；小樣本只顯示原始回報數。

#### Convenience

- 地圖直線距離、使用者提供／來源提供的交通時間、等待、營業時段匹配。
- P0 不呼叫導航；直線距離標成「地圖距離」，不能寫「步行 X 分鐘」。

#### Discount Value

- 只計算已驗證、使用者確實符合條件、同一商品／份量的 discount。
- `discount_rate = (regular_comparable_cost - offer_comparable_cost) / regular_comparable_cost`。
- Coupon flag 本身不加分；無可靠 regular price 就只顯示 offer price。

#### Reliability

Reliability 是可信度乘數，不是可被其他優點抵銷的第六個加分項：

```text
authority: official 1.00, provider 0.90, public 0.75,
           verified community 0.70, community 0.45
freshness: fact-specific decay 0.50..1.00
coverage:  有 evidence 的必要 scoring 欄位權重占比
conflict:  無衝突 1.00；未解衝突直接 gate out

reliability = authority × freshness × coverage × conflict
```

### 8.5 Base CP Score

V1 預設權重是可測試假設，不是假裝科學定論：

```text
Price        35%
Food         20%
Quality      20%
Convenience  10%
Discount     15%
```

```text
raw_cp = Σ(weight_i × normalized_dimension_i) / Σ(available_weight_i)
coverage = Σ(available_weight_i)
base_cp = raw_cp × (0.70 + 0.30 × reliability) × coverage_penalty
coverage_penalty = 1.00 when coverage >= 0.80
                 = 0.90 when 0.60 <= coverage < 0.80
                 = no score when coverage < 0.60
```

顯示到整數 0–100，但內部存 x100。Price、完整成本、服務份量與 evidence 是 gate-required，不能靠重新正規化缺欄位來取得高分。

### 8.6 Personalized CP Score

Profile 可選 preset：

| Preset | Price | Food | Quality | Convenience | Discount |
|---|---:|---:|---:|---:|---:|
| Balanced / 預設 | 35 | 20 | 20 | 10 | 15 |
| Student | 40 | 30 | 10 | 5 | 15 |
| Fitness | 30 | 30 | 20 | 10 | 10 |
| Time-sensitive | 25 | 15 | 20 | 30 | 10 |
| Group | 30 | 20 | 15 | 10 | 25 |

使用者可調整，但每維至少 5%、最多 50%，總和 100%。Base Score 永遠保留，Personalized Score 並列；不能只顯示個人化結果。

### 8.7 缺失資料與排序 tie-break

- cost／mandatory fee／serving sufficiency／核心 evidence 缺失：`EXCLUDED` 或待確認區。
- 非核心 dimension 缺失：可在 coverage ≥60% 時計分，但標「資料不完整」並套 penalty。
- 兩筆分數差 <2 分視為近似同級；依 reliability、freshness、distance 再排序。
- 安全事件、贊助、來源衝突由 re-ranking policy 處理；Sponsored 不提高 CP。
- UI 展示最多三個原因，例如「每人省 NT$28」「多走 350m」「情報 2 天前由商家確認」。

## 9. Google Maps：圓山生活圈方案

### 9.1 P0 功能邊界

- Google Maps JavaScript API 顯示圓山站 2km geofence、餐廳與機會 marker。
- 使用 Advanced Markers；marker 顏色只表示 paid、zero-cost、team deal 與 warning。
- 選 marker 開 bottom sheet／side panel，不用 InfoWindow 塞全部內容。
- Places 用於搜尋／解析 place identity 與即時 public fields；推薦資料仍經 evidence gate。
- 不做 Directions、導航、即時交通或背景 GPS。
- 使用者可選擇「以圓山站為中心」；P0 不要求位置權限。

Google Maps JavaScript 可用 Places `searchByText`／`searchNearby`，Advanced Marker 也有可點擊與 accessibility 支援。[Places JS reference](https://developers.google.com/maps/documentation/javascript/reference/place)、[Advanced Markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/add-marker)

### 9.2 Key 與成本安全

- Browser key 僅允許正式網域與 localhost referrer，API restriction 只開 Maps JavaScript／Places。
- Server-side key 與 browser key 分離；server key 不進 repository 或 client bundle。
- 設 daily quota、budget alert、usage dashboard。
- API 失敗時保留清單；地圖顯示「地圖暫時無法載入」，不可讓核心決策頁整頁失效。

Google 明確要求 API key 與 billing，並建議 website key 採 website restriction、不同 app／用途分 key。[Maps troubleshooting](https://developers.google.com/maps/documentation/javascript/troubleshooting)、[API security](https://developers.google.com/maps/api-security-best-practices)

## 10. 響應式頁面與操作流程

### 10.1 Information architecture

```text
/                     Discover / Mission
/map                  Map + result list
/place/[id]           Place, CP breakdown, evidence, reports
/zero-cost            Zero-Cost opportunities
/teams                Team list
/teams/[id]           Team feed, saved places, active campaigns
/campaigns/[id]       Join / commitment progress
/profile              Profile + CP preference
/demo                  deterministic judge walkthrough
```

P0 可先在單一 route 用 tabs／sheet 實現，route contract 先固定；不要為了 routing 重寫全部 UI。

### 10.2 Mobile 320–767px

- Sticky top HUD：區域、模式、任務預算。
- Bottom navigation：探索、地圖、團隊、Profile。
- 搜尋表單單欄；進階限制放 bottom sheet。
- 結果清單與地圖用 toggle，不做難以操作的 50/50 split。
- marker 選擇後開 60–75vh bottom sheet。
- CP 卡先顯示成本、Base／Personal score、三個理由、Reliability；完整維度在 accordion。
- Team join 使用底部固定 CTA，按鈕至少 44px。

### 10.3 Tablet 768–1199px

- 兩欄：filters 320px + results；地圖可切全屏。
- Team progress 與 evidence drawer 從右側開啟。

### 10.4 Desktop ≥1200px

- 三欄 working surface：左側 constraints/Profile 摘要、中間結果、右側固定地圖。
- 第一 viewport 就看得到任務輸入、至少一張結果與地圖，不放大型 marketing hero 擋住工作流。
- Detail 用 side sheet；保留目前黑底、螢光綠、紫色、黃色的視覺語意。

### 10.5 核心 flows

#### First login / Profile

登入 → 預填 display name → 選 nickname／預算／常見人數 → 選 hard exclusions → 選 CP preset → 完成。Avatar、收藏匯入與細部偏好可跳過，避免 onboarding 過長。

#### Discover / Compare

輸入任務 → 顯示「目前理解」→ 修改 hard／soft → 兩 Agent 並行 → 部分結果先顯示 → list/map → 打開 CP breakdown/evidence → 收藏／分享／回報。

#### Team up

分享情報 → 設最低人數與期限 → 建立邀請制 Team/campaign → 分享 link/code → 成員 join/pledge → `3/5` → `5/5` → THRESHOLD_MET → 團主前往外部來源。

#### Zero-Cost

切 Zero-Cost → 日期／最大現金／可接受時間／資格 filter → 顯示現金成本 + 交通 + 時間 + 必要行動 → Evidence → 外部報名。沒有 transport/time 值時明確顯示成本不完整。

### 10.6 必備狀態

每一主要 flow 都要有 loading、partial、empty、offline、stale、conflicted、permission denied、expired invite、campaign full、campaign cancelled、map failure 與 external source unavailable。

## 11. PWA 規劃

PWA 是 P1，但 P0 先把 HTML metadata 與 responsive viewport 做對。

### P1 installability

- `/app.webmanifest`：`id=/`、`name=ALL IN LIFE`、短名 `ALL IN LIFE`、`start_url=/`、`display=standalone`、theme/background colors。
- 192x192、512x512、maskable icon；iOS apple-touch-icon。
- Root service worker；cache version 與 release version 綁定。
- 安裝提示只在使用者完成一次核心任務後出現，不阻擋 Demo。

Manifest 是各瀏覽器安裝體驗的核心 metadata；安裝能力依瀏覽器／OS 不同。[web.dev installation](https://web.dev/learn/pwa/installation)、[web app manifest](https://web.dev/learn/pwa/web-app-manifest)

### Offline boundary

- Cache-first：app shell、icons、fonts。
- Stale-while-revalidate：最近一次「已驗證結果」的自有 API response，帶明顯 `offline_snapshot_at`。
- Network-only：登入、Team write、invite redeem、report submit、score recompute。
- 不離線 cache Google map tiles 或受限制 Places content；offline 時切回自有 list view。
- service worker 是 enhancement；核心 first load 不依賴它。官方也建議不要把核心能力建立在 service worker 一定可用的假設上。[web.dev service workers](https://web.dev/learn/pwa/service-workers)

## 12. 評審 Demo 與給評審自行使用

### 12.1 環境

- Production demo：既有 Sites project，公開 HTTPS URL；server-backed Worker + D1。
- Preview：每個 release candidate 一個 private preview URL，只有團隊測試。
- Demo database：獨立 D1，只有圓山 seed；與未來 production data 分離。
- `DEMO_MODE=1`：固定 query、固定 score policy、可重置的 demo team；UI 明確標 Demo data 的查核時間。

### 12.2 Seed pack

- 15–20 個真實圓山 places。
- 至少 10 個可比餐食／offer，其中 7 筆通過 evidence gate。
- 至少 7 個 zero-cost opportunities，其中一筆需登記、一筆需資格、一筆需志工時間。
- 1 個 community tip：「5 人 85 折」，起始 3/5。
- 2 個 demo personas 可用一鍵加入至 5/5。
- 1 筆 stale、1 筆 conflicted、1 筆 missing mandatory fee 作誠信 Demo。
- 所有真實資料在 Demo 前 24 小時內跑 verifier；不足就顯示實際筆數，不能補假資料。

### 12.3 90 秒導演稿

1. 0–12s：手機／桌面同網址，圓山站 2km、Guest 可直接使用。
2. 12–28s：輸入「2 人晚餐 NT$300」，指出 hard constraints 與 editable understanding。
3. 28–43s：兩 Agent 並行，結果先過 evidence gate。
4. 43–58s：打開第一名，展示 Base 82、Personal 88，以及 price/food/quality/convenience/discount/reliability。
5. 58–72s：地圖點 marker，打開 5 人 85 折情報；來源為 verified community，不是假裝官方。
6. 72–84s：Join Team，3/5 → 5/5；平台不代收款。
7. 84–90s：切 Zero-Cost，指出「NT$0 但交通／時間不一定是 0」。

### 12.4 現場保險

- 使用已驗證 seed 做 fallback；外部 API timeout 3–5 秒即呈現 partial result。
- 預先暖機 Worker；準備 QR code 與桌面網址。
- 地圖失敗時清單仍完整；語音失敗可貼固定 query。
- Demo reset 只重置 demo tenant 的 commitments/reports，不刪 production data。
- 不在台上建立真實 Google billing、API key 或登入設定。

## 13. P0 / P1 / P2

### P0 — 底層正確且能 Demo

1. 凍結 enums、D1 schema、seed contract 與 API DTO。
2. 將 Sites 從 static export 轉 server-backed Vinext；啟用 D1 logical binding。
3. Guest read-only + signed-in Profile；首登 onboarding。
4. Place、Restaurant、Menu、Offer、Source、Evidence schema 與 importer。
5. deterministic evidence gate、hard constraint evaluator、CP scorer v1、score explanation。
6. 邀請制 Team、Campaign、Commitment；3/5 → 5/5。
7. Community offer tip；食安先有資料模型與安全文案，但不做完整群眾判定。
8. Google Map 圓山站 2km、markers、list/map fallback。
9. Zero-Cost schema、有效成本拆解與至少 7 筆 seed。
10. Responsive flows、error/empty/offline-like fallback、90 秒 `/demo`。

### P1 — 資料更新、PWA 與可信度

- Curated importer 擴成受控 crawler adapters、排程刷新與 admin review queue。
- R2 evidence upload、EXIF 清除、content validation。
- PWA manifest、service worker、offline verified snapshot。
- Team shared favorites、共同評價、通知與 invite lifecycle 完整化。
- Google live fields 的合規短 cache／attribution。
- Community corroboration、provider response、moderation dashboard、reputation events。
- Score weight calibration：用 pairwise choice / task success 測試，而非只看點擊。

### P2 — 明確延後

- Marketplace、中央廚房、供應商 marketplace。
- 平台內付款、代收、退款、票券核銷。
- 完整陌生人社交網路、公開 follower/feed。
- 陌生人共乘、導航、即時位置追蹤。
- 黑箱 ML 個人化與自動調權；資料量與 outcome label 足夠後再評估。
- 食物中毒因果認定、醫療／營養建議。
- 全台與多國擴張。

## 14. 實作切片與責任邊界

### Slice 0 — Contract freeze（0.5 天）

- 產出 `db/schema.ts`、migration 0001、enums、API DTO、seed validator。
- 將現有 `Result` 映射到新 read model，不立刻重寫全部卡片。
- 測試 unknown != zero、conflict gate、free conditional。

### Slice 1 — Evidence-backed restaurant + score（1–1.5 天）

- 匯入 7+ 圓山餐食。
- `/api/search` 回傳 constraints、accepted/rejected candidates、score breakdown。
- 現有 results UI 改接 API；保留 timer 只作 Demo animation，不冒充網路工作。

### Slice 2 — Profile + Team campaign（1 天）

- SIWC／platform identity、Profile onboarding。
- team create/invite/join、campaign pledge、進度 concurrency test。

### Slice 3 — Map + Zero-Cost（1 天）

- map/list、geofence、key restriction、failure fallback。
- zero-cost filters 與 effective cost breakdown。

### Slice 4 — Demo hardening（0.5–1 天）

- `/demo` reset、seed freshness、timeouts、partial/empty/conflict cases。
- 320／390／768／1440 CSS regression，鍵盤與 focus smoke test。
- 修正或隔離目前 Windows build teardown assertion；CI 必須得到真正的 exit code 0。
- build、private preview、production deploy、QR code。

## 15. API contract（P0 最小集合）

```text
GET  /api/areas/YUANSHAN_PILOT
POST /api/search
GET  /api/places/:id
GET  /api/places/:id/evidence
GET  /api/opportunities

GET  /api/me/profile
PUT  /api/me/profile

POST /api/teams
POST /api/teams/:id/invites
POST /api/invites/:token/redeem
POST /api/campaigns
PUT  /api/campaigns/:id/commitment

POST /api/reports
POST /api/demo/reset        # demo tenant + server authorization only
```

`POST /api/search` 回傳 `query`, `hard_constraints`, `soft_preferences`, `agent_runs`, `accepted`, `pending`, `rejected_summary`。每個 accepted item 必須帶 `score_policy_version`, `base_score`, optional `personal_score`, `reliability`, `coverage`, `top_reasons`, `evidence_summary`。

所有 write route 在 server 端由 auth subject 找 user，不相信 client 的 `user_id`／`team_role`。Team 資料以 membership 做 row-level authorization。Demo reset 不對一般 public client 開放。

## 16. 驗收條件

- 現有 PRD 的硬限制、Evidence、Unknown、Free conditional 原則全部仍成立。
- 第一次登入可在 60 秒內完成 Profile，且可跳過非必要欄位。
- Guest 不登入也能完成搜尋、地圖與 Evidence Demo。
- 兩個相同輸入、相同 policy/version、相同資料 snapshot 必須得到相同 score。
- 每個分數可還原到 component、raw value、evidence 與 policy version。
- 未達 5 人前不把 85 折價當成已取得價格；第 5 人加入後狀態原子性變成 THRESHOLD_MET。
- Community report 永遠保留來源類型；不能一鍵變 official。
- 單一未驗證食安 report 不顯示因果斷言。
- Zero-Cost 卡片同時顯示現金、交通、時間與必要行動；缺值不補零。
- 地圖 API 失敗不影響 list；offline 不顯示過期內容為即時結果。
- 320px 與 1440px 都能完成完整核心流程，主要操作不依賴 hover。
- Demo seed 全部有 `collected_at`／`verified_at`／source／evidence；Fixture 明確標示且不進真實推薦。

## 17. 尚待產品驗證、但不阻擋 P0 的問題

- 使用者更接受「Team Mode」、「團戰」還是「一起省」作正式名稱。
- Base weight 是否真的能預測「使用者最後選了什麼」；需用任務完成率與 pairwise preference 校準。
- 團體情報最常見門檻是人數、數量或總金額。
- 使用者是否願意設定 time value；若不願意，Zero-Cost 應維持金額＋分鐘雙軸，不硬合成一個數字。
- 食安 corroboration 門檻需要法務／信任安全 review，P0 的兩人規則只用於一般優惠／資料情報，不自動做食安結論。
- Tim／Andy 的成品、分支或影片尚未出現在目前 repository；取得 artifact 後才能做真正的 side-by-side 評比。
