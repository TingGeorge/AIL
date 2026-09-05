# ALL in life — 語音輸入規格（Voice Input Spec）

- 文件狀態：Hackathon MVP build spec
- 版本：v0.4（Gemini 原生音訊／結構化遷移）
- 日期：2026-09-05
- 上游文件：[PRD-all-in-life.md](./PRD-all-in-life.md)（FR-02、FR-03、FR-15、§7.1、§13）
- 詞彙：以 [CONTEXT.md](../CONTEXT.md) 為準

## 1. 摘要與範圍

使用者說出需求後，瀏覽器在錄音停止時立即將一份音訊送到 `POST /api/voice`。伺服器透過 **Gemini 原生 Interactions API 的一次請求**，直接取得 `{transcript, need}`；前端將逐字稿與結構化條件一起放進確認畫面，**使用者確認後才搜尋**。不是先 STT 再 parse，也不能收到語音逐字稿後自動呼叫 `/api/parse`。

文字輸入與手動條件是獨立可用入口。文字或逐字稿的主動重新解析、文字修正仍用 `POST /api/parse`；沒有 Gemini 設定也能手動填寫，不把 AI 可用性當成搜尋的先決條件（搜尋仍需 DB）。

語音輸入不是第三個 Agent。匿名仍可解析與搜尋，帳號只負責收藏、清單、設定及需要共享狀態的功能。官方契約與限制見 [2026-09-05 Gemini 查核](research/gemini-audio-structured.md)。

### 1.1 MVP 包含

- 原生 `MediaRecorder`，點一下開始、再點一下停止；最多 **30 秒（30,000 ms）**，停止後僅一次語音請求。
- server-side Gemini 音訊 → `{transcript,need}`，共享 Zod schema 驗證；音訊不另送 STT。
- 確認頁顯示逐字稿、可編輯 Need、未知限制與 `unresolved`；搜尋必須由使用者主動送出。
- 文字／逐字稿可重新編輯與解析；文字 correction 以目前 Need 為基礎，只修改提到的欄位。
- 保留設定中的預算預填、手動清空／修改及文字「預算不限」行為，不把預填誤稱為語音辨識所得。
- 取消、離開流程、輸入修訂的 stale-result 防護；麥克風拒絕、不支援、上傳／模型失敗時顯示原因與重試／手動入口。
- 可選 username/password 註冊、登入、登出、改密碼；帳號保存收藏、清單與設定，匿名設定保留在該分頁 `sessionStorage`。

### 1.2 MVP 不包含

- TTS、即時逐字稿串流、靜音自動停止、長按錄音或 Dashboard 語音指令。
- 多輪語音修正歷史；目前 correction 是文字 `/api/parse`，重新錄音是新需求，不暗中帶入舊 Need。
- 語言切換介面；prompt 要求繁體中文並保留品牌／數字／否定詞，沒有額外的 STT `language` 參數。
- 音訊轉碼或 ffmpeg；不把 WebM bytes 改名成 WAV，也不以 MIME 改名宣稱 codec 已轉換。
- 伺服器保存音檔、逐字稿、Need 或搜尋歷史；不承諾 Google 整體零保留。
- 自動追問或自動密碼重設；忘記密碼僅顯示設定好的支援聯絡方式。

## 2. 使用流程

### 2.1 三個畫面

**首頁**

- 保留既有簡單視覺與固定區域「圓山區」，匿名可用文字、語音與搜尋。
- `config.voice === true` 才顯示錄音按鈕；未設定或能力狀態取得失敗時保留文字／手動入口。
- 按鈕揭露：「最長 30 秒；停止後音訊會傳送給 Gemini 解析」。不寫「供應商不會保存」。
- 錄音時顯示秒數，停止後顯示「正在整理語音與條件…」。文字欄位可輸入／編輯逐字稿，錄音及語音請求期間避免同時編輯。
- 手動條件可直接進確認頁；`parse:false` 不要求模型解析才能繼續。

**確認畫面**

