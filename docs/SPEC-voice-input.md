# ALL in life — 語音輸入規格（Voice Input Spec）

- 文件狀態：Hackathon MVP build spec
- 版本：v0.2
- 日期：2026-09-04
- 上游文件：[PRD-all-in-life.md](./PRD-all-in-life.md)（FR-02、FR-03、FR-15、§7.1、§13）
- 詞彙：以 [CONTEXT.md](../CONTEXT.md) 為準

## 1. 摘要與範圍

使用者用說的告訴系統需求與限制，例如「今天晚餐兩個人預算三百圓山區二十分鐘內可以外帶」。系統把語音轉成逐字稿，再由需求解析轉成結構化的需求與限制，顯示在確認畫面讓使用者修正後才送出搜尋。使用者不需要自己填品類、預算、人數等欄位。

語音輸入是 MVP 的**主要入口**；文字輸入是 fallback；結構化表單只作為確認畫面的可編輯呈現，不再是獨立入口。

語音輸入**不是第三個 Agent**。它只是需求解析的一個輸入管道；PRD §7.2「不另造第三個 Agent」維持不變。

帳號與登入是可選的帳號功能，不改變匿名輸入閉環。匿名使用者仍可完成需求解析與搜尋；註冊／登入只用來保存帳號資料與使用需要共享狀態的功能。

### 1.1 MVP 包含

- 首頁錄音按鈕：點一下開始、再點一下結束，上限 30 秒。
- 伺服器端語音辨識（STT）與需求解析，兩者都走 OpenAI-compatible API。
- 確認畫面：逐字稿、解析欄位、未提供的硬限制、未解析內容。
- 兩種修正方式：點欄位編輯，或再按麥克風說修正語句。
- Dashboard 頂部的需求與限制 chip row，點擊回到同一個確認畫面（涵蓋 FR-13 放寬限制）。
- 文字輸入 fallback，與語音共用同一個解析端點。
- 可選的 username／password 註冊、登入、登出與修改密碼。
- 已登入帳號保存清單、收藏與設定；匿名工作階段仍可使用 `sessionStorage`。

### 1.2 MVP 不包含

- 語音回讀（TTS）。
- 即時逐字稿串流、靜音自動停止、長按錄音。
- 語言切換；辨識語言固定 zh-TW。
- Dashboard 卡片上的語音指令。
- 保存音檔、逐字稿、需求與限制或搜尋歷史到伺服器。
- 多輪對話式追問；缺欄位一律在確認畫面用「無限制」呈現。
- 自動密碼重設；忘記密碼只顯示平台支援 Email。

## 2. 使用流程

### 2.1 三個畫面

**首頁**

- 區域標籤「圓山區」。
- 顯示「註冊／登入」入口；不登入仍可使用語音、文字與搜尋。
- 大型錄音按鈕，狀態文字：「點一下開始說」→「錄音中 0:07 / 0:30，點一下結束」。
- 一行揭露文字：「語音會傳送到第三方辨識服務進行辨識，不會被保存。」
- 小型連結「改用文字輸入」，點擊後展開文字欄位。
- 表單欄位**不出現**在首頁。

**確認畫面**

1. 「我們聽到的」：逐字稿原文，不修飾。
2. 「我們理解的」：解析欄位，每個都可點擊編輯。硬限制與軟偏好分成兩區。
3. 「未提供」：逐字稿沒提到的硬限制顯示「無限制」，不猜數字。
4. 「聽到但不確定」：`unresolved` 內容逐條列出。
5. 麥克風按鈕（說修正語句）、單一「搜尋」按鈕，以及「重新開始」（清除需求與限制回到首頁）。
6. 修正語句送出後，「我們聽到的」保留原始逐字稿並在下方列出修正語句。

**Dashboard**

- 頂部 chip row 顯示已確認的需求與限制，例如「晚餐 · 2 人 · NT$300 · 20 分鐘內 · 可外帶」。
- 點 chip row 回到確認畫面，麥克風可用；FR-13 的放寬限制走同一條路。

