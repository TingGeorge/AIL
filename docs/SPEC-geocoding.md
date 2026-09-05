# ALL in life — 位置資料規格（Location Data Spec）

- 文件狀態：Hackathon MVP build spec
- 版本：v0.1
- 日期：2026-09-05
- 上游文件：[SPEC-backend.md](./SPEC-backend.md)（§3 距離、§6 schema、§8）、[PRD-all-in-life.md](./PRD-all-in-life.md)（§9.1、NFR-05）
- 詞彙：以 [CONTEXT.md](../CONTEXT.md) 為準

## 1. 摘要與範圍

系統有三種位置資料：候選紀錄的**地址**、候選紀錄的**座標**、使用者的**當下座標**。三者來源不同、可信度不同、生命週期也不同。本文件定義這三者怎麼取得、怎麼儲存、拿不到的時候怎麼辦。

距離計算本身（haversine、`km ÷ 0.08` 換算分鐘、「估算」標示）屬 [SPEC-backend §8](./SPEC-backend.md)，此處不重複。

### 1.1 MVP 包含

- 候選紀錄地址的取得、儲存與出處標記。
- 候選紀錄座標的解析（Google Places API）、寫回與正確性檢查。
- 使用者座標的取得與失敗處理。
- 金鑰管理。

### 1.2 MVP 不包含

- 地圖畫面、pin、Maps JavaScript API。
- 路線規劃、即時交通、大眾運輸時刻。
- 地址正規化、門牌校正、多結果消歧。
- `scripts/geocode.ts` 的實作（見 SPEC-backend §14：匯入腳本由開發者另行提供）。

## 2. 詞彙

先定義，因為 `lat／lng` 在文件裡出現得很密：

- `lat`＝**緯度**（latitude），南北向。赤道為 0，往北為正。台灣範圍約 21.5 ~ 25.5。
- `lng`＝**經度**（longitude），東西向。格林威治為 0，往東為正。台灣範圍約 119.5 ~ 122.5。
- 兩者都是 `double precision`，就是兩個小數。
- 慣例一律寫成 `(lat, lng)`。**注意這與地圖上的 `(x, y)` 相反**——畫在地圖上，橫軸 x 是經度、縱軸 y 是緯度。寫反不會報錯，只會安靜地算出離譜的距離，這是 §8 台灣範圍檢查存在的理由。
- 例：台北 101 = `lat 25.0340, lng 121.5645`。

實際算一次，使用者在台北車站、店家在台北 101：

```
使用者  lat 25.0478, lng 121.5170
店家    lat 25.0340, lng 121.5645
        ↓ haversine
5.03 km  →  5.03 ÷ 0.08 = 步行約 63 分鐘（估算）

寫反的話：lat 121.5645, lng 25.0340  →  7286 km（掉到印度洋）
```

## 3. 三種位置資料一覽

| | 候選紀錄地址 | 候選紀錄座標 | 使用者座標 |
|---|---|---|---|
| 來源 | 來源網頁；或 Google 回填 | Google Places Text Search | `navigator.geolocation` |
| 時機 | 匯入時 | 匯入時，一次性 | 每次搜尋當下 |
| 儲存 | `candidates.address` 持久化 | `candidates.lat／lng` 持久化 | **不保存、不寫 log**（PRD NFR-05） |
| 給誰用 | 顯示給使用者、開地圖連結 | 只餵 haversine | 只餵 haversine |
| 缺值時 | 只顯示 `provider`／`title` | 該筆顯示但不做距離篩選 | 距離篩選整個停用，`location: null` |

**設計立場：地址是第一級資料，座標是衍生資料。** 座標只用來算距離；人到現場靠的是地址。所以地址能取得就一定要存，而且不因為座標解析失敗而連帶失去。

## 4. 地址（`candidates.address`）

- 匯入者**能從來源取得就必須存**。抄原文，不改寫、不補齊、不猜測行政區。
- 可為 null：線上服務、電話申請、無固定地點的活動本來就沒有地址。
- `extra.address_source` 記錄出處，兩種值：
  - `"source"` — 來源網頁上寫的。依 SPEC-backend §6.2 證據規則附一條 `evidence` 摘錄。
  - `"geocoded"` — 來源沒有，由 Google `formattedAddress` 回填（見 §6）。**不算證據**，顯示時必須可辨識。