1. 同時顯示逐字稿與 Need；逐字稿是模型聽到的內容（server 僅 trim 首尾空白），不是已證實的事實。
2. 條件可直接編輯；回首頁編輯逐字稿後，須主動送出文字解析，沒有自動網路請求。
3. 未提供的數字／可空限制保持未知或無限制，不猜值；`unresolved` 逐項顯示。
4. 缺預算時可由生活設定預填本月剩餘預算，明示「預算來自設定」，可修改或清空；沒有可用設定就維持 null。
5. 已解析需求可用「一句話修正」送出 `{transcript: correction, current: need}`，返回完整 Need；「預算不限」不得再被預填覆蓋。
6. 單一確認搜尋動作；有需求文字或選擇類別後可搜尋。重錄、取消或返回不讓舊回應覆蓋新輸入。

**Dashboard**

- 顯示已確認條件，可返回條件頁放寬限制（FR-13）。AI 音訊／文字完成不是搜尋的授權，只有使用者點搜尋才發 `/api/search`。

### 2.2 狀態機

```text
idle
  ├─ mic（voice:true） ───────────────► recording
  ├─ 主動送出文字（parse:true） ──────► parsing       POST /api/parse, current:null
  └─ 手動条件 ───────────────────────► confirming
recording
  ├─ 手動停止 / 30,000 ms ────────────► voice         POST /api/voice 一次
  ├─ 權限／格式錯誤 ─────────────────► idle          原因 + 文字／手動入口
  └─ 取消／離開 ─────────────────────► idle          關閉 tracks，不上傳
voice
  ├─ 有效 {transcript,need} ──────────► confirming    不呼叫 /api/parse、不搜尋
  ├─ 空語音／格式錯誤／timeout ───────► idle          原因 + 重錄／文字／手動入口
  └─ 取消／輸入版本已變 ─────────────► idle          丟棄晚到結果
parsing
  ├─ 有效 Need ──────────────────────► confirming
  └─ 失敗／timeout ──────────────────► 保留原文字與條件，顯示重試／手動入口
confirming
  ├─ 直接編輯 Need ──────────────────► confirming
  ├─ 主動文字修正 ───────────────────► parsing       POST /api/parse, current:Need
  └─ 使用者點搜尋 ───────────────────► searching
```

取消使用 AbortSignal，並檢查輸入 revision／目前請求；即使 provider 在取消後才完成，也不得更新 transcript、Need 或導航。錄音停止有單次所有權，避免按鈕與 deadline 同時觸發兩次上傳。30 秒是前端 timer cap；背景分頁／裝置排程與實際錄音長度仍需真機驗收。

### 2.3 Demo 情境對應

- **情境 A**：「今天晚餐兩個人預算三百圓山區二十分鐘內可以外帶」→ 人工確認晚餐／2 人／NT$300／20 分鐘／今天／可外帶 → 搜尋。
- **情境 B**：「這週末圓山區有沒有不用付費的活動或公共資源可以先登記」→ `free_only=true`、`registration_ok=true`，類別含免費公益與活動；未提的預算由模型回 null，若 UI 套用設定預填則明示，人工確認後搜尋。

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
- 登入後以帳號資料為準，不合併匿名工作階段的資料；匿名使用者沒有清單與收藏。

## 3. 需求與限制 schema

唯一實作定義是 `prototype-v1/src/shared/need.ts` 的 `needSchema`／`Need`；語音 wrapper 在 `prototype-v1/src/shared/voice.ts` 匯出 `voiceResultSchema`／`VoiceResult`。音訊結果是 `{transcript:string, need:Need}`，文字解析及搜尋沿用同一份 Need，不另造同名異義欄位。

```text
need                 string          必有 key，可空字串。生活需求，例如「晚餐」
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
exclude_tags         string[]        不吃／不要的項目，例如 ["牛"]；預設 []
unresolved           string[]        聽到但無法對應欄位的片語；顯示給使用者，不猜
```

規則：

