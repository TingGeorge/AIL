# ALL IN LIFE 黑客松嚴格評審稽核報告

> 稽核時間：2026-09-05 19:58（Asia/Taipei）
>
> 稽核快照：`codex/all-in-life-backend-plan`，HEAD `404475bc73f0`，工作樹未乾淨
>
> 比賽：BUILDMODE GEN-AI HACKATHON 2026，Track 02 — AI for Everyday Life
>
> 方法：官方規則比對、原始碼／Git 歷史稽核、建置與資料庫驗證、公開部署實機操作、影片與文件檢查

> **歷史快照提醒（2026-09-06）：** 本報告保留 2026-09-05 當下的嚴格評審結果，不代表目前分支狀態。其後已完成公開 repository、MIT License、catalog／AI／帳號 API、D1、本機持久化、unit／E2E／build gates，以及最新版架構／流程圖；目前仍待隊伍確認的是影片、表單欄位與本分支 production migration／重新部署。請以根目錄 [`README.md`](../README.md) 與 [`submission-checklist.md`](../submission-checklist.md) 為最新狀態來源。

## 一句話判決

**以目前狀態送件，我會先判定不具總排名評選資格；即使暫時忽略資格問題強制評分，也只有約 43/100，進不了前 10。**

不是因為畫面醜，而是因為三件更致命的事：

1. 儲存庫目前是私人、根目錄沒有 LICENSE，直接踩中官方必要條件。
2. 作品把自己呈現成 AI 決策產品，但送出的 MVP 搜尋實際是計時器加 fixture，沒有模型或搜尋後端。
3. 核心承諾「硬限制、Evidence Gate、CP 排序」沒有被真正執行；實機甚至會把已打烊的市集、博物館、廟與 YouBike 推給「今晚兩人吃飯」的使用者。

這個專案仍有可救的底：視覺完成度、PWA、開放資料匯入器、資料庫完整性與架構思考都不差。現在要做的不是再加功能，而是把作品縮成一條**真 AI、真資料、真限制、真證據**的可重現流程。

## 1. 先判資格：目前是 FAIL