- 顯示：Detail 畫面顯示 `address`。`address_source` 為 `"geocoded"` 時標示為系統比對所得，與已驗證的來源資訊區隔。

**開地圖連結（不需金鑰）**：有 `address` 時，Detail 給一個 `<a>` 指向

```
https://www.google.com/maps/search/?api=1&query= + encodeURIComponent(address)
```

純 URL，不載入 Maps JavaScript API、不需要瀏覽器端金鑰、不計費。這是本專案唯一會出現在前端的 Google 連結。

## 5. 座標：Google Places API

| 面向 | 決定 |
|---|---|
| 端點 | `POST https://places.googleapis.com/v1/places:searchText` |
| 為何不用 Geocoding API | 來源不一定有門牌（「大安區社區活動中心」、「八方雲集 大安店」）。Text Search 一條路徑同時吃地址與店名；Geocoding API 對店名會退化成路段中心點。有地址時 Text Search 一樣準，所以不必維護兩條路徑 |
| 為何不在請求路徑上做 | 每次搜尋要 35–50 次外部呼叫，延遲與費用都不可接受，且金鑰多一層暴露面。座標是靜態資料，屬匯入階段 |
| **查詢字串優先序** | 1. `address`（最準）→ 2. `provider + " " + title` → 3. 兩者皆無則跳過該列 |
| Request body | `{ textQuery, languageCode: "zh-TW", regionCode: "TW", locationBias: { circle: { center: 目標城市, radius: 30000 } }, maxResultCount: 1 }` |
| 必要 header | `X-Goog-Api-Key`（金鑰放 header，**不放 URL**）、`X-Goog-FieldMask: places.id,places.location,places.formattedAddress` |
| FieldMask | 新版 Places API 依 FieldMask 計費。只要這三個欄位，不得用 `places.*` |

回應與取值：

```json
{ "places": [ { "id": "ChIJ...",
                "location": { "latitude": 25.033, "longitude": 121.5654 },
                "formattedAddress": "臺北市大安區…" } ] }
```

`places` 為空、缺欄位、或 HTTP 非 2xx → 視為未命中，走 §7。

## 6. 寫回規則

- `lat = places[0].location.latitude`、`lng = places[0].location.longitude`
- `extra.place_id = places[0].id`
- **地址回填**：`address` 原本為 null 時，寫入 `formattedAddress` 並設 `extra.address_source = "geocoded"`。
  `address` 原本有值時**不覆寫**——來源原文優先於 Google 的正規化結果；只把 `formattedAddress` 存進 `extra.geocoded_address` 供人工比對。
- **冪等**：只處理 `where lat is null`。重複執行只補空的，不覆寫已有座標，也不重複計費。
- `extra` 用 `extra || $1::jsonb` 合併，不整包覆寫。

## 7. 不猜（比對不到時）

未命中 → `lat／lng` 留 null，印 warning（id、查詢字串），繼續處理下一筆。**不寫近似點、不退回行政區中心、不用鄰近店家頂替。**

SPEC-backend §6.2 既有規則接手：座標為 null 的紀錄「顯示但不做距離篩選」。有 `address` 的話這種紀錄依然完整可用，使用者看得到去哪裡。一筆錯誤座標會讓使用者走錯路，比沒有座標更糟。

## 8. 正確性檢查

- **台灣範圍檢查**：寫入前檢查 `lat 21.5–25.5`、`lng 119.5–122.5`，超出即視為未命中。這一條同時擋掉兩種真實錯誤：lat／lng 寫反（見 §2），以及比對到國外同名店。
- **地址一致性檢查**：`address` 已有值時，比對 `formattedAddress` 的行政區（縣市 + 區）是否相符；不符則印 warning 並視為未命中——通常代表比對到別家分店。
- **`--dry-run`**：腳本須支援，印出 `id / 查詢字串 / formattedAddress / lat,lng` 而不寫入。
- **人工複核**：實寫前至少眼看三筆。

## 9. 金鑰與安全

