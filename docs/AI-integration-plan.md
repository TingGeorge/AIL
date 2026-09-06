# ALL IN LIFE AI 串接執行計畫

## 目前實作狀態（2026-09-06）

- `POST /api/v1/search/parse` 與 `POST /api/v1/results/explain` 已實作並接入主流程。
- Responses API client、strict JSON Schema、timeout／單次 retry、request id、`store: false`、D1 原子限流與固定規則 fallback 均已有單元／契約測試。
- 模型由 server-side `OPENAI_MODEL` 決定，預設 `gpt-5.6-luna`；官方模型頁確認該模型支援 Responses API 與 Structured Outputs：[GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)。
- Demo 不呼叫模型；缺少 API key、D1 限流不可用、逾時、429／5xx 或 schema 不合法時，使用者仍可用手動條件與確定性 CP 規則完成流程。
- 尚未完成的是 30–50 組真實繁中需求的正式 eval、production 帳號 migration 後的重新部署，以及實際流量成本／延遲監控。

## 目標與邊界

AI 第一階段只做兩件事：

1. 把使用者的自然語言需求轉成可編輯的 `SearchConstraints`。
2. 把規則引擎已確認的候選事實，改寫成容易理解的推薦理由。

AI 不產生店名、價格、距離、營業時間、庫存、免費資格或 CP 分數，也不能繞過硬排除。這些欄位必須來自 catalog、Evidence Gate 與確定性程式碼。

```text
PWA
  → POST /api/v1/search/parse
  → 後端呼叫 OpenAI Responses API
  → 回傳結構化條件與待確認欄位
  → 使用者確認
  → catalog / hard filter / CP engine
  → POST /api/v1/results/explain（第二階段）
```

## API Key 與環境設定

