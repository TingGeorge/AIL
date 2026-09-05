# Gemini 音訊 → 結構化需求：契約查核

查核日期：**2026-09-05（Asia/Taipei）**。範圍：原生 Interactions provider、音訊／文字／排序、共享 schema，以及當日晚間有限樣本 live-key smoke。

## 結論與立即決策

**未發現需要阻擋合併的 endpoint／request／response envelope 差異。** 以下三項均由 [Interactions primary API reference][api] 明確支援：

| 項目 | 已核對契約 |
|---|---|
| REST | `POST https://generativelanguage.googleapis.com/v1beta/interactions`；JSON body、`x-goog-api-key` |
| 原生音訊 | `input` 可使用 content array；音訊為 `{type:"audio", data:"<base64>", mime_type:"audio/webm"}`，可與 text content 一同輸入 |
| 結構化回應格式 | `response_format: {type:"text", mime_type:"application/json", schema: <JSON Schema>}`，API reference 的 `TextResponseFormat` |
| 回傳 envelope | `status`、`steps`；`type:"model_output"` 的 step 內含 `content`，文字 block 為 `{type:"text", text:"..."}` |

[Audio guide][audio] 的部分 transcription 範例仍把裸 JSON Schema 直接放進 `response_format`，與 primary reference／[structured-output guide][structured] 的 typed wrapper 不一致。**以 primary reference 的 wrapper 為準，不改回裸 schema，也不改回舊 `outputs` parser。**

## 精確 provider contract

目前 `/Users/apple/Desktop/AIL/prototype-v1/src/server/gemini.ts` 發送：

```js
{
  model: "<configured Gemini model ID>",
  system_instruction: "<task instruction>",
  input: [
    { type: "text", text: JSON.stringify({ today: "YYYY-MM-DD", current: null }) },
    { type: "audio", data: "<base64 audio bytes>", mime_type: "audio/webm" }
  ],
  response_format: {
    type: "text",
    mime_type: "application/json",
    schema: /* exported VoiceResult JSON Schema */ {}
  },
  generation_config: { max_output_tokens: 8192 },
  stream: false,
  background: false,
  store: false
}
```

上述欄位由 [API reference][api] 定義；音訊、模型設定與 task instruction 是本應用的取值。語音只發送一次模型請求；期待 JSON `{transcript:string, need:Need}`。文字解析／修正改用 text input 與 Need schema，不另走音訊或 STT。

本應用只接受 `status:"completed"`、無 errors、恰好一個非空 `model_output`，且該 step 全部 content 都是 text；拼接後 `JSON.parse` 再用原始 Zod schema 驗證。**「恰好一個 model_output」是本應用的保守限制，不是 API 對所有互動的通用保證**；thought／tool／partial output 不當作 Need。timeout 30 秒並合併 caller cancellation；當日晚間已以 `gemini-3.5-flash-lite` 通過下列有限樣本實測。

## Need schema：是否必須 prune？

[Gemini structured-output guide][structured] 宣告支援 JSON Schema 子集。其清單涵蓋物件 properties／required／additionalProperties、nullable type、enum、數值 minimum／maximum、陣列 items／minItems／maxItems 等，範例亦使用 `anyOf`。清單未明列 **`default`、`pattern`、`minLength`、`maxLength`**。這是可依賴範圍的限制，**不是已證實「帶這些 key 就會被拒絕」**。

2026-09-05 使用已安裝的 Zod 4.5.4 離線匯出結果：

| schema | 匯出 | default | pattern | minLength | maxLength |
|---|---|---:|---:|---:|---:|
| Need | PASS | 1 | 1 | 0 | 6 |
| VoiceResult | PASS | 1 | 1 | 0 | 7 |

- **已採用的相容性防護：** 遞迴移除 provider-only JSON Schema 中的 `default`／`pattern`／`minLength`／`maxLength`（Need／VoiceResult 目前沒有 `minLength`；ranking schema 有）；保留原始 Zod validators。這是相容性防護，非已驗證的必要修復。不要誤刪 `required`、nullability、enum 或有文件支持的數值／陣列界限。
- adapter 已移除 `$schema` dialect 及上述未明列 keyword，並保護同名的 domain properties。Need 的 `exclude_tags` 雖有 `.default([])`，在輸出 schema 仍為 required；prune default 不應改成 optional。
- 日期的 `.refine()` 實際日曆驗證不會被完整編碼成 JSON Schema；原始匯出只含 YYYY-MM-DD pattern，provider-only schema 現已移除該 pattern，仍保留日期格式 description。最後必須保留 Zod 對不存在日期、長度與其他業務值的驗證。Zod 的 JSON Schema 轉換與不可表示限制見 [Zod 官方文件][zod]。
- 匯出成功及 mocked tests 不等於 provider 接受／強制所有 constraints；本次 live smoke 只涵蓋下列模型與樣本，不是所有 JSON Schema 關鍵字相容性保證。

## 音訊 MIME、上傳與 review 邊界

[API reference][api] 與 [audio MIME list][audio] 均明列 `audio/webm`、`audio/m4a`、`audio/ogg`，以及 WAV／MP3／MPEG／AIFF／AAC／FLAC；因此不必為瀏覽器錄音強制轉 WAV。這不保證每個瀏覽器輸出的 codec／container 組合均已通過本應用實測。