### 2.2 狀態機

```text
idle
  └─ tap mic ──────────────────────────► recording (countdown 0:00→0:30)
recording
  ├─ tap mic / 30s reached ────────────► transcribing  (POST /api/transcribe)
  └─ mic permission denied ────────────► text_fallback (reason shown)
transcribing
  ├─ ok, transcript non-empty ─────────► parsing       (POST /api/parse)
  ├─ ok, transcript empty ─────────────► idle          (「沒有聽到內容，再試一次」，留在目前畫面)
  ├─ error, 1st time ──────────────────► idle          (「辨識失敗」；麥克風按鈕即重試)
  ├─ error, 2nd time ──────────────────► text_fallback
  └─ timeout 30s ──────────────────────► text_fallback
parsing
  ├─ ok ───────────────────────────────► confirming
  ├─ error / timeout 30s ──────────────► text_fallback (逐字稿保留在文字欄位)
confirming
  ├─ tap field, edit ──────────────────► confirming
  ├─ tap mic, speak delta ─────────────► recording (with current 需求與限制 as context)
  └─ tap 搜尋 (need present) ──────────► searching (existing PRD §7.1 step 3 onward)
text_fallback
  └─ submit text ──────────────────────► parsing
dashboard
  └─ tap chip row ─────────────────────► confirming
```

轉場期間顯示階段名稱：「辨識中」、「解析中」。不顯示空白等待頁。

### 2.3 Demo 情境對應

- **情境 A（低預算付費選項）**：說出「今天晚餐兩個人預算三百圓山區二十分鐘內可以外帶」→ 確認畫面顯示晚餐 / 2 人 / NT$300 / 20 分鐘 / 今天 / 可外帶 → 搜尋。
- **情境 B（免費資源）**：說出「這週末圓山區有沒有不用付費的活動或公共資源可以先登記」→ 預算與人數顯示「無限制」，`free_only = true`，`registration_ok = true`，`target_categories` 含「免費／公益資源」與「活動」→ 可直接搜尋。

### 2.4 帳號流程

```text
anonymous
  ├─ 註冊成功 ─────────────────────────► authenticated
  └─ 登入成功 ─────────────────────────► authenticated

authenticated
  ├─ 30 分鐘 session token 到期 ────────► anonymous（提示重新登入）
  ├─ 點登出 ───────────────────────────► anonymous
  └─ 修改密碼成功 ─────────────────────► authenticated（既有 sessions 撤銷後需重新登入）
```

- 登入識別是全站唯一、不分大小寫的 `username`；`nickname` 是可修改的顯示名稱，兩者分開。
- username 允許英文字母、數字、`_`、`-`，長度 3–30 字元。
- password 最少 12 字元；伺服器只保存 Argon2id 或同等強度的雜湊值。
- session token 是隨機 opaque token，存於瀏覽器 `sessionStorage`；不使用 Cookie，也不保存 username／password。
- session token 固定在建立後 30 分鐘過期，不因請求自動延長。瀏覽器重新整理時，以同一分頁的 token 呼叫 `/api/auth/me` 恢復登入。
- 忘記密碼按鈕只彈出 `SUPPORT_EMAIL`；不提供自動 reset，也不要求使用者透過 Email 傳送 password。

## 3. 需求與限制 schema

需求解析的輸出，也是搜尋的輸入。欄位名稱在實作時可映射，但語意固定。

```text
need                 string          必填。生活需求，例如「晚餐」「找免費活動」
target_categories    string[]        子集合：食品 | 日用品 | 免費／公益資源 | 活動 | 交通
budget_total_twd     number | null   硬限制。null = 無限制
people_or_servings   number | null   硬限制
date                 string | null   硬限制。ISO 日期；由伺服器依請求當天解析「今天」「這週末」
time_window          string | null   硬限制。例如 "18:00-20:00" 或 "週末"
max_distance_km      number | null   硬限制
max_minutes          number | null   硬限制
free_only            boolean         硬限制。使用者說「免費」「不用付費」時為 true
registration_ok      boolean | null  硬限制。使用者說「可以先登記」為 true
soft_preferences     string[]        軟偏好，例如 ["可外帶"]
eligibility_notes    string | null   硬限制。例如「學生」
unresolved           string[]        聽到但無法對應欄位的片語；顯示給使用者，不猜
```

