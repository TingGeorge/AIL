# `codex/all-in-life-backend-plan` 與 `origin/main` 現況比較

> 比對時間：2026-09-06（Asia/Taipei）
>
> `origin/main`：`d86f918d9b06`
>
> 本分支實作 checkpoint：`534fcf9618ea`（本次文件／帳號統整 commit 尚未計入）
>
> 共同祖先：`d8e2f3835e41bc0b51f8f2c17690853cbb0f6bf8`

## 結論

兩個分支已成為兩套完整但不同的 runtime。`origin/main` 是 Bun、Hono、React、PostgreSQL、Zod 與 Gemini 的正式主線；目前分支是 npm、Vinext、Cloudflare D1 與 OpenAI Responses API 的手機 PWA／Sites 展示線。兩邊都已有搜尋、帳號與真實資料能力，但資料模型、AI provider、密碼演算法、部署平台與 UI 架構都不同，現在不適合直接 merge 後同時保留兩套入口。

本次應先把目前分支完整 push 作為可回復 checkpoint，不直接合併 `main`。後續由團隊明確選定單一正式 runtime，再以 PR 選擇性移植視覺、PWA、資料證據與測試；不要把兩套 lockfile、資料庫與 auth 實作硬疊在一起。

## 分支狀態

在本次文件 commit 前，`git rev-list --left-right --count origin/main...HEAD` 為：

| Main-only commits | Branch-only commits | 判讀 |
| ---: | ---: | --- |
| 34 | 20 | 兩邊都已長期分歧；不是單純「分支忘了 push」 |

目前分支在開始本輪整理時只比自己的遠端 tracking branch 多 1 個已提交 checkpoint，但另有帳號持久化、UI、E2E 與文件更新尚未提交，因此現在 push 是必要的。push 後仍只更新 `codex/all-in-life-backend-plan`，不會改動 `main`。

## 快速比較

| 面向 | `origin/main` | `codex/all-in-life-backend-plan` | 建議 |
| --- | --- | --- | --- |
| 唯一 App 入口 | `prototype-v1/` | `mvp/` | 送件表單只能指向一個；不要讓評審自行猜測 |
| Runtime | Bun 1.4、Hono、Vite、React | Node 22、npm、Vinext、Cloudflare Vite plugin、React | 不共用 package manager 或 build 指令 |
| 資料庫 | PostgreSQL | Cloudflare D1／SQLite | 先選正式部署平台，再決定 migration 主線 |
| AI | Google Gemini native Interactions API | OpenAI Responses API | 保留共同 contract 與 deterministic guard；provider 只放 server adapter |
| 結構化輸入 | Zod client/server schema | 自製 strict runtime contract | 可移植 main 的 Zod schema 思路，但不可直接混用 provider payload |
| 搜尋 | PostgreSQL、hard filter、AI ranking、SSE | D1／snapshot、hard filter、Evidence Gate、CP engine、AI reason codes | 以「AI 不改寫事實」為共同底線 |
| 真實資料 | 139 筆研究快照；136 可比較、3 待確認 | 14-source importer；2,984 地點與 9,317 evidence assertions | main 較精簡，分支較重稽核；統一 canonical ID 與 freshness 後再移植 |
| 帳號 | Argon2id、opaque session、PostgreSQL | PBKDF2-SHA256 210k、hashed bearer session、D1 | 不可混用 credential table；若遷移需強制重新登入／逐步 rehash |
| 個人功能 | 收藏、清單、預算、支出、團體 membership、回報 | 清單、收藏、預算、歷史以 account state envelope 保存 | main 的領域資料表較細；分支適合快速展示 |
| Team | 已保存必要 membership record；不付款、不代訂 | UI／schema／成本比較，尚無交易式後端 | 正式產品優先沿用 main 的明確 membership 邊界 |
| PWA／視覺 | manifest、service worker、精簡正式 UI | 16 畫面、3D 首頁、分類 rail、PWA、離線音樂、深淺主題 | 可從分支移植品牌與 interaction，不搬整個 runtime |
| 測試 | README 記錄 269 pass、30 skip、4 fail | 58 unit／contract + 21 Playwright E2E，全綠 | main 需先修 4 個契約差異；分支保留 E2E coverage |
| 部署 | 主線目前以本機／ngrok 說明為主 | Sites 公開基準版；本分支帳號 migration 待再部署 | 公開 URL 必須標示實際對應 commit／runtime |
| License／notices | MIT + `THIRD_PARTY_NOTICES.md`（Gemini／`prototype-v1`） | 同一份 MIT；第三方服務、資料與素材逐項揭露於 README | 合併時依最終 runtime 整理同一份 notice，不可把 Gemini 說明直接套到 OpenAI 實作 |