- 可空限制的 null 表示未指定，不等於數字 0；布林／陣列保持各自語意，軟偏好不當成硬限制。
- 搜尋至少有非空 `need` 或一個 `target_categories`，支援只選類別的手動搜尋；Need 仍須通過 schema。
- 字串、數值、陣列有長度／範圍上限；日期除 YYYY-MM-DD 格式外，server Zod 還會驗證真實日曆日期。模型 JSON Schema 不能取代這層驗證。
- `target_categories` 只影響 Dashboard 的排序與強調；五類仍全部搜尋。
- 「圓山區」是固定區域，不進 schema；使用者說到其他地區時放入 `unresolved`。

## 4. API 契約

`/api/voice` 與 `/api/parse` 是無狀態請求；不寫入音檔、逐字稿、Need 或搜尋歷史。帳號端點另存帳號、sessions 與帳號資料。所有 `/api/*` 使用 `Cache-Control: no-store`。

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
    "expires_at": "2026-09-04T23:00:00+08:00",
    "data": { "list": [], "favs": [], "settings": {}, "profile": {} }
  }
  ```
- username 已存在回傳 409；格式或 password 不合規回傳 400。訊息不回傳資料庫或雜湊細節。

#### `POST /api/auth/login`

- Request：`{ "username": "xuan", "password": "..." }`
- 成功 Response 200：格式同 register；client 將 `session_token` 放入 `sessionStorage`。
- username 或 password 不正確回傳 401 `{ "error": "invalid_credentials", "message": "帳號或密碼錯誤" }`，不透露是哪一欄錯誤。

#### `GET /api/auth/me`

- Request：`Authorization: Bearer <session_token>`。
- Response 200：`{ "user": { id, username, nickname }, "data": { list, favs, settings, profile } }`；前端以此一次還原帳號狀態。
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

Database 為本機 PostgreSQL；完整 schema 與其餘 API（搜尋、帳號資料、回報）見 [SPEC-backend.md](./SPEC-backend.md)。Auth 相關 table：

- `users`：`id`、normalized unique `username`、`password_hash`、`nickname`、`created_at`、`updated_at`。
- `auth_sessions`：`id`、`user_id`、`token_hash`、`created_at`、`expires_at`、`revoked_at`；只保存 token hash，不保存原始 token。
- `account_data`：每個帳號一列，`list`、`favs`、`settings`（每月預算、已花費、已花費所屬月份、生存模式、排除項目、偏好、是否有 Costco 會員）、`profile`。
- 不保存音檔、逐字稿、需求與限制、搜尋歷史或使用者位置。

### `GET /api/config`

```json
{"database":false,"parse":false,"voice":false,"ranking":false,"support_email":null,"area":"圓山區"}
```

上述是無設定範例。`voice` 取代舊的 `transcribe` 旗標；`parse`／`voice`／`ranking` 均依 Gemini key 與 model 設定決定，不是遠端連線、權限或模型健康保證。無 key 可手動填寫；搜尋／帳號需 DB。

### `POST /api/voice`

- Request：`multipart/form-data`，**恰好一份 `audio` File**，不接受文字 field、重複檔案、額外欄位。瀏覽器自行產生 multipart boundary，不手動指定整個 request 的 Content-Type。
- File MIME 與 bytes 必須相符，filename 依真實容器副檔名產生。支援 canonical MIME：`audio/webm`、`audio/m4a`、`audio/ogg`、`audio/wav`、`audio/mpeg`、`audio/aac`、`audio/flac`、`audio/aiff`。
- server 去除 `;codecs=…` 等參數後驗證 MIME essence；alias：`audio/mp4`／`audio/x-m4a` → `audio/m4a`，`audio/x-wav`／`audio/wave` → `audio/wav`，`audio/mp3` → `audio/mpeg`，`audio/x-aiff` → `audio/aiff`。前端 Safari MP4 用 `.m4a`；此為容器標示正規化，沒有轉碼。
- 上限：前端錄音 **30 秒**、檔案 **5 MiB（5,242,880 bytes）**、整個 multipart **6 MiB（6,291,456 bytes）**；模型呼叫 timeout 30 秒。後端不解碼或驗證音檔實際時長。
- `readVoiceUpload` 用 busboy 保留 part 宣告的 Content-Type，不以 filename 推斷。原因是 Bun 1.4 已重現原生 `Request.formData()` 的 filename-derived MIME 改寫；仍須核對基本 magic header，宣告 MIME 不是信任憑證。處理只在記憶體，不落地磁碟。
- Response 200：`{ "transcript": "…", "need": Need }`，由共享 `voiceResultSchema` 驗證；空白逐字稿不是成功。一次 Gemini 呼叫同時產生兩欄，不另行解析文字。
- server 以 Asia/Taipei 當日日期提供 `today`；語音的 `current` 固定 null。前端不傳 client date 或 correction context。

| HTTP | error | 條件 |
|---|---|---|
| 400 | `voice_failed` | 缺少／空檔、錯誤 multipart、重複或額外欄位 |
| 413 | `too_large` | 檔案超過 5 MiB 或請求超過 6 MiB |
| 415 | `unsupported_audio` | MIME 不在清單，或 bytes 不符基本檔頭 |
| 422 | `no_speech` | 模型回傳無可辨識語音 |
| 502 | `voice_failed` | Gemini 失敗、非 completed、錯誤／缺失輸出或 JSON／Zod 驗證失敗 |
| 503 | `voice_failed` | Gemini 未設定 |
| 504 | `timeout` | 語音處理逾時 |

錯誤皆 `{error,message}` 固定文案，不回傳 key、provider body 或錄音；多個錯誤同時存在時依 middleware／route 檢查順序回應。

### `POST /api/parse`

- Request：JSON `{ "transcript": "改成三個人", "current": Need或null }`；`transcript` 1–2000 字元，整體 request 最大 32 KiB。省略 `current` 預設 null。
- Response 200：完整 Need（不是 VoiceResult），同一份 Zod 驗證。
- `current:null` 是全新文字／逐字稿解析；非 null 是文字 correction，只更新提到的欄位，其餘保留。
- 使用者主動提交文字、編輯後重新解析或送出 correction 時才使用；**不得在 `/api/voice` 後自動串接**。
- `today` 由 server 以 Asia/Taipei 決定，不由 client 指定；模型 timeout 30 秒。
- 400／502／503：`{error:"parse_failed",message:"…"}`；413 為 `too_large`，504 為 `timeout`。保留文字與原 Need，讓使用者重試或手動修正。

## 5. 語音辨識與解析規則

### 5.1 辨識

- prompt 要求繁體中文逐字稿與 Need；不是額外的 `language: zh-TW` API 設定。
- 夾雜的英文品牌名與金額寫法（Costco、NT$300）必須原樣保留在逐字稿。
- 不潤飾或補造逐字稿；server 只 trim 首尾空白。語音結果與 Need 都需要使用者核對。

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

| 情況 | 行為 |
|---|---|
| `voice:false`／能力狀態未知 | 不顯示可用的錄音入口，保留文字／手動條件；`parse:false` 不阻擋手動流程 |
| 權限被拒／非安全環境／無 MediaRecorder | 顯示原因，可直接改文字；停止已取得的 microphone tracks |
| 不支援的 recorder MIME／空音訊 | 顯示重錄或文字／手動入口，不改名假冒可支援格式 |
| 400／413／415 | 說明上傳問題，可重錄；不盲目自動重試或轉成 STT |
| 422 無語音 | 不建立假 Need，顯示重錄或文字入口 |
| 音訊／文字解析失敗或 30 秒 timeout | 保留已有文字及條件，顯示錯誤與重試／手動入口 |
| 取消／離開／新輸入使舊回應過期 | 不套用回應、不導航、不自動搜尋 |
| 沒有需求或類別 | 提示填需求或選類別，不開始搜尋 |

不以「連續兩次失敗」作為開放手動輸入的門檻；任何失敗皆可立即手動繼續。取消 HTTP 不保證已送到 Gemini 的工作會停止或不計費。

## 7. 隱私

- 音訊經本服務傳往 Gemini；上傳與 base64 只在 server 記憶體，不落地音檔、不把內容寫入 DB 或 log。
- 逐字稿與 Need 草稿只在 React 記憶體；沒有把它們存入 `sessionStorage` 的恢復契約，重新整理會失去草稿。
- Gemini 請求設 `store:false`，不使用 previous interaction、背景工作或 Files API；**不等於整體零保留／不用於訓練／無濫用防護日誌**。部署者需依付費狀態、地區與 Google 當期条款查核，不能對使用者承諾供應商「不會保存」。
- 首頁短文案為「停止後音訊會傳送給 Gemini 解析」。不要提交不必要的個資／敏感內容。
- 已登入帳號的清單、收藏、設定存 DB；匿名只有設定，在目前 `sessionStorage`。token 亦存該分頁 `sessionStorage`，不用 Cookie，不保存 username/password；逾時或登出清除。
- 同源 JavaScript 可讀 token；正式部署仍需 HTTPS、CSP、輸出編碼與最少第三方 script。API no-store 不等同供應商 retention 設定。
- 忘記密碼只顯示已設定的 `SUPPORT_EMAIL`，不得索取明文 password；未設定不假造信箱。零保留合約不是本 MVP 已完成能力。

## 8. 設定

以下為欄位範例，空值代表尚未設定；key 只放 server，不使用 `VITE_` 前綴，不提交秘密：

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=
DATABASE_URL=postgres://localhost/ail
SUPPORT_EMAIL=
PORT=3000
```