規則：

- 硬限制 = `budget_total_twd` 到 `eligibility_notes`；`null` 一律顯示「無限制」。
- `need` 是唯一必填欄位。沒有 `need` 時「搜尋」按鈕停用並提示「請說明你想找什麼」。
- `target_categories` 只影響 Dashboard 的排序與強調；五類仍全部搜尋。
- 「圓山區」是固定區域，不進 schema；使用者說到其他地區時放入 `unresolved`。

## 4. API 契約

STT 與需求解析端點維持無狀態；它們不寫入音檔、逐字稿、需求與限制或搜尋歷史。帳號端點另使用 Database 保存帳號、sessions 與帳號資料。

### Auth endpoints

#### `POST /api/auth/register`

- Request：
  ```json
  {
    "username": "xuan",
    "password": "至少 12 字元",
    "nickname": "顯示名稱（可省略，預設等於 username）"
  }
  ```
- 成功 Response 201：
  ```json
  {
    "user": { "id": "user_id", "username": "xuan", "nickname": "xuan" },
    "session_token": "opaque_random_token",
    "expires_at": "2026-09-04T23:00:00+08:00"
  }
  ```
- username 已存在回傳 409；格式或 password 不合規回傳 400。訊息不回傳資料庫或雜湊細節。

#### `POST /api/auth/login`

- Request：`{ "username": "xuan", "password": "..." }`
- 成功 Response 200：格式同 register；client 將 `session_token` 放入 `sessionStorage`。
- username 或 password 不正確回傳 401 `{ "error": "invalid_credentials", "message": "帳號或密碼錯誤" }`，不透露是哪一欄錯誤。

#### `GET /api/auth/me`

- Request：`Authorization: Bearer <session_token>`。
- Response 200：目前帳號的 `id`、`username`、`nickname`、設定摘要。
- token 缺少、撤銷或逾時回傳 401；client 清除 `sessionStorage` 並回到匿名狀態。

#### `POST /api/auth/logout`

- Request：`Authorization: Bearer <session_token>`。
- 成功：撤銷目前 session token，回傳 204；client 同時清除 `sessionStorage`。

#### `POST /api/auth/change-password`

- Request：`Authorization: Bearer <session_token>` 與 `{ "current_password": "...", "new_password": "..." }`。
- 成功：驗證目前 password、保存新 hash、撤銷該帳號既有 sessions，回傳 204；client 回到登入畫面。
- password 不正確或格式不合規時回傳固定錯誤文案，不回傳供應商或雜湊細節。

忘記密碼不設 API。前端點擊按鈕後顯示 `SUPPORT_EMAIL`；支援流程不在 App 內自動驗證或重設。

### Auth logical data model

Database engine 尚未指定；以下是產品層級的 logical schema：

- `users`：`id`、normalized unique `username`、`password_hash`、`nickname`、`created_at`、`updated_at`。
- `auth_sessions`：`id`、`user_id`、`token_hash`、`created_at`、`expires_at`、`revoked_at`；只保存 token hash，不保存原始 token。
- `user_settings`：`user_id`、每月預算、已花費、生存模式、排除項目與偏好。
- `user_lists`／`user_list_items`：帳號的清單與候選紀錄 ID。
- `user_favorites`：`user_id` 與候選紀錄 ID。
- `reports`：共享的資料／體驗回報，可追溯提交者與候選紀錄。
- `teams`／`team_members`：共享揪團、加入代碼與成員關係。
- 不保存音檔、逐字稿、需求與限制或搜尋歷史；候選資料是否持久化依既有資料管線另行決定。

