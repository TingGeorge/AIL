# 04: 座標補齊腳本

**What to build:** 匯入後跑一支腳本，把候選紀錄的地址解析成座標寫回資料庫，讓距離估算有資料可用。查詢字串優先用來源原文 `address`，沒有地址就用 `provider + title`，兩者皆無就跳過。解析不到就留 null 並印 warning 繼續下一筆 — 不寫近似點、不退回行政區中心、不用鄰近店家頂替，因為一筆錯座標會讓使用者走錯路，比沒有座標更糟。

腳本只處理 `lat` 為 null 的列，重跑不覆寫既有座標、不重複計費。`address` 原本為 null 時才用 Google 回填並標記出處；原本有值就不覆寫，只把 Google 的地址存進 `extra` 供人工比對。規則見 SPEC-geocoding §5–§8。

**Blocked by:** 01（表裡要先有列）

**Status:** ready-for-agent

- [ ] `bun run scripts/geocode.ts` 只查 `lat is null` 的列；連跑兩次第二次不發出任何外部請求（或只針對仍未命中的列）
- [ ] 金鑰從環境變數讀、放在請求 header，不出現在 URL；`.env.example` 補上該變數
- [ ] 請求帶 `languageCode: zh-TW`、`regionCode: TW`、locationBias 與 FieldMask 三欄位（id、location、formattedAddress），不索取多餘欄位
- [ ] 寫入前檢查座標落在台灣範圍（21.5–25.5, 118–122.5），超出範圍視同未命中
- [ ] 未命中時 `lat`／`lng` 留 null、印出 id 與查詢字串、不中斷整批
- [ ] `address` 原為 null 才寫入 `formattedAddress` 並設 `extra.address_source = "geocoded"`；原本有值則不覆寫，只存進 `extra.geocoded_address`
- [ ] `extra` 以合併方式更新（`place_id`、`address_source` 不會蓋掉既有 key）