- 變數名 `GOOGLE_MAPS_API_KEY`，只放 `.env`。
- **不得使用 `VITE_` 前綴**——Vite 會把 `VITE_*` 內嵌進前端 bundle，等於公開金鑰。
- 只有匯入腳本讀取；伺服器與前端都不讀。§4 的開地圖連結是純 URL，也不帶金鑰。
- GCP 主控台限制此金鑰只能呼叫 Places API。
- 金鑰不進 git；`.env.example` 只放空值。

## 10. 使用者座標：`navigator.geolocation`

**不需要 Google。** 瀏覽器原生 API 免金鑰、免費，準確度也優於 Google Geolocation API（那是給沒有 GPS 的裝置做基地台／wifi 三角定位用的，而且要付費）。

- `getCurrentPosition`，參數 `{ timeout: 8000, maximumAge: 300000 }`。
- 拒絕、逾時、失敗一律 `location: null`，不重試、不追問、不降級到 IP 定位。
- 送進 `POST /api/search` 的 body，用完即丟：不保存、不寫 log（PRD NFR-05）。
- **只在 https 或 localhost 可用。** 用區網 IP 從手機開會直接失敗 → `location: null` → 距離篩選靜默消失。Demo 要用手機就得走 https 或 localhost。
- 桌機靠 wifi 定位，`coords.accuracy`（公尺）可達公里級。這是距離標示「估算」的第二個理由，第一個是 haversine 算直線而非路徑。

## 11. 用量與條款

- 約 35–50 列跑一次，遠低於免費額度。重跑只補 null，不會重複呼叫。
- **`place_id` 可永久儲存**（Google 條款明確允許）；座標與 `formattedAddress` 屬有快取期限的 Google Maps Content。這是 `address_source` 要分 `"source"`／`"geocoded"` 的第二個理由：來源原文是自有資料，不受此限。
- 存 `place_id` 也讓日後重新解析、或升級 Routes API（§14）時不必再靠字串比對。

## 12. 驗收條件

1. 來源有地址 → `address` 存來源原文、`address_source = "source"`、座標落在台灣範圍。
2. 來源只有店名 → 座標寫入成功、`address` 由 `formattedAddress` 回填、`address_source = "geocoded"`。
3. 亂打的店名 → 印 warning、該列 `lat／lng` 與 `address` 維持 null、不中斷後續處理。
4. 連續執行兩次，第二次不發出任何 API 呼叫。
5. 人為把回應的 lat／lng 對調 → 台灣範圍檢查攔下。
6. `address` 為「台北市大安區…」但 `formattedAddress` 回「新北市…」→ 地址一致性檢查攔下。
7. 前端在 https 下按搜尋會跳定位授權；按拒絕後搜尋仍正常完成，只是沒有距離。
8. Detail 畫面在座標為 null、地址有值時，仍顯示地址與開地圖連結。

## 13. 驗證

實作 `scripts/geocode.ts` 後：

1. `bun scripts/geocode.ts --dry-run` 對照三筆已知地址人眼確認。
2. `select id, address, extra->>'address_source', lat, lng from candidates` 抽查落點與出處標記。
3. `curl -N -X POST localhost:3000/api/search -d '{"need":{…},"exclude":[],"location":{"lat":25.03,"lng":121.56}}'`
   → `distance_km` 有值；調整 `max_distance_km` 時 `excluded_by.distance` 跟著變動。
4. `location: null` 再跑一次 → 所有 `distance_km` 為 null，`excluded_by.distance` 為 0。

## 14. 延後與不在範圍

- 地圖畫面、pin、Maps JavaScript API。
- 路線距離：Google Routes API（`computeRouteMatrix`；舊稱 Distance Matrix API，已進入維護模式）。只需換掉 haversine 那個函式；已存的 `place_id` 可直接當 waypoint，不必重新比對地址。
- 地址正規化、門牌校正、多結果消歧、分店選擇。
- 使用者座標的任何形式保存或分析。

## 15. 未經討論的假設（請審閱）

- `locationBias` 圓心固定為單一目標城市；跨城市資料需要改成逐筆帶入。
- `maxResultCount: 1` 直接採信第一筆，不做多結果消歧。
- 地址一致性檢查只比到「區」的層級。
- Google 回填的地址（`address_source = "geocoded"`）可以顯示給使用者，只要標示得出來。若認為未經驗證的地址一律不該顯示，§4 要改。