### `POST /api/transcribe`

- Request：`multipart/form-data`，欄位 `audio`（`MediaRecorder` 產出的 blob；Android Chrome 為 webm/opus，iOS Safari 為 mp4/aac）。辨識語言由伺服器固定為中文，不由請求決定。
- Response 200：`{ "transcript": "今天晚餐兩個人..." }`
- Response 400/502/503：`{ "error": "stt_failed", "message": "..." }`；逾時為 504 `{ "error": "timeout", "message": "逾時" }`。訊息為固定文案，不回傳供應商錯誤內容。
- 上限：音檔 30 秒；伺服器逾時 30 秒。

### `POST /api/parse`

- Request：
  ```json
  {
    "transcript": "改成三個人",
    "current": { ...需求與限制 或 null... }
  }
  ```
- Response 200：完整的需求與限制物件（見 §3），必須符合 JSON schema。
- Response 400/502/503：`{ "error": "parse_failed", "message": "..." }`；逾時為 504 `{ "error": "timeout", "message": "逾時" }`。訊息為固定文案。
- `current` 為 `null` 表示全新解析；非 `null` 表示修正語句，回傳物件只更新被提到的欄位。
- 「今天」以伺服器的 Asia/Taipei 日期解析；客戶端不送日期。
- 文字輸入 fallback 走同一端點，`transcript` 為使用者輸入的文字。
- 伺服器逾時 30 秒。

## 5. 語音辨識與解析規則

### 5.1 辨識

- 語言固定 zh-TW。
- 夾雜的英文品牌名與金額寫法（Costco、NT$300）必須原樣保留在逐字稿。
- 逐字稿不做任何清理或改寫再顯示；使用者看到的就是辨識結果。

### 5.2 解析：數字與單位正規化

| 逐字稿片段 | 欄位 | 值 |
|---|---|---|
| 兩個人 / 兩人 / 2 位 | `people_or_servings` | 2 |
| 三百 / 三百塊 / NT$300 / 300 元 | `budget_total_twd` | 300 |
| 二十分鐘內 | `max_minutes` | 20 |
| 兩公里內 | `max_distance_km` | 2 |
| 今天 | `date` | `today` |
| 這週末 | `date` / `time_window` | 下一個週六的 ISO 日期 / "週末" |
| 可以外帶 | `soft_preferences` | ["可外帶"] |
| 不用付費 / 免費 | `free_only` | true |
| 可以先登記 | `registration_ok` | true |

### 5.3 解析：修正語句（correction delta）

`current` 非 `null` 時，解析器以 `current` 為基礎，只改動語句提到的欄位。

| current | 修正語句 | 結果 |
|---|---|---|
| 人數 2、預算 300 | 「改成三個人」 | 人數 3；預算 300 不變 |
| 人數 2、預算 300 | 「預算改五百，其他一樣」 | 預算 500；人數 2 不變 |
| 預算 300 | 「預算不限」 | `budget_total_twd = null` |
| 偏好 ["可外帶"] | 「加上要有素食」 | 偏好 ["可外帶", "素食"] |

### 5.4 解析：不猜

- 沒提到的欄位回傳 `null`（或空陣列），不用常識補值。
- 聽到但對不上任何欄位的片語放進 `unresolved`，例如「靠近捷運站」（MVP 無此欄位）。
- 模糊金額如「便宜一點」不轉成數字；放進 `unresolved`。

## 6. 例外與 fallback

| 情況 | 使用者看到 | 下一步 |
|---|---|---|
| 麥克風權限被拒 | 「無法使用麥克風」 | 自動展開文字欄位 |
| 瀏覽器不支援 `MediaRecorder` | 「此瀏覽器不支援錄音」 | 自動展開文字欄位 |
| STT 失敗（第一次） | 「辨識失敗，再點一次麥克風重試」 | 使用者重錄 |
| STT 失敗（第二次） | 「辨識失敗，請改用文字」 | 自動展開文字欄位 |
| STT 或解析逾時 30 秒 | 「逾時，請改用文字」 | 自動展開文字欄位 |
| 逐字稿為空 | 「沒有聽到內容，再試一次」 | 留在目前畫面 |
| 解析失敗 | 「解析失敗」 | 展開文字欄位，逐字稿預填 |
| 解析結果缺 `need` | 「請說明你想找什麼」 | 搜尋按鈕停用 |