目前本機路由與 client 契約：

- `POST /api/voice`：multipart 唯一 `audio` File → `{transcript,need}`。Safari 的 `audio/mp4` 作本應用 alias 正規化為 `audio/m4a`／`.m4a`；是同一 MP4 音訊容器的 MIME 正規化，**不是轉碼，也不得把未知 bytes 偽稱 WAV**。`audio/mp4` 並非此處官方 AudioContent enum，送 provider 使用 `audio/m4a`。
- 本機允許 webm／m4a／ogg／wav／mpeg／aac／flac／aiff 及已定義 alias；保留真實 MIME／副檔名，核對基本 magic header。不做完整 codec 解碼或 server duration 驗證。
- `readVoiceUpload` 使用 busboy，避免已重現的 Bun 1.4 `Request.formData()` 依 filename 改寫 part MIME；保留宣告 Content-Type，拒絕 duplicate／extra fields，記憶體處理、不寫磁碟。限制整個 multipart **6 MiB**、單檔 **5 MiB**；MIME 宣告仍須搭配檔頭檢查。
- 前端錄音上限 **30 秒 = 30,000 ms**；停止後只呼叫一次 voice，直接展示 transcript／Need 供人工確認，不自動呼叫 `/api/parse` 或搜尋。文字編輯／修正仍可主動呼叫 `/api/parse`；取消與 stale-result 防護、可見且可移除的預算預設值保留。
- `/api/config` 使用 `voice` 而非 `transcribe`，並保留 `parse`／`ranking`／`database`／`support_email`／`area`。`voice:false` 隱藏可用錄音入口，手動輸入仍可用；config 只表示設定完整，不是遠端健康檢查。有效 AI env 僅 `GEMINI_API_KEY`／`GEMINI_MODEL`。

本機 route／錯誤碼細節見 [voice spec](../SPEC-voice-input.md) 與 [backend spec](../SPEC-backend.md)。

## 保留、驗證與未完成項目

`store:false` 在 [API reference][api] 僅控制 request／response 是否保存供日後取回，**不是整體零保留、不作訓練或無安全日誌承諾**。部署者仍需核對 [Gemini API 條款][terms] 與適用服務層級／地區；不應在錄音同意文字承諾 Google 不保存任何資料。

**最新離線回歸：151 pass / 28 skip / 0 fail，942 assertions；typecheck、build 通過。** 明確清空 DATABASE_URL／Gemini env，fixture suite 未觸及真實 DB。下列 live smoke 獨立執行，不把 28 個 skip 計為通過。

### 2026-09-05 晚間 live smoke

使用部署者設定的 `gemini-3.5-flash-lite`；金鑰只由 server env 載入，不記錄、不提交。未修改資料庫、未錄製使用者麥克風。

| 路徑 | 實測結果 |
|---|---|
| `/api/parse` | 「今天午餐一個人，預算一百元，不吃牛肉。」→ HTTP 200，約 2.0 秒；午餐／食品、1 人、100 元、2026-09-05、排除牛均正確 |
| `/api/voice` | macOS 合成中文→Opus/WebM，約 4.95 秒、21.7 KB；HTTP 200，約 2.6 秒，一次取得逐字稿及 Need：日用品／100 元；「不要會員限定的優惠」保留於 unresolved，未假裝已有硬篩選 |
| UI | 刷新後出現語音按鈕；文字「日用品，預算一百元」→確認頁正確欄位→搜尋→AI 排序；日用品 2 筆，NT$88／98（皆含必要費用 NT$59），無 fallback 警告，詳情正常 |
| 排序單筆重現 | 原始正式 generator 對真實商品 `d_ik01` 回傳 failed；修復後同一路徑回傳 done 並有 reason |

### Live 發現的排序 schema 不相容

同一模型、單筆公開商品、同一 prompt：含 `order.maxItems:500` 時為 **HTTP 400 / invalid_request**；只刪去該屬性即 **HTTP 200 / completed**。多組搜尋先前也全數失敗；移除後重新跑相同 UI 搜尋不再出現 fallback。這是本次實測的因果對照，**不代表所有 maxItems 都不支援，也沒有證據判定 Gemini 內部拒絕原因**。

修復位於 `src/server/rank.ts`：provider 使用無陣列數量上限的 strict schema；`rankGroup` 在結果採用前仍使用原本含 500 筆上限的本機 schema。Need 的小型陣列界限不變，也不放寬 id／reason／額外欄位檢查。回歸測試先重現 HTTP 400 再轉綠，另驗證 500 筆可通過、501 筆／空值／過長 reason／額外欄位安全退回成本排序。

**仍待驗收：** 真機錄音端到端、OGG／M4A、噪音／口音與廣泛語意品質、其他模型及正式部署。上列延遲是單次觀察，不是 SLA。

[api]: https://ai.google.dev/api/interactions-api
[audio]: https://ai.google.dev/gemini-api/docs/audio#supported-audio-formats
[structured]: https://ai.google.dev/gemini-api/docs/structured-output
[zod]: https://zod.dev/json-schema
[terms]: https://ai.google.dev/gemini-api/terms