## 已完成的共同產品底線

- 匿名可以直接探索，登入才保存個人資料。
- 自然語言只負責整理需求；價格、距離、資格、時間與 CP 判斷必須回到可信資料與確定性規則。
- 真實資料與 Demo fixture 分離，未知值不推定為零。
- 團體優惠只表示加入意願或 membership，不代表付款、代訂或商家承諾。
- PWA 不快取 API、帳號內容或跨來源地圖資料。
- API key 只存在 server-side secret，不進前端 bundle 或 Git。

## 值得從目前分支移植到主線

1. 首頁品牌敘事、3D 指南針、粒子、打字機與使用者可關閉的背景音樂。
2. 五類橫向拖曳分類、手機安全區、固定底部導覽與一致的 icon／文字對齊規則。
3. Evidence Gate、verification field copy、未知價格與過期即時值的 UI 語意。
4. Archify 可互動架構／流程圖與多 viewport 視覺驗證方式。
5. Playwright 的匿名流程、帳號持久化、登出 401、窄螢幕與背景音樂測試。

## 值得從主線移植到目前分支

1. 將大型 `page.tsx` 拆成 client feature components，建立可深連結、可返回的 URL navigation。
2. 使用共用 Zod schema 驗證 client/server input，而不是只依賴 TypeScript 型別。
3. 把 account state envelope 拆成收藏、清單、支出與 group membership 領域資料表，加入併發版本與細粒度 owner check。
4. 引入 CI 並把 lint、typecheck、unit、E2E、build 與 secret scan 設成 blocking gates。
5. 將公開部署與 commit SHA、migration version、資料 snapshot version 綁定，避免「公開站」與本機分支版本混淆。

## 合併模擬結果

2026-09-06 對本分支實作 checkpoint `534fcf9618ea` 與最新 `origin/main` 執行不改動工作樹的 `git merge-tree --write-tree --messages`，確認有以下文字衝突：

- `.gitignore`：兩套 runtime、secret 與 build cache 規則不同。
- `README.md`：兩邊皆新增且各自把不同 runtime 宣告為正式入口，形成 add/add conflict。
- `docs/PRD-all-in-life.md`：產品流程與技術邊界皆已分歧。
- `submission-checklist.md`：兩邊皆新增，驗證狀態不同，形成 add/add conflict。

此外，即使 Git 不標示衝突，`prototype-v1/` 與 `mvp/` 同時存在仍會造成架構與送件入口衝突。安全整合方式是：

1. 從最新 `main` 開整合 PR。
2. 先決定唯一 runtime、資料庫與 AI provider。
3. 以功能為單位移植，不 merge 整個 App 目錄。
4. 每次移植後重跑該 runtime 的完整 gates。
5. 最後再更新根 README、公開 URL 與送件表單。

## 圖與文件

- [目前分支互動式系統架構](architecture/all-in-life-architecture.html)
- [目前分支互動式產品流程](architecture/all-in-life-product-flow.html)
- [目前分支送件規格](../SPEC.md)
- [目前分支 API／D1 計畫](API-integration-plan.md)
- [`origin/main` README（GitHub）](https://github.com/TingGeorge/AIL/blob/main/README.md)
