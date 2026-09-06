# 圓山官方開放資料快照

這個目錄保存可重建的圓山站 2 公里資料快照與 D1/SQLite seed。執行：

```bash
cd mvp
npm run data:refresh
npm run db:verify
npm run data:bootstrap:local
```

會產生：

- `yuanshan-open-data.seed.sql`：依序套用三份 migration 後，用來初始化全新 D1/SQLite 的資料；不含顯式 transaction，直接交給 SQLite 執行時應由呼叫端包 transaction。
- `yuanshan-open-data.snapshot.json`：方便檢視與前端整合的精簡快照。
- `yuanshan-open-data.sqlite`：本機已套用 migration 並通過完整性檢查的資料庫；此檔較適合本機使用，因此不進 Git。

前兩個指令負責重新擷取與驗證三份產物；`data:bootstrap:local` 會把三份 migration 與最新 seed 同步至 `mvp/.wrangler/state` 的本機 D1。`npm run dev`、`npm run dev:lan` 與 `npm run start` 分別透過 `predev`、`predev:lan`、`prestart` 自動執行同一個 bootstrap。腳本會確認 seed 含有 snapshot 的 `runId`，並核對 D1 中該筆完成匯入的地點、餐館與活動筆數；狀態完整才略過同步，避免只憑「曾看過 runId」接受部分資料。

## 資料範圍與來源

範圍中心由官方 YouBike「捷運圓山站（1號出口）」座標決定；有座標的地點只匯入直線距離 2,000 公尺內資料，官方頁面明確標示位於圓山生活圈的場館則保留地址與判定依據。目前共擷取 14 個來源：臺北市餐館業清冊、友善店家、傳統市場、臺北市藥局、公共飲水臺、Taipei Free、涼適點、YouBike、臺北文化快遞、文化部「經緯度查詢附近未過期活動」、捷運票價，以及北美館、臺北孔廟與花博公園官方頁面。

活動以單日場次儲存，已結束的場次不匯入；若擷取當下沒有任何仍有效、且證據足夠的免費活動，`opportunities` 合法為空，不會因此判定資料庫損壞。

每次匯入都在本次產物中保存來源網址、擷取時間、內容雜湊、帶唯一 ID 的來源快照、外部識別碼、距離與匯入／拒絕狀態。政府資料依「政府資料開放授權條款第 1 版」標示；官方網頁不假稱開放授權，只以 `OFFICIAL_FACT_EXTRACTION` 標記並保存必要事實、短摘與 canonical URL。本機三個產物會在 14 個來源全部通過後，以獨立 SQLite exclusive transaction 鎖、每次刷新唯一的 staging 路徑和 prepared/committed 發布日誌守門替換；抓取、驗證或發布失敗時保留上一組完整產物，硬中斷後則在下次執行先回復或完成同一組發布。作業系統會在程序結束或崩潰時釋放鎖，不需要刪除 stale lock。產物只代表最新一次匯入，不是歷史快照倉庫。

## D1 與 catalog API

`mvp/.openai/hosting.json` 已宣告 D1 binding `DB`；本機則由 `mvp/wrangler.local.jsonc` 與上述 bootstrap 共用 `.wrangler/state`。主搜尋 UI 使用 `POST /api/catalog/search`，依類別、中心點、半徑、所選時刻、免費條件與筆數查詢；分類等條件改變時會重新 POST。POST 避免把精確位置放在 URL，`GET /api/catalog/search` 仍保留供手動檢查，`GET /api/catalog/categories` 則回傳各類別筆數與同步時間。

D1 查詢只選最新一筆 `COMPLETED` import run 中標為 `IMPORTED` 的項目。活動原則上通過 evidence gate 才顯示；另只對文化部附近活動來源開放 `UNVERIFIED` 白名單，讓它以「官方來源」而不是「活動已驗證」呈現，衝突資料仍不顯示。沒有可用的 `DB` binding，或 D1 查詢失敗時，endpoint 會回退至版本庫內最近一次官方 snapshot；search response 會以 `source`、`fallback` 與 `warnings` 說明資料來源。DEMO 固定情境與正式模式分流，正式模式 API 失敗時不會自動混入模擬資料；若真實候選少於 3 筆，模擬補充只會出現在獨立區塊且不計入真實筆數。活動預設回傳所選時刻起 7 天內仍有效或即將開始的項目，並區分 `CURRENT`／`UPCOMING`；未知價格在真實模式顯示「價格待確認」，不會被當成免費或產生虛構 CP 分數。item-level `verification` 會列出實際已驗證欄位，勾勾不代表未列欄位也已確認。

每次 catalog request 會在 server 端以免金鑰官方端點嘗試覆蓋 YouBike 與文化部附近活動：YouBike 每個 isolate 快取 60 秒，文化部活動快取 10 分鐘，單次上游請求 4 秒逾時。只有成功且通過格式檢查的來源會取代該來源的 D1／snapshot 候選；逾時、網路錯誤或格式異常時保留 last-good 候選並加入 warning，不會以空陣列清掉舊資料。這層不寫 D1：YouBike 沒有可解析的來源觀測時間時不顯示即時勾勾，文化部活動仍維持 `PARTIAL`／「官方來源」，而且 `onSales=N` 或空票價仍保持未知。持久化排程與撤站／下架 reconciliation 仍是後續工作。

日用品 catalog 目前只接受 provider 為 `TAIPEI_PHARMACY` 的官方藥局。友善店家來源仍包含在 14 個來源的抓取與稽核中，但該清冊只能證明友善設施，不能證明零售業態，因此圓山範圍內資料會以 `source_lacks_retail_classification` 留在拒絕稽核，不會建立成零售地點或日用品候選。

## 誠信限制

- 餐館業登記不代表目前仍營業，所以餐廳 `status` 固定保持 `UNKNOWN`。
- 官方開放資料沒有即時菜單、售價、庫存或優惠，因此不建立推測的 `menu_items`、`offers` 或 CP 分數。
- 臺北文化快遞是官方分發的投稿資料，不等於官方背書，因此預設 `UNVERIFIED`；異常長區間、已過期、可疑凌晨時段、只有行政區地址或場地／座標明顯衝突的列會進 `REJECTED`。目前 feed 在圓山 2 km 命中的活動都缺少可安全核對的精確地址，因此只保留隔離稽核，沒有進入候選；後續需以場館官方頁或可信地點資料交叉驗證。
- 文化部附近活動 API 依 `showInfo` 拆成逐場次記錄，並重新計算 2 km 距離；它能證明資料由官方平台分發，但不能單獨證明投稿事件內容，所以事件維持 `UNVERIFIED`、前端只標「官方來源」。`onSales=N` 或空白票價絕不推成免費，只有票價原文明示免費且沒有付費衝突時才保存 0 元。
- YouBike 可借還數與站點啟用狀態只保存在短效 assertion，證據有效期是來源觀測時間後五分鐘；驗證輸出會另外顯示目前是否仍新鮮。
- 捷運票價資料沒有座標；只把起點或終點為圓山站的票價表保存為來源證據，不冒充 2 公里內地點。
- 不同來源可能描述同一個實體場館，目前未做跨來源 entity resolution，因此地點筆數是來源紀錄數，不保證等於唯一實體數。

hosting config 的 `d1` 現為 `DB`，主搜尋 UI 也已接上 catalog POST；但本機 bootstrap 只管理 `.wrangler/state`，production seed 與部署尚未完成。登入、Team、交易等寫入後端也仍未完成。seed 是新資料庫或新快照的 bootstrap；正式環境的增量撤站、下架與過期 reconciliation 尚未實作，不能直接把每日 seed 重套當成 production sync。
