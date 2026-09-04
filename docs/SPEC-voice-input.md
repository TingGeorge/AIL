# ALL in life — 語音輸入規格（Voice Input Spec）

- 文件狀態：Hackathon MVP build spec
- 版本：v0.1
- 日期：2026-09-04
- 上游文件：[PRD-all-in-life.md](./PRD-all-in-life.md)（FR-02、FR-03、§7.1、§13）
- 詞彙：以 [CONTEXT.md](../CONTEXT.md) 為準

## 1. 摘要與範圍

使用者用說的告訴系統需求與限制，例如「今天晚餐兩個人預算三百圓山區二十分鐘內可以外帶」。系統把語音轉成逐字稿，再由需求解析轉成結構化的需求與限制，顯示在確認畫面讓使用者修正後才送出搜尋。使用者不需要自己填品類、預算、人數等欄位。

語音輸入是 MVP 的**主要入口**；文字輸入是 fallback；結構化表單只作為確認畫面的可編輯呈現，不再是獨立入口。

語音輸入**不是第三個 Agent**。它只是需求解析的一個輸入管道；PRD §7.2「不另造第三個 Agent」維持不變。

### 1.1 MVP 包含

- 首頁錄音按鈕：點一下開始、再點一下結束，上限 30 秒。
- 伺服器端語音辨識（STT）與需求解析，兩者都走 OpenAI-compatible API。
- 確認畫面：逐字稿、解析欄位、未提供的硬限制、未解析內容。
- 兩種修正方式：點欄位編輯，或再按麥克風說修正語句。
- Dashboard 頂部的需求與限制 chip row，點擊回到同一個確認畫面（涵蓋 FR-13 放寬限制）。
- 文字輸入 fallback，與語音共用同一個解析端點。

### 1.2 MVP 不包含

- 語音回讀（TTS）。
- 即時逐字稿串流、靜音自動停止、長按錄音。
- 語言切換；辨識語言固定 zh-TW。
- Dashboard 卡片上的語音指令。
- 保存音檔、逐字稿或需求與限制到伺服器。
- 多輪對話式追問；缺欄位一律在確認畫面用「無限制」呈現。

## 2. 使用流程

### 2.1 三個畫面

**首頁**

- 區域標籤「圓山區」。
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

伺服器無狀態。兩個端點都不寫入磁碟、不記錄音檔或逐字稿。

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
- 需求與限制只存在瀏覽器記憶體與 `sessionStorage`；不產生 session ID。
- 首頁揭露文字：「語音會傳送到第三方辨識服務進行辨識，不會被保存。」
- 零保留（zero-retention）合約列入 Phase 1，不在 MVP。

## 8. 設定

六個環境變數，值由團隊填入，本文件留白：

```text
STT_BASE_URL=
STT_API_KEY=
STT_MODEL=
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=
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

## 10. 驗證

唯一的自動化檢查：一個 `bun test` 檔案，對已設定供應商的 `/api/parse` 送固定逐字稿並斷言回傳物件。錄音與 STT 由 Demo 排練驗證，不自動化。

Fixtures：

1. 情境 A 句子 → 6 個欄位值。
2. 情境 B 句子 → `free_only`、`registration_ok`、`target_categories`、預算 null。
3. 「圓山區今天晚餐」→ 預算與人數 null。
4. 修正語句「改成三個人」+ current → 只有人數改變。
5. 「晚餐兩個人靠近捷運站」→ `unresolved` 含「靠近捷運站」。
6. 「兩個人晚餐預算 NT$300 想去 Costco 附近」→ 預算 300，"Costco" 保留在 `unresolved` 或 `soft_preferences`，不遺失。

## 11. 實作備註

- Stack：Bun、Hono、TypeScript、React（Vite）、Vercel AI SDK core。
- 單一 package：`src/server`（Hono，兩個 route）與 `src/client`（React）。開發時 Vite 將 `/api` 代理到 Hono；正式環境由 Hono 提供 `dist/`。
- 需求與限制的 JSON schema 用一份定義，同時給解析器的結構化輸出與前端型別。
- AI SDK 事實（2026-09-04 查閱）：`@ai-sdk/openai-compatible` 沒有 transcription model；語音辨識要用 `@ai-sdk/openai` 的 `createOpenAI({ baseURL, apiKey })` 搭配 `ai` 的 `transcribe()`。chat 端點用 `createOpenAICompatible({ baseURL, apiKey, supportsStructuredOutputs: true })` 搭配 `generateObject()`。
- 錄音使用瀏覽器原生 `MediaRecorder`；不引入錄音套件。
- 逐字稿與需求與限制一起存在 `sessionStorage`，重新整理後確認畫面仍完整。
- 30 秒上限在前端用計時器強制停止，後端再以請求逾時保護。