- `GEMINI_MODEL` 由部署者選擇帳號可用、支援音訊及結構化輸出的 `gemini-*` ID；無預設，建議用官方範例的 bare model name。設定存在不代表 provider 健康。
- 語音、文字解析及分組排序共用 `GEMINI_API_KEY`／`GEMINI_MODEL`，使用固定 `POST https://generativelanguage.googleapis.com/v1beta/interactions`，`x-goog-api-key` header、JSON `response_format` 與 `store:false`。不提供自訂 AI base URL 或 OpenAI adapter。
- Session 固定 1,800 秒（30 分鐘），不是可調的 env 參數。更多資料匯入／部署設定見根目錄 README。

## 9. 驗收條件

PRD §11 的 Case A、Case B 各增加語音版本，並新增以下案例：

- **Case V1：情境 A 語音版**
  - Given：說出「今天晚餐兩個人預算三百圓山區二十分鐘內可以外帶」。
  - Then：確認畫面顯示 need=晚餐、人數 2、預算 300、20 分鐘、今天、可外帶；點搜尋後結果與 Case A 相同。

- **Case V2：情境 B 語音版**
  - Given：說出「這週末圓山區有沒有不用付費的活動或公共資源可以先登記」。
  - Then：模型未提的預算與人數為 null，`free_only` 與 `registration_ok` 為 true；若有設定預填明示來源，人工確認後搜尋。

