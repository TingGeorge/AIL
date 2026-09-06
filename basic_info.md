# BUILDMODE 2026 送件基本資料（草稿）

本文件依 `submission-checklist.md` 的順序整理目前已有資料。  
`⏸` 代表依目前指示暫不處理；`🟡` 代表已有部分內容但送出前仍要補確認；`🔴` 代表目前缺件。

> 注意：這份檔案是送件資料草稿，包含隊員姓名。隊員原始 email／電話只留在原始截圖，不放進公共程式碼儲存庫。下方圖片是已遮罩聯絡資料的版本。

## 1. 隊伍資料

### 1.1 隊伍編號、隊名、成員與主要聯絡人

- 隊伍編號：待填
- 隊名：比奇堡的海底世界
- 主要聯絡人：丁肇志（Ting，隊長）
- 聯絡 email／電話：送件表單填寫原始資料；不放入公共儲存庫


| 姓名         | 活動暱稱     | 身分／分工    |
| ---------- | -------- | -------- |
| 丁肇志        | Ting     | 隊長、主要聯絡人 |
| 林軒緯        | 緯        | 待補       |
| Andrew Fai | AF       | 待補       |
| 楊杰倫        | Jay Yang | 待補       |


#### 隊伍資訊圖片

隊伍資訊（隊伍編號已遮罩）

#### 隊員資料圖片

隊員資料一（已遮罩 email 與電話）隊員資料二（已遮罩 email 與電話）

### 1.2 主賽道

- **AI for Everyday Life／日常生活 AI**
- 賽道說明：打造改善日常生活、學習、溝通、購物、旅行或健康體驗的 AI 產品。

主賽道：AI for Everyday Life／日常生活 AI

### 1.3 Sponsor Challenge／Bounty

- Sponsor Challenge／Bounty：無
- 狀態：已確認不參加，不勾選任何 Sponsor Challenge／Bounty。

### 1.4 專案名稱與摘要

**專案名稱：**  
**ALL IN LIFE｜讓每個生活選擇都有依據**

**摘要（181 字，不含空白，符合 100–200 字要求）：**

> ALL IN LIFE 是一個用 AI 協助人們做日常選擇的工具。使用者告訴系統預算、飲食偏好、人數與可用時間，就能探索附近值得花錢的選項與符合條件的免費資源。系統不只比較標價，也整理份量、費用、往返、等待、資格與報名條件，保留來源證據，讓使用者先看清楚，再選擇適合自己的路。透過清單、預算與團體優惠，ALL IN LIFE 幫助人們省下金錢、時間與腦力，把專注留給重要的生活。

## 2. 程式碼與文件

以下對應 `submission-checklist.md` 的「程式碼與文件」。依目前指示，第 1、2 項先不處理；第 3–6 項已整理如下。

### 2.1 GitHub／GitLab 儲存庫可由無痕視窗直接開啟

⏸ 依指示暫不處理。

### 2.2 儲存庫包含可辨識的實作內容

⏸ 依指示暫不處理。

### 2.3 README 包含問題、功能、架構、技術、執行方式與限制

✅ **已有內容，可作為送件說明基礎。**

- 問題與產品定位：`README.md` 開頭說明以來源證據、真實成本與限制協助使用者尋找生活選項。
- 核心功能：`README.md` 的「已實作功能」列出文字／語音需求、五類資料搜尋、結果詳情、帳號、收藏、清單、預算、回報、團體優惠與 PWA。
- 架構與技術：目前正式應用在 `prototype-v1/`，使用 Bun、Hono、React、Vite、PostgreSQL、Zod 與 Google Gemini；前端、API、資料匯入與資料庫邊界可由 `README.md`、`prototype-v1/src/client/`、`prototype-v1/src/server/` 和 `prototype-v1/scripts/` 交叉確認。
- 執行方式：`README.md` 已提供安裝、環境變數、資料驗證、資料匯入、開發與 production 啟動指令。
- 限制：`README.md` 已揭露資料是日期化研究快照、不是即時價格／庫存保證，且目前測試仍有既知 UI contract failures。

送件前建議再把以上內容濃縮成 README 的明確小節，讓評審不需要從目錄反查。

### 2.4 已加入明確的 LICENSE 檔案

✅ **已完成。**

根目錄已加入 `LICENSE`，採用 **MIT License**；著作權標示為 `2026 比奇堡的海底世界`。

### 2.5 第三方套件、模型、資料與素材的來源及授權已揭露

🟡 **來源已有紀錄，授權揭露尚未完全收口。**


| 類型       | 目前使用內容                                                           | 證據／來源                                                                                                   |
| -------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| AI 模型與服務 | Google Gemini native Interactions API                            | `prototype-v1/src/server/gemini.ts`；API key 僅由 server-side 環境變數讀取                                       |
| 開源套件     | Bun、React、React DOM、Vite、Hono、Zod、lucide-react、busboy、TypeScript | `prototype-v1/package.json`、`prototype-v1/package-lock.json`                                            |
| 研究資料     | 食品、日用品、公益資源、活動、交通等公開資料                                           | `docs/research/README.md`、`docs/research/*-sources.md`、`prototype-v1/data/live/*.json`；各筆資料保留來源 URL 與證據 |
| 專案授權     | MIT License                                                      | 根目錄 `LICENSE`                                                                                           |


送件前仍要補：第三方套件的完整授權清單，以及 Gemini 服務條款／使用限制。

### 2.6 儲存庫內沒有 API Key、Token、密碼或個人資料

🟡 **程式碼部分未發現應提交的 API key／token／密碼；送件資料需與公共儲存庫分開。**

- `GEMINI_API_KEY`、`DATABASE_URL` 等設定應只放在本機 `.env` 或部署平台 secret，不可寫入 Markdown、圖片或 source code。
- `basic_info.md` 是送件用資料，包含隊員姓名；不要把它當成公開程式碼文件直接提交。
- `submission-assets/` 的隊員圖只保留遮罩版；原始含 email／電話的截圖不要複製到儲存庫。
- 因此本項在公開儲存庫送出前仍需做最後一次 secret／個資掃描，現在不能直接勾選完成。

## 3. 作品展示與影片

依目前指示先略過，不在本輪填寫：

- 作品展示網址
- 評選影片
- YouTube 權限、聲音、字幕與備援影片確認

## 4. 送出前

依目前指示先略過：

- 表單連結再次開啟測試
- 送出成功畫面或確認信
- 截止前連結與權限問題的預留時間

