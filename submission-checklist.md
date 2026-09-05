# BUILDMODE 2026 作品繳交檢查表 — ALL in Life

> 更新日期：2026-09-05。`[x]` 代表可由目前儲存庫確認；`[ ]` 代表仍需團隊、部署平台或送件表單確認。建議全隊在截止前至少 30 分鐘完成最後一輪。

## 目前關鍵缺口

- [ ] 根目錄加入由專案權利人確認的 `LICENSE`。
- [ ] 補上可由無痕視窗開啟的正式 repo／展示網址。
- [ ] 錄製、校對並上傳不超過 2:00 的評選影片。
- [ ] 將 Demo fixture 與真實即時資料的界線在影片口播中說清楚。
- [ ] 確認隊伍編號、隊名、成員、聯絡人、賽道與 Sponsor Challenge。

## 隊伍與送件資料

- [ ] 隊伍編號與正式隊名已確認
- [ ] 所有成員姓名、顯示方式與主要聯絡人正確
- [ ] README 的成員分工已由 Ting、Jay 與團隊確認
- [ ] 已選擇一條主賽道
- [ ] 僅勾選實際符合條件的 Sponsor Challenge／Bounty
- [ ] 專案名稱統一使用「ALL in Life」
- [ ] 100–200 字摘要已校對，且沒有把 Demo fixture 寫成即時資料
- [ ] 送件表單中的 repo、展示網址、影片網址與 README 完全一致

## 儲存庫與分支

- [x] Git 遠端指向 `https://github.com/TingGeorge/AIL.git`
- [x] 功能分支使用明確名稱 `codex/all-in-life-mvp`
- [x] 根目錄有完整 `README.md`
- [x] 根目錄有送件檢查表 `submission-checklist.md`
- [x] 主要產品、UI 與技術規格位於 `docs/`
- [x] 前端、CP engine、D1 schema 與素材有可辨識的實作內容
- [ ] 以 GitHub 無痕／登出狀態確認儲存庫可直接開啟
- [ ] 確認功能分支是否需要 merge / PR 到最新 `main`
- [ ] 合併前處理功能分支相對 `origin/main` 落後的提交，並重新跑完整驗證
- [ ] GitHub 預設分支、分支保護與 PR 狀態符合團隊送件策略
- [ ] 刪除不需要送件的大型產物或壓縮檔，並確認 repo 大小可接受
- [ ] 最終提交後確認 `git status` 乾淨、remote commit SHA 正確

## README 完整性

- [x] 說明問題、目標使用者與預期價值
- [x] 列出核心功能與三條 Demo 路徑
- [x] 明確區分可操作功能、部分完成項目與目標架構
- [x] 附上系統架構圖與資料處理流程
- [x] 說明前端、CP engine、D1、Workers、R2、Google Maps 與 Agent 的角色
- [x] 提供 Node.js 版本、安裝、本機啟動、LAN 測試、lint 與 build 指令
- [x] 列出專案結構、限制與下一步
- [x] 揭露第三方套件、地圖、公開資料、字型、icons 與 fixture
- [x] 說明不應提交金鑰、Token、密碼或個資
- [ ] 補上正式展示網址
- [ ] 補上評選影片網址
- [ ] 團隊確認成員真實姓名與最終分工
- [ ] 選定授權後更新 README 的 License 段落

## 程式碼與功能驗證

- [x] 手機 App shell 限制在 430 px 內，桌面以裝置外框呈現
- [x] Home、Search、Results、Detail、Saved、Team、Settings、Map 有獨立畫面切換感
- [x] Bottom navigation、收藏、checkbox 清單、篩選、排序、設定與揪團進度可互動
- [x] 使用者畫面未顯示 `DEMO`、`fixture` 或 `MVP` 字樣
- [x] README 已加入架構圖、流程圖與 branch comparison 超連結
- [ ] 在乾淨環境執行 `cd mvp && npm ci`
- [ ] 執行 `npm run lint` 且無 error
- [ ] 執行 `npm run build` 且成功產生 `mvp/dist/`
- [ ] 執行 `npm run start`，確認 production build 可啟動
- [ ] Chrome / Edge 桌面版完成 smoke test
- [ ] 320 px 手機寬度沒有橫向捲動、遮擋或不可點擊區域
- [ ] Tablet 與 ≥1200 px desktop layout 可讀且不失真
- [ ] 「省錢晚餐」可完成輸入 → 搜尋 → 排序 → evidence → 地圖流程
- [ ] 「Team 團購」正確顯示人數門檻與未成團條件
- [ ] 「白嫖一天」不把未知交通、時間或資格誤寫為零
- [ ] 硬限制、軟偏好、預算、人數與月度 runway 操作正常
- [ ] CP Value 分數、coverage、reliability 與 evidence gate 顯示合理
- [ ] 官方來源連結可開啟，且查核日期／適用條件仍有效
- [ ] Google Maps embed 失敗時仍可用外部連結或清單
- [ ] 支援的瀏覽器可使用繁中語音輸入；不支援時有文字 fallback
- [ ] 收藏、選取、Dialog、Tabs、mobile navigation 與返回操作正常
- [ ] 所有 fixture 都有 `Demo`、`Fixture`、`未查核` 或等價標示
- [ ] 沒有把 schema、規格或 mock UI 誤稱為已上線後端功能