- **Case V3：辨識錯誤用點擊修正**
  - Given：逐字稿把「三百」辨識成「三千」。
  - Then：使用者點預算欄位改成 300，其他欄位不變，搜尋使用 300。

- **Case V4：修正語句只改一個欄位**
  - Given：確認畫面人數 2、預算 300；在文字 correction 輸入「改成三個人」。
  - Then：人數變 3，預算與其他欄位不變。

- **Case V5：沒說預算**
  - Given：說出「圓山區今天晚餐」。
  - Then：模型回預算 null；沒有設定預算時顯示無限制，有設定則預填並標示來源。手動清空或 correction「預算不限」後維持 null，不再次預填。

- **Case V6：權限被拒**
  - Given：使用者拒絕麥克風權限。
  - Then：顯示原因並保留文字／手動入口；主動文字解析才走 `/api/parse`。

- **Case V7：逾時**
  - Given：Gemini 語音請求超過 30 秒未回應。
  - Then：顯示逾時與文字／手動入口；不無限等待或自動重送音訊。

- **Case V8：未解析內容**
  - Given：說出「晚餐兩個人靠近捷運站」。
  - Then：「靠近捷運站」出現在「聽到但不確定」，不進任何欄位。

- **Case V9：一次語音請求與人工確認**
  - Given：錄音停止，模擬有效 `{transcript,need}`。
  - Then：只發一次 `/api/voice`；沒有 `/api/parse`／`/api/search`，逐字稿及 Need 一起進確認頁。