任何 fallback 都顯示原因，不顯示假成功。

## 7. 隱私

- 音檔由瀏覽器上傳到本服務伺服器，伺服器直接轉送 STT 供應商，不寫入磁碟、不記錄。
- 逐字稿視同 PRD NFR-05 的自然語言輸入原文：預設不保存。
- 需求與限制只存在瀏覽器記憶體與 `sessionStorage`；不保存到帳號資料庫。
- 已登入帳號的清單、收藏與設定保存到 Database；匿名使用者的相同資料只存在目前 `sessionStorage`。
- session token 只存在 `sessionStorage`，不使用 Cookie，不保存 username／password；token 逾時或登出時必須清除。
- `sessionStorage` token 可被同源 JavaScript 讀取，正式環境必須使用 HTTPS、嚴格 CSP、輸出編碼與最少化第三方 script，降低 XSS 竊取 token 的風險。
- 首頁揭露文字：「語音會傳送到第三方辨識服務進行辨識，不會被保存。」
- 忘記密碼只顯示 `SUPPORT_EMAIL`，支援人員不得要求使用者傳送明文 password。
- 零保留（zero-retention）合約列入 Phase 1，不在 MVP。

## 8. 設定

九個環境變數，值由團隊填入：

```text
STT_BASE_URL=
STT_API_KEY=
STT_MODEL=
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=
DATABASE_URL=
AUTH_SESSION_TTL_SECONDS=1800
SUPPORT_EMAIL=xuanweilin805@gmail.com
```

STT 供應商必須提供 OpenAI-compatible 的 `/audio/transcriptions` 端點；LLM 供應商必須提供 OpenAI-compatible 的 chat 端點並支援 JSON schema 結構化輸出。

## 9. 驗收條件

PRD §11 的 Case A、Case B 各增加語音版本，並新增以下案例：

- **Case V1：情境 A 語音版**
  - Given：說出「今天晚餐兩個人預算三百圓山區二十分鐘內可以外帶」。
  - Then：確認畫面顯示 need=晚餐、人數 2、預算 300、20 分鐘、今天、可外帶；點搜尋後結果與 Case A 相同。

- **Case V2：情境 B 語音版**
  - Given：說出「這週末圓山區有沒有不用付費的活動或公共資源可以先登記」。
  - Then：預算與人數顯示「無限制」，`free_only` 與 `registration_ok` 為 true，可直接搜尋。

- **Case V3：辨識錯誤用點擊修正**
  - Given：逐字稿把「三百」辨識成「三千」。
  - Then：使用者點預算欄位改成 300，其他欄位不變，搜尋使用 300。

- **Case V4：修正語句只改一個欄位**
  - Given：確認畫面人數 2、預算 300；說出「改成三個人」。
  - Then：人數變 3，預算與其他欄位不變。

- **Case V5：沒說預算**
  - Given：說出「圓山區今天晚餐」。
  - Then：預算顯示「無限制」，搜尋按鈕可用，搜尋時不套用預算限制。

- **Case V6：權限被拒**
  - Given：使用者拒絕麥克風權限。
  - Then：顯示原因並自動展開文字欄位；文字輸入走同一解析流程。

- **Case V7：逾時**
  - Given：STT 超過 30 秒未回應。
  - Then：顯示逾時並展開文字欄位；不無限等待。

- **Case V8：未解析內容**
  - Given：說出「晚餐兩個人靠近捷運站」。
  - Then：「靠近捷運站」出現在「聽到但不確定」，不進任何欄位。