## PWA、資料與部署

- [x] 已提供 web app manifest 與 SVG app icons
- [x] 已建立 service worker 檔案
- [ ] 在 app 中註冊 service worker，或在送件說明中維持「尚未完成」標示
- [ ] 用瀏覽器 DevTools 驗證 manifest、icons 與 installability
- [ ] 驗證離線 fallback，不 cache Google map tiles 或受限制的 Places content
- [ ] 建立正式 Cloudflare / OpenAI Sites deployment
- [ ] 若啟用 D1：建立 binding、執行 migration、準備 seed 與 rollback / backup
- [ ] 若啟用 R2：確認 evidence retention、刪除與存取權限政策
- [ ] 若啟用 Google API：限制 website / API、設定 quota / budget alert，避免 key 外洩
- [ ] 若啟用 AI 模型：文件列出模型、用途、資料傳輸與失敗 fallback
- [ ] production 環境未暴露 source map、secret、debug endpoint 或管理介面
- [ ] 展示站可由無痕視窗直接開啟，不依賴團隊帳號或本機 cookie

## 安全、隱私與授權

- [ ] 根目錄有明確 `LICENSE`，且 README 的授權名稱一致
- [x] `.gitignore` 排除 `.env*`、build output、Wrangler 狀態與 debug log
- [ ] 用 secret scanner 或人工複核確認歷史與目前 tree 都沒有 API Key、Token、密碼
- [ ] 確認 repo 沒有真實個資、未授權收據、位置紀錄或使用者照片
- [ ] 第三方模型、資料、圖片、字型、icons 與素材皆有來源與允許的使用方式
- [ ] Google Maps / Places attribution、儲存與 cache 行為符合其條款
- [ ] Community report 上線前具備 moderation、申訴、隱私與濫用防護
- [ ] Team invite token 僅儲存 hash，且具有效期、撤銷與使用次數限制
- [ ] 食安或安全事件不以未驗證社群回報當成已確認事實

## 架構與文件驗證

- [x] 架構 PNG 可直接在 README 顯示
- [x] `docs/architecture/` 保存可檢視 HTML 與原始 JSON
- [x] D1 schema 有 primary key、foreign key、check constraint 與常用 index
- [x] 技術規格記錄 evidence、freshness、CP policy 與 P0/P1/P2 邊界
- [ ] 架構圖文字與實際部署狀態再次比對
- [ ] README、PRD、SPEC 與畫面名稱統一
- [ ] 所有相對連結在 GitHub 預覽中可開啟
- [ ] 圖片在 GitHub README 的 light / dark theme 下仍清楚可讀

## 作品展示與影片

- [ ] 公開展示網址已部署並填入 README
- [ ] 用無痕視窗與手機行動網路確認展示站可直接開啟
- [ ] 評選影片長度不超過 2:00
- [ ] YouTube 影片設為「知道連結即可觀看」，不是私人影片
- [ ] README 與送件表單已填入相同影片網址
- [ ] 影片前 15 秒說清楚問題、使用者與價值
- [ ] 影片實際操作三條路徑中至少兩條
- [ ] 影片展示來源／證據與 CP 分數，不只展示視覺效果
- [ ] 影片口頭說明 fixture、未上線後端與正式資料的界線
- [ ] 影片聲音、字幕、解析度、游標與手機畫面可辨識
- [ ] 沒有錄到 API key、通知、私人分頁、帳號、Email 或其他個資
- [ ] 已準備本機備援影片、關鍵流程截圖與離線口述方案

## 最終送出前 30 分鐘

- [ ] 停止非必要功能修改，只處理送件阻塞問題
- [ ] 從全新 clone 依 README 重現安裝、lint、build 與啟動
- [ ] 逐一開啟 repo、展示站、影片、來源與表單連結
- [ ] 複核 GitHub branch / commit SHA 與實際部署版本相同
- [ ] 複核主賽道與 Sponsor Challenge 沒有多勾或漏勾
- [ ] 由非開發成員照 README 完成一次操作
- [ ] 保留送出成功畫面、時間戳或確認信
- [ ] 將最終網址與 commit SHA 貼到團隊共同頻道
- [ ] 截止前預留至少 30 分鐘處理權限、快取、連結與影片問題

## 最終簽核

| 項目 | 負責人 | 完成時間 | 備註 |
| --- | --- | --- | --- |
| Repo / branch / commit |  |  |  |
| README / License / attribution |  |  |  |
| Lint / build / smoke test |  |  |  |
| 展示站與無痕測試 |  |  |  |
| 2:00 影片與字幕 |  |  |  |
| 表單、賽道與 Sponsor 選項 |  |  |  |
| 最終送出確認 |  |  |  |
