# `codex/all-in-life-backend-plan` → `main` 精選整合

日期：2026-09-06。比較基準：`origin/main@d86f918` 與 `origin/codex/all-in-life-backend-plan@c1c22f4`。

## 決策

不直接合併兩套應用。`main` 繼續作為唯一 runtime，保留 Bun、Hono、React/Vite、PostgreSQL、Zod 與 Gemini native Interactions API；另一分支只移植能提高展示力、可讀性與匿名使用體驗的部分。

| 項目 | 決策 | main 整合結果 |
|---|---|---|
| AILI 品牌首頁 | 融入 | ALL IN 理念、慢速循環打字、立體指南針、金錢雨；入口固定暗色 |
| 字級、對比、icon 對齊 | 融入並重整 | 關鍵資訊建立 11px 以上可讀下限，修正圖示 baseline，保留 reduced-motion |
| 五類分類列 | 融入 | 單排水平捲動、觸控拖曳與 scroll snap；仍接 main 的真實 category/數量 |
| 訪客收藏／清單 | 融入但改用 main 契約 | localStorage 暫存；登入後聯集合併 `list`／`favs`，不覆蓋帳號設定 |
| 結果與詳情提示 | 融入 | 顯示份量、pending 原因、必要條件及 demo 安全警告 |
| PWA 品牌 icon | 融入 | AILI 192/512/maskable icons，更新 app-shell cache 版本 |
| Vinext／Cloudflare D1 | 不融入 | 與 main 的 Bun/Hono/PostgreSQL 重複且資料契約不同 |
| OpenAI adapter／前端假資料 | 不融入 | main 已採 Gemini native API 與 PostgreSQL 證據資料 |
| 明示「DEMO 模擬」的大段影片干擾文案 | 不融入 | demo 只在需要防誤用的結果／詳情位置明示，不污染品牌入口 |

## 不變的安全邊界

- AI 只能排序伺服器提供的候選，不能新增或捏造商品、活動或公益資源。
- 未知成本、份量、資格與時段不猜測；保留 pending 或排除原因。
- 登記團購只代表意願，不付款、不代訂、不代替商家確認。
- service worker 不快取 API、帳號內容或搜尋結果。
- 語音、逐字稿、Need 與精確位置不寫入帳號資料。

## 驗證

- `bun run typecheck`：PASS
- `bun run build`：PASS
- `bun run data:validate`：PASS
- 新增／受影響測試：PASS
- 離線全套：279 pass、30 skip、3 個受目前執行環境子行程限制的導覽測試待 CI 判定（312 tests／38 files）
- 互動式 [main 系統架構](architecture/all-in-life-main-architecture.html) 與 [探索／同步流程](architecture/all-in-life-product-flow.html)：showcase 9/9、瀏覽器 containment/readability PASS