- **Case A1：註冊**
  - Given：使用者輸入符合規則的 username、12 字元以上 password，可選 nickname。
  - Then：建立帳號、password 只以 hash 保存，回傳 30 分鐘 session token；username 與 password 不進 Cookie 或 `sessionStorage`。

- **Case A2：重複 username**
  - Given：使用者註冊已存在且不分大小寫相同的 username。
  - Then：回傳 409 與固定錯誤文案，不建立第二個帳號。

- **Case A3：登入與恢復**
  - Given：正確 username／password。
  - Then：登入成功後 token 存入 `sessionStorage`；同一分頁重新整理時呼叫 `/api/auth/me` 恢復登入。

- **Case A4：session 到期**
  - Given：session token 建立已超過 30 分鐘。
  - Then：任何受保護請求回傳 401，client 清除 token 並回到匿名狀態。

- **Case A5：登出**
  - Given：已登入使用者點擊登出。
  - Then：server 撤銷 session，client 清除 token，之後只能以匿名狀態使用。

- **Case A6：修改密碼**
  - Given：已登入使用者提供正確目前 password 與符合規則的新 password。
  - Then：保存新 hash、撤銷既有 sessions，使用者需要重新登入。

- **Case A7：忘記密碼**
  - Given：使用者點擊忘記密碼。
  - Then：只彈出 `SUPPORT_EMAIL`；不提供自動 reset，不要求使用者傳送明文 password。

- **Case A8：匿名資料遷移**
  - Given：匿名 session 有清單／收藏／設定，使用者註冊或登入帳號。
  - Then：資料合併到帳號、清單與收藏依 ID 去重、帳號原有設定優先；音檔、逐字稿、需求與限制不遷移。

## 10. 驗證

自動化檢查包含 `/api/parse` fixtures 與 Auth API 的註冊、登入、session expiry、登出、修改密碼、重複 username、錯誤遮罩與匿名資料遷移。錄音與 STT 由 Demo 排練驗證，不自動化。

Fixtures：

1. 情境 A 句子 → 6 個欄位值。
2. 情境 B 句子 → `free_only`、`registration_ok`、`target_categories`、預算 null。
3. 「圓山區今天晚餐」→ 預算與人數 null。
4. 修正語句「改成三個人」+ current → 只有人數改變。
5. 「晚餐兩個人靠近捷運站」→ `unresolved` 含「靠近捷運站」。
6. 「兩個人晚餐預算 NT$300 想去 Costco 附近」→ 預算 300，"Costco" 保留在 `unresolved` 或 `soft_preferences`，不遺失。
7. Auth fixtures：註冊、登入、30 分鐘 token expiry、登出、修改密碼、重複 username 與匿名資料合併。

## 11. 實作備註

- Stack：Bun、Hono、TypeScript、React（Vite）、Vercel AI SDK core。
- 單一 package：`src/server`（Hono，Auth 與語音 route）與 `src/client`（React）。開發時 Vite 將 `/api` 代理到 Hono；正式環境由 Hono 提供 `dist/`。
- 需求與限制的 JSON schema 用一份定義，同時給解析器的結構化輸出與前端型別。
- AI SDK 事實（2026-09-04 查閱）：`@ai-sdk/openai-compatible` 沒有 transcription model；語音辨識要用 `@ai-sdk/openai` 的 `createOpenAI({ baseURL, apiKey })` 搭配 `ai` 的 `transcribe()`。chat 端點用 `createOpenAICompatible({ baseURL, apiKey, supportsStructuredOutputs: true })` 搭配 `generateObject()`。
- 錄音使用瀏覽器原生 `MediaRecorder`；不引入錄音套件。
- 逐字稿與需求與限制一起存在 `sessionStorage`，重新整理後確認畫面仍完整。
- 登入 token 與語音工作階段資料分開保存；token key、匿名資料 migration 與受保護 API 的 `Authorization` header 必須明確定義。
- 30 秒上限在前端用計時器強制停止，後端再以請求逾時保護。