- **Case V10：MIME、大小與中止**
  - Given：WebM／OGG／Safari MP4、偽造 MIME、空檔、超限、取消或舊回應。
  - Then：正確格式保留 bytes／副檔名；`audio/mp4` canonicalize 為 M4A。錯誤回應可手動繼續；過期回應不覆蓋目前資料。

- **Case V11：30 秒而非 30 毫秒**
  - Given：錄音 timer 啟動。
  - Then：排程 delay 是 `MAX_SECONDS * 1000 = 30000`，停止按鈕與 deadline 同時抵達仍只上傳一次；停止後關閉 tracks。

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

- **Case A8：匿名不合併**
  - Given：匿名 session 改過設定，使用者註冊或登入帳號。
  - Then：帳號資料取代目前工作階段的設定；匿名沒有清單／收藏可遷移；音檔、逐字稿、需求與限制不遷移。

## 10. 驗證

隔離測試可用 mocked fetch／錄音器與純函式，檢查 client FormData、MIME／副檔名、錯誤、schema、review／stale 防護及 30,000 ms timer；server 可驗證 multipart metadata／大小／檔頭與 Gemini request／response contract，不需真實 DB 或 key。這些不證明真機 codec、音訊辨識品質或 live Interactions 相容性。

保留 `/api/parse` 語意 fixtures 與 Auth API 測試；DB 測試只用獨立資料庫，live-provider 測試需明確啟用。**2026-09-05 最新結果：151 pass / 28 skip / 0 fail，942 assertions**；typecheck 與 build 通過，fixture suite 未觸及真實 DB。另以實際 `gemini-3.5-flash-lite` 通過文字解析與約 5 秒合成中文 WebM，一次取得逐字稿／Need；UI 確認→真實 catalog 搜尋→AI 排序也通過。未操作使用者麥克風；其他 codec、噪音／口音及廣泛語意品質仍待驗收。

Fixtures：

1. 情境 A 句子 → 6 個欄位值。
2. 情境 B 句子 → `free_only`、`registration_ok`、`target_categories`、預算 null。
3. 「圓山區今天晚餐」→ 預算與人數 null。
4. 修正語句「改成三個人」+ current → 只有人數改變。
5. 「晚餐兩個人靠近捷運站」→ `unresolved` 含「靠近捷運站」。
6. 「兩個人晚餐預算 NT$300 想去 Costco 附近」→ 預算 300，"Costco" 保留在 `unresolved` 或 `soft_preferences`，不遺失。
7. Auth fixtures：註冊、登入、30 分鐘 token expiry、登出、修改密碼與重複 username。

## 11. 實作備註

- Stack：Bun、Hono、TypeScript、React／Vite、Zod；native `fetch` 呼叫 Gemini。multipart metadata 使用 busboy，沒有 AI SDK adapter 或額外 STT。
- 單一 `prototype-v1` package；開發由 Vite proxy `/api` 到 Hono，正式由 Hono 提供 `dist/`。
- `gemini.ts` 共用結構化呼叫：`z.toJSONSchema`（移除 `$schema` 與 provider 未明列的 default／pattern／字串長度 keywords；原始 Zod 驗證保留）→ `response_format` → completed Interaction 的 `model_output` 文字 → JSON.parse → 原始 Zod schema.parse。模型 schema 的支援子集與 runtime-only refinement 見查核紀錄。
- 原生 `MediaRecorder` 使用實際 `mimeType`（必要時從 chunk 取得）；未知格式直接顯示錯誤，不預設把未知 bytes 當 WebM。停止／取消必須釋放 microphone tracks。
- timer helper 使用 `MAX_SECONDS * 1000`；30 秒錄音、30 秒模型 timeout 與大小檢查各自獨立，不能互相替代。
- 語音完成只更新逐字稿、Need 與 review 狀態；abort／revision 防止舊結果覆蓋，保留手動表單及預算語意。
- token key 為 `ail.token`，受保護 API 使用 Bearer；語音／Need 草稿不進帳號資料或 `sessionStorage`。