[官方參賽者資訊站](https://hackathon2026.sitcon.org/)明定：公開程式碼儲存庫、README、授權條款與執行方式是總排名必要條件；最後繳交時間是 **2026-09-06 10:00（台北時間）**。

| 必要項目 | 現況 | 判決 |
|---|---|---|
| 公開 GitHub／GitLab | GitHub API 回報 `visibility: PRIVATE` | **FAIL／可能直接失格** |
| 明確 LICENSE | 根目錄沒有 `LICENSE`；README 也承認尚未加入 | **FAIL／可能直接失格** |
| README 與執行方式 | 功能分支有 README，但預設 `main` 沒有根 README 與新版 `mvp`；照 clone 指令會落到錯誤版本 | **FAIL** |
| 可重現提交版本 | HEAD 與 `origin/main` 各自獨有 17／14 個 commit；工作樹另有 modified 與 untracked 成果 | **FAIL** |
| 最長 2:00 YouTube 影片 | [影片](https://www.youtube.com/watch?v=HCBwSmCa1Yg)可取得，長 1:56 | PASS |
| 影片／README 一致 | README 兩處仍寫「待上傳」；影片沒有 CC，說明欄只有一句標語，沒有 Demo、repo、執行連結 | **FAIL** |
| 既有程式、模型、資料與素材揭露 | README 有部分揭露，並誠實說明 AI 尚未串接；但缺正式 LICENSE，且 default branch 無法對應作品 | PARTIAL |

### 送件前 60 分鐘內必須完成的資格修復

1. 由所有權利人決定授權，加入真正的根目錄 `LICENSE`；不要只在 README 寫「預計 MIT」。
2. 把**唯一可評選版本**整合到 `main`，推送所有必要程式、migration、seed、snapshot 與文件。
3. 把 GitHub 改為公開，使用未登入／無痕視窗驗證 repo、檔案與 clone 都可讀。
4. 從全新空目錄執行 `git clone`、`npm ci`、build、typecheck、核心測試；README 指令必須逐字可用。
5. 為送件 commit 加 tag 或記錄完整 SHA，部署、影片、README、表單都指向同一版。
6. README 補上現有影片連結；YouTube 補 CC、Demo URL、repo URL、執行方式與資料來源。
7. 刪除 README 中四位成員的公開 Email。官方 README 範本只要求姓名／分工；聯絡資料留在表單。
8. 不要執行 `git add -A`：目前 `old_version/node_modules` 是未追蹤內容，約 103 MB、4,000 多個檔案，根 `.gitignore` 又沒有一般性的 `node_modules` 規則。

## 2. 如果忽略失格條件，第一輪強制評分：43/100

官方第一輪依影片、程式碼與文件選出前 10，權重為問題與影響 35%、技術實作 30%、Demo 與成果 20%、開源品質 15%。以下不是鼓勵分，是我在目前證據下能辯護的分數。

| 第一輪項目 | 權重 | 預估得分 | 嚴格評語 |
|---|---:|---:|---|
| 問題定義與影響 | 35 | **22** | 「預算有限時如何做日常選擇」容易理解，Track 02 也合適；但沒有使用者訪談、基準數據或成功指標，文件又在「生活 CP 助手」與「投資失利生存遊戲」間分裂。 |
| 技術實作 | 30 | **9** | 開放資料 importer、SQLite 驗證與架構文件有含金量；但送出的使用者流程沒有 AI、沒有後端、沒有真正 Evidence Gate，hard filter 與 CP engine 也沒有接上 UI。 |
| Demo 與成果 | 20 | **10** | 影片 1:56、品牌與節奏有記憶點，公開站可操作；但最關鍵的 dinner 情境會產生明顯錯誤結果，沒有字幕，部署版本也落後於本機成果。 |
| 開源品質 | 15 | **2** | 私人 repo、無 LICENSE、預設分支錯版、工作樹未收斂、無測試／CI、lint 與 format 失敗，評審無法可靠重現。 |
| **總分** | **100** | **43** | **失格風險優先於分數；即使補齊資格，產品真實性不修仍很難進前 10。** |

## 3. 產品核心缺陷：現在比較像「高完成度靜態原型」

### P0-1：作品沒有真正的 AI 路徑

- `mvp/package.json` 沒有模型 SDK，`mvp/app` 沒有 API route，前端流程也沒有對搜尋後端的 `fetch`。
- `mvp/.openai/hosting.json` 的 D1、R2 都是 `null`。
- 搜尋只在 `mvp/app/page.tsx` 啟動計時器；「候選 18、通過 10、資料 26」是固定文字。
- README 誠實寫出「尚未呼叫正式搜尋或 AI API」，這份誠實值得保留，但也代表目前不構成有說服力的 Gen-AI 作品。

評審會問：「AI 到底做了什麼？」如果答案是「目前只是 UX 模擬」，技術實作分不可能高。

**修正方向：** 只讓 LLM 做自然語言需求的結構化與理由生成；預算、時間、距離、過敏原、資格與證據判斷由 deterministic engine 執行。模型輸出必須可見、可編輯、可驗證，失敗時回退到手動表單。

### P0-2：「硬限制」其實不是硬限制

目前實作只用類別、預算與距離做 filter；日期、時間、人數、自然語言需求沒有參與可行性判斷。過敏原／排除條件只是把結果排到後面，沒有移出主要推薦。

這是安全與信任問題，不是小 bug：介面稱它為「硬排除」，結果頁又顯示「符合硬限制」，實作卻允許違規結果繼續出現。

**實機反例：** 我以「今晚 20:00、兩人吃飯、預算 NT$500、排除堅果」搜尋，前四筆包含 10:00–18:00 的市集、博物館、孔廟與 YouBike；系統仍宣稱找到 8 個可行選擇。這條 Demo 在評審桌上會直接摧毀可信度。

**修正方向：** 建立單一 runtime schema，先 hard filter，再排序；不合日期、營業時間、份量、總價、距離、資格、過敏原或 evidence freshness 的項目不得進主榜，只能列在「已排除」並顯示 reason code。

### P0-3：Evidence Gate 沒有 gate

- 三張主要候選引用 repo 中不存在的 `Yuanshan_APP_AI_Database_Design.xlsx`，名稱仍是 `YS_FOOD_002` 等 placeholder，卻附有價格、時段、CP 維度、可靠度與回報數。
- 其中一張自己寫「正式版需補齊 evidence assertion」，仍被放進主要排序。
- `docs/API-integration-plan.md` 也承認該 XLSX 未收錄、無法重現。
- 這與 PRD 的「不得虛構」「缺證據不得進主要排序」直接矛盾。

**修正方向：** 立即移除無法核對的候選、可靠度、社群回報數與 benchmark。寧可只展示 2–3 筆真正可打開來源、確認總價與有效時間的結果，也不要用 8 筆假完整資料換視覺豐富度。

### P0-4：README 宣稱的 CP Engine 沒有驅動畫面

`mvp/lib/cp-engine.ts` 的 `calculateCpScore()` 確實考慮 evidence、hard constraint、coverage 與 reliability，但全專案沒有呼叫它；`page.tsx` 只 import 型別。實際畫面分數只由價格、距離、喜好計算。

**修正方向：** 只保留一套可測試的 CP engine，前後端共用；每個結果輸出 policy version、分數元件、evidence、freshness 與人類可讀理由。無 evidence 就不計分、不上榜。

### P0-5：多個功能以「成功」包裝沒有發生的事

- 登入只是把 boolean 改成 `true`，卻顯示「已登入」。
- 回報沒有送出或保存，卻顯示「已收到回報」。
- Team 只是本機增加 fixture 成員；收藏、提醒、歷史也只存在記憶體。
- 瀏覽器不支援語音時，程式會塞入固定逐字稿並宣稱轉錄成功。
- 首頁預載「本月省下 NT$1,240」與假交易；分析頁又算出不同的 NT$112。
- 歡迎頁說匿名資料留在裝置，但重新整理後 onboarding 與狀態全部消失。

這些都會讓評審把「prototype」解讀成「冒充完成」。

**修正方向：** 截止前不要補五套後端；直接隱藏登入、Team、回報、假分析與語音 fallback。每個留下的按鈕都必須真的工作，或清楚標成 prototype 且不可產生成功假象。

## 4. 工程與可重現性缺陷

### 目前通過的部分

- `npm run build`：PASS，成功 prerender 2 個 route。
- `npm exec tsc -- --noEmit --incremental false`：PASS。
- `npm run db:verify`：PASS；SQLite integrity 與 foreign key 均通過，seed rebuild digest 一致。
- 目前匯入資料含 2,987 places、2,247 restaurants、434 public resources、183 transit records、7 opportunities、9,146 evidence assertions。
- 高可信度 secret pattern 掃描未發現金鑰；資料授權與 geofence safeguards 的思考比一般黑客松作品成熟。

### 目前不通過的部分

| 檢查 | 結果 | 影響 |
|---|---|---|
| `npm run lint` | **FAIL，19 errors** | 以 a11y 與 React／TypeScript 規則為主；大量來自未使用 UI 元件 |
| `npm run format -- --check` | **FAIL，78/84 files** | 提交品質與 diff 可讀性差 |
| 測試 | **不存在** | 沒有 `test` script、current MVP test file 或 CI |
| Fresh clone | **無法依 README 重現** | default `main` 不是評選作品 |
| 部署一致性 | **FAIL** | 公開站功能與本機／遠端功能分支不同步 |

### 資料層還不能支撐「省錢餐飲」

- 雖有 2,247 間餐廳，但 `menu_items=0`、`offers=0`；只能證明「店存在」，不能證明兩人吃什麼、總價多少、現在可不可以買。
- 資料庫有 183 筆 YouBike realtime assertion，但稽核當下 `freshNow=0`，全部已超出有效時間。
- importer 程式版本是 1.4.0，產出的 snapshot／seed 仍標 1.3.0；`db:verify` 沒抓出版本漂移。

**修正方向：** 不要拿「資料筆數」當產品成果。Demo 只需要一個小而可信的 golden dataset：2–3 間餐廳、每間 1–2 個可核對品項、當日營業時間、兩人總價、來源 URL、擷取時間與授權。大資料庫保留作為擴充證據。

### 架構與 UX 技術債

- `mvp/app/page.tsx` 約 3,538 行、108 KB，把 fixtures、routing、商業邏輯與 16 個畫面放在一起。
- 專案有約 60 個 UI components，實際主流程只用少數幾個；未使用元件反而造成多數 lint error。
- 導航只有 React state，沒有 URL、deep link 或 browser history；重新整理會回到 Welcome。
- 桌面 1920×855 仍被限制在約 430 px 寬的手機殼，投影 Demo 文字太小、兩側大量留白。
- 大量持續動畫沒有 `prefers-reduced-motion`；影片又沒有字幕，無障礙說服力不足。
- Service Worker 預快取未聚焦實際 hashed JS/CSS，卻包含未使用的大圖；其中一個資源失敗可能讓整次安裝失敗。

## 5. 定位問題：文件像三個不同產品

目前至少有三種敘事同時存在：

1. README／公開站：圓山生活圈 CP 值生活平台。
2. `docs/SPEC-all-in-life-mvp.md`：投資人大部分資金 ALL IN 市場後，以現金續命的黑色幽默生存遊戲。
3. 架構文件：Worker、D1、R2、正式 Agent、Team Intelligence 的未來平台。

「生存遊戲」可以是很好的品牌包裝，但不能取代真實問題與產品證據。Round 1 的 35% 是問題與影響，不是世界觀完整度。

**建議統一成：**

> 給預算有限、時間有限且有飲食限制的人，一個不會把「看起來便宜」誤當「真的可行」的日常決策助手。AI 負責理解需求，規則引擎守住限制，Evidence Gate 讓每個推薦都可追溯。

生存感保留在視覺與文案；「投資失利」不要當成使用者前提，也不要在評審前花 30 秒解釋 lore。

## 6. 最小可贏版本：只做一條 golden path

### 唯一 Demo 情境

> 2026-09-05 20:00，兩個人在圓山附近吃晚餐，總預算不超過 NT$500，步行 1.5 km 內，其中一人對堅果過敏。

### 必須真的完成的鏈路

```text
自然語言
  → LLM 產生可編輯的 Need JSON
  → schema validation
  → deterministic hard filter
  → 已凍結且可追溯的真實資料
  → Evidence Gate
  → CP score 與原因
  → 2–3 筆真的可行結果
```

每張結果卡只需回答七件事：

1. 為什麼符合需求？
2. 兩人**總成本**多少，不是錯用四人份再除？
3. 20:00 是否營業？
4. 是否通過堅果硬排除？未知就不得上榜。
5. 距離與移動時間多少？
6. 資料來源、查核時間、有效期限是什麼？
7. CP 分數如何組成？

現有 `origin/main` 已有 Hono／AI parser、共享 Zod Need、deterministic search 與 hard-limit 測試，可選擇性移植；不要把兩套分歧 runtime 整包硬合併。

### 應立刻砍掉／隱藏

- 假登入
- 假 Team 邀請與成員資料
- 假回報成功
- 假收藏／提醒／歷史（除非補最小 localStorage）
- 假省錢分析與交易
- 固定逐字稿的語音 fallback
- 與 golden path 無關的 12 張 fixture 結果
- 更多頁面、更多動畫、更多架構圖

**評審寧可看見 1 條完整閉環，不會因為 16 個半成品畫面給成熟度分。**

## 7. 截止前約 14 小時的優先計畫

| 時段 | 唯一目標 | 完成條件 |
|---|---|---|
| 0–1 小時 | 解除資格炸彈 | LICENSE、public repo、canonical `main`、清掉 Email、影片連結、`.gitignore` |
| 1–5 小時 | 接通 golden path | LLM → validated Need → hard filter → evidence → CP；模型失敗可回退 |
| 5–7 小時 | 真資料與測試 | 2–3 筆晚餐資料；8–12 個 hard-limit／evidence 邊界測試 |
| 7–9 小時 | 收斂產品 | 隱藏假功能；修 dinner flow、reload／deep link 或明確限制；桌面 Demo 模式 |
| 9–10.5 小時 | Fresh clone 與部署 | clean clone 全綠；公開站與提交 SHA 一致；手機與投影各走一次 |
| 10.5–12 小時 | 重剪 1:56 影片 | 前 15 秒問題，60 秒真流程，30 秒證據與架構，最後顯示 URL；補 CC |
| 12–13 小時 | 文件與表單 | 100–200 字摘要、來源、已知限制、AI 邊界、repo／Demo／影片 URL |
| 最後 1 小時 | 只做提交與備援 | 09:00 前送出；用未登入帳號重開全部連結；保留影片與截圖備援 |

08:30 後除非是 blocker，不再開發新功能。10:00 是截止，不是開始上傳的時間。

## 8. 建議的 100–200 字送件摘要

> ALL IN LIFE 是為預算有限者打造的日常決策助手。使用者以自然語言輸入人數、預算、時間、距離與飲食限制，AI 將需求轉成可編輯的結構化條件，再由確定性規則比對圓山生活圈公開資料與可追溯證據，排除不合資格選項，呈現總成本、距離、有效時間、來源與 CP 分數解釋。即使模型失敗，手動條件與證據閘門仍能安全運作。

注意：只有在上述鏈路真的完成後才能用這段；若 AI 仍未接通，必須改成誠實描述原型，不可用未實作能力換文案分。

## 9. 1:56 評選影片應重排的節奏

| 時間 | 畫面／主張 |
|---|---|
| 0:00–0:12 | 一個具體使用者與限制：「兩人、20:00、500 元、堅果過敏」 |
| 0:12–0:28 | 自然語言進入，顯示 AI 解析後的 Need JSON，使用者可修正 |
| 0:28–1:00 | 真實執行 hard filter；刻意展示一筆因打烊／過敏原而被排除 |
| 1:00–1:25 | 兩筆真結果，打開來源、時間戳、總價與 CP 分數拆解 |
| 1:25–1:42 | 10 秒架構圖：AI 理解、規則守門、資料可追溯；顯示測試通過 |
| 1:42–1:56 | 價值、限制與下一步；畫面留下 Demo URL、repo URL、Track 02 |

目前影片的品牌質感可以沿用，但第一段鋪陳不能再吃掉核心 Demo 時間。一定補人工校對字幕；說明欄補三個連結與提交 SHA。

## 10. 評審很可能追問的五題

1. **這和 Google Maps／搜尋有何不同？** 不是更多結果，而是把多條硬限制、總成本與 evidence 變成可驗證決策。
2. **AI 在哪裡？** 現場顯示模型輸入／結構化輸出；AI 不直接決定事實或繞過規則。
3. **如何避免 hallucination？** schema validation、deterministic filter、Evidence Gate、未知即排除。
4. **價格與營業時間怎麼保證？** 說明來源、snapshot 時間、TTL；過期就降級或不上榜。
5. **為什麼現在只有圓山？** 圓山是可驗證的區域試點；schema 與 importer 可換區域，不把單點資料假裝全台覆蓋。

答不出這五題，架構圖再漂亮也救不了技術與成熟度分。

## 11. 最終 Definition of Done

- [ ] GitHub 在未登入狀態可開，顯示 Public，根目錄有 LICENSE。
- [ ] `main` 就是送件版本；fresh clone 可依 README 完成安裝、驗證與執行。
- [ ] `npm run build`、typecheck、lint、核心 tests 全綠；若 format 暫不全修，至少提交檔案乾淨。
- [ ] dinner golden path 使用真 AI／真規則／真資料，日期、時間、人數、預算、距離、過敏原全部生效。
- [ ] 每筆主榜結果有來源、查核時間、有效期限與 CP 計算理由；無證據不上榜。
- [ ] 假登入、假回報、假 Team、假分析不出現在評選路徑。
- [ ] 公開部署與提交 SHA 一致，無痕視窗與手機網路都可完成流程。
- [ ] 影片 2:00 內、可外部觀看、有字幕，README／表單已填同一影片、repo 與 Demo URL。
- [ ] 送件摘要只描述已完成能力；既有程式、模型、資料、素材與授權全部揭露。
- [ ] 09:00 前完成表單並由第二位隊員做一次獨立權限檢查。

## 12. 稽核證據摘要

| 驗證 | 觀察結果 |
|---|---|
| GitHub metadata | `TingGeorge/AIL`：`PRIVATE`；default branch：`main` |
| Git 分歧 | `origin/main...HEAD`：main-only 14、HEAD-only 17；工作樹另有 8 個 modified 與 4 個 untracked 路徑 |
| Build | PASS，Vinext／Vite production build 完成，2 routes prerendered |
| TypeScript | PASS：`tsc --noEmit --incremental false` |
| Lint | FAIL：19 errors |
| Format | FAIL：78/84 files |
| Tests／CI | current MVP 無 test script、test file、CI |
| DB verification | PASS：integrity ok、0 foreign-key errors、seed rebuild 一致 |
| Data fitness | 2,247 restaurants，但 0 menu item、0 offer；183 YouBike assertions 當下 0 筆 fresh |
| 公開站桌面體驗 | 固定約 430 px 手機殼；reload 回 Welcome；狀態不保存 |
| 核心搜尋 QA | dinner 情境回傳已打烊市集、博物館、廟、YouBike，仍標「符合硬限制」 |
| 影片 | HTTP 可取得、1:56、無 CC；README 仍標「待上傳」 |

## 參考來源

- [BUILDMODE GEN-AI HACKATHON 2026 參賽者資訊站](https://hackathon2026.sitcon.org/)
- [作品繳交表單](https://forms.gle/dRoB2Ejkr9wGXrJP8)
- [ALL IN LIFE 評選影片](https://www.youtube.com/watch?v=HCBwSmCa1Yg)
- [專案 GitHub](https://github.com/TingGeorge/AIL)
- 本地證據：[README](../README.md)、[送件清單](../submission-checklist.md)、[MVP 主畫面](../mvp/app/page.tsx)、[CP engine](../mvp/lib/cp-engine.ts)、[MVP 規格](SPEC-all-in-life-mvp.md)、[API 整合計畫](API-integration-plan.md)

---

### 最後的評審話

你們目前最危險的錯覺，是把「完整畫面」當成「完整產品」。真正能進前 10 的版本，不需要 16 個畫面；它需要一個評審親眼看見、無法反駁的瞬間：**輸入限制後，AI 正確理解、規則確實拒絕錯誤選項、留下的每個推薦都能打開證據。**

先讓這個瞬間成立，再談 Team、Growth、全台擴張與商業模式。