`OPENAI_API_KEY` 只能由伺服器讀取。不可放進 React 元件、`NEXT_PUBLIC_*`、瀏覽器儲存空間、Git 或回應內容。OpenAI 官方也要求 API key 保持私密並由伺服器環境或金鑰管理服務載入：[API authentication](https://developers.openai.com/api/reference/overview#authentication)。

本機：

```dotenv
# mvp/.dev.vars（已被 .gitignore 排除）
OPENAI_API_KEY=由開發者在本機填入
OPENAI_MODEL=gpt-5.6-luna
```

正式 OpenAI Sites 環境：到網站的「更多動作 → 設定 → 環境變數」新增
`OPENAI_API_KEY`（開啟「秘密」）及 `OPENAI_MODEL=gpt-5.6-luna`
（不需開啟「秘密」），然後重新部署已核准版本。直接使用 Responses API
不需要 Agent ID。

禁止建立帶有真實值的 `.env.example`。範例文件只列變數名稱。

## Endpoint 1：需求解析

`POST /api/v1/search/parse`

Request：

```json
{
  "query": "今晚兩個人想在圓山附近吃便宜一點，不要堅果，最好安靜",
  "locale": "zh-TW",
  "timezone": "Asia/Taipei",
  "defaults": {
    "date": "2026-09-05",
    "time": "19:00",
    "partySize": 2,
    "maxDistanceM": 2000
  }
}
```

Response：

```json
{
  "constraints": {
    "query": "今晚兩個人想在圓山附近吃便宜一點，不要堅果，最好安靜",
    "date": "2026-09-05",
    "time": "19:00",
    "category": "FOOD",
    "budgetTwd": null,
    "partySize": 2,
    "maxDistanceM": 2000,
    "hardExclusions": ["堅果"],
    "softPreferences": ["安靜"],
    "mobility": ["WALK"]
  },
  "assumptions": ["『今晚』依 Asia/Taipei 解析"],
  "missingFields": ["budgetTwd"],
  "confidence": 0.9
}
```

規則：

- 使用 Responses API 的 strict JSON Schema structured output，拒絕模型自由輸出另一種形狀。Responses API 支援 JSON Schema 格式與自訂工具：[Responses API create](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)。
- 將 `store` 設為 `false`，不建立之後可透過 API 擷取的 stored response；資料處理與保留仍以 OpenAI 適用政策為準。
- 不傳 GPS 座標、姓名、帳號、清單歷史或交易明細給模型。
- 相對時間一定與 `timezone`、伺服器提供的目前日期一起解析，不讓模型自行猜系統日期。
- 模型輸出的每個數值仍要在伺服器做範圍驗證；錯誤時回退現有表單值。

## Endpoint 2：推薦理由

`POST /api/v1/results/explain`

瀏覽器只傳 1–3 個候選 ID 與原搜尋條件；不可提交價格、距離、時段或驗證狀態。伺服器用相同條件重新查詢 D1／catalog，依 ID 原順序建立可信事實，且搜尋座標不得送給模型：

```json
{
  "locale": "zh-TW",
  "candidateIds": ["candidate-id"],
  "search": {
    "category": "ALL",
    "origin": { "latitude": 25.07133, "longitude": 121.52024 },
    "radiusM": 2000,
    "at": "2026-09-06T19:00:00+08:00",
    "eventWindowDays": 7,
    "freeOnly": false,
    "hardExclusions": ["堅果"],
    "softPreferences": ["安靜"]
  }
}
```

只有來源驗證欄位包含 `schedule`，且開始與結束時間皆為有效 RFC3339，時段才能成為模型事實。模型只能依原順序回傳 allowlist `reasonCodes`；伺服器驗證代碼確實有 catalog 事實支持後，才用固定繁體中文模板組成前端回應：

```json
{
  "items": [
    {
      "id": "candidate-id",
      "headline": "兩人預算內、步行距離短",
      "reasons": ["符合安靜偏好", "距離約 750 公尺"],
      "caution": "價格仍需到店前確認"
    }
  ]
}
```

模型不得新增輸入中沒有的事實。排序、CP 分數與是否合格由既有 deterministic code 決定；模型只能選擇說明角度。過敏原等安全條件不能由「沒有命中標籤」推論成「不含過敏原」，仍須向現場確認。前端只顯示整理後的結論與依據，不要求或顯示模型內部思考鏈。

## 後端實作狀態

| 狀態 | 檔案                                      | 工作                                                                       |
| ---- | ----------------------------------------- | -------------------------------------------------------------------------- |
| 完成 | `mvp/lib/ai-contract.ts`                  | 定義 request、response、JSON Schema 與伺服器驗證                           |
| 完成 | `mvp/lib/openai-server.ts`、`openai-core.ts` | 封裝 Responses API、timeout、retry、錯誤正規化、request id 與 `store: false` |
| 完成 | `mvp/app/api/v1/search/parse/route.ts`    | 需求解析 endpoint；只在伺服器讀 key                                        |
| 完成 | `mvp/app/page.tsx`                        | 顯示 AI 整理狀態並把回傳欄位帶到可編輯確認；使用者仍須確認                  |
| 完成 | `mvp/app/api/v1/results/explain/route.ts` | 只依伺服器重查事實產生推薦理由，不改動分數與資格                           |
| 完成 | `mvp/tests/ai-*.test.mjs`                 | contract、prompt injection、timeout、429、壞 JSON、無 key 與 fallback 測試 |

第一版可直接用伺服器端 `fetch` 呼叫 `https://api.openai.com/v1/responses`，避免先增加 runtime dependency；若後續採官方 SDK，再固定版本並重跑 Cloudflare build smoke test。

## 可靠性與資安守門

- Timeout：8 秒；逾時立即回到現有手動條件流程。
- Retry：只對 429 與 5xx 做一次帶 jitter 的重試；4xx schema／權限錯誤不重試。
- Rate limit：以 D1 原子計數對匿名 session 與雜湊後的 IP 限制每分鐘最多 10 次；D1 無法檢查時停止呼叫上游並回退手動流程。
- Request body：`query` 最多 500 字；拒絕空白、超長與不合法 JSON。
- Privacy：log 不記原始需求、GPS、姓名或 API key，只記狀態、延遲、token usage、內部 trace id。
- Trace：保存 OpenAI `x-request-id`；同時送出自有 `X-Client-Request-Id`，方便追查失敗請求。官方建議記錄 request id 以利除錯：[Request IDs](https://developers.openai.com/api/reference/overview#request-ids)。
- Prompt injection：需求文字只視為資料；developer instructions 明定不得執行使用者要求的工具、網路或規則變更。
- Fallback：缺 key、模型失敗、schema 驗證失敗或額度耗盡時，回 `AI_UNAVAILABLE`，保留原文與目前欄位，不能阻止使用者繼續。

## 建議 Responses API 設定

```ts
{
  model: env.OPENAI_MODEL,
  store: false,
  max_output_tokens: 500,
  instructions: parserInstructions,
  input: [
    { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(sanitizedInput) }] }
  ],
  text: {
    format: {
      type: 'json_schema',
      name: 'search_constraints',
      strict: true,
      schema: searchConstraintsSchema
    }
  }
}
```

模型名稱不寫死在前端或版本庫；先用 30–50 組繁體中文真實需求比較正確率、延遲與成本，再由環境變數選定。

## 驗收標準

- API key 不出現在 client bundle、Network response、log 或 Git。
- 30 組中文需求中，日期、人數、硬排除、距離四項的欄位正確率至少 95%。
- 模糊預算不得自行補數字，必須列入 `missingFields`。
- 模型不可把硬排除改成偏好，也不可把未知價格解讀成免費。
- 無 key、timeout、429、壞 schema 時，STEP 1 仍能手動前往 STEP 2。
- 所有推薦理由都能逐項對回傳入的候選事實；刪除該事實後，理由不得仍然出現。

## 後續優化順序

1. 用 30–50 組繁體中文真實需求建立可重跑 eval，分別量測日期、人數、硬排除、距離、missing field 與 prompt injection。
2. 在 production D1 套用目前 migration 後，重新驗證 rate limit、匿名與登入兩條 AI 路徑。
3. 只記錄狀態、延遲、token usage 與 request id，建立成本／錯誤率告警；不記錄原始需求、GPS、姓名或 API key。
4. 模型或 provider 要更換時先跑同一份 eval；搜尋、硬限制、Evidence Gate 與 CP engine 不隨模型一起改寫。
