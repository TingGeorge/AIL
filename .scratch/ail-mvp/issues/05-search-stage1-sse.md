# 05: 搜尋第一階段與 SSE（成本排序）

**What to build:** 讓使用者按下「搜尋」之後看到的是資料庫裡的真實紀錄，而不是示範資料。伺服器收到需求與限制後跑一次 deterministic 的第一階段篩選：證據閘門（只有 `已驗證`、總可比成本算得出來、且未過 `valid_until` 的紀錄能過）加上硬限制（預算、只要免費、排除項目、需不需要先登記、Costco 會員開關），並統計每個限制各排除了幾筆。通過的依 (agent, category) 分組，先以可比總成本排序，每組完成推一個事件；沒過閘門的進「待確認」清單。

前端邊收邊畫：兩個 Agent 面板顯示「篩選硬限制（共用）→ 推薦排序 n/m 類」的進度，Dashboard 五類顯示真實紀錄，待確認清單另外呈現。結果為空時要說出是哪個限制造成的（例如「預算排除了 12 筆」），而不是只顯示「沒有結果」。示範資料退回成明確的 preview flag，不再是預設路徑。

第一階段的篩選與排序是純函式，不需要資料庫就能測。`people_or_servings`、`date`、`time_window`、`eligibility_notes` 這幾個維持文字、只顯示與交給 LLM，不做機器篩選 — 紀錄裡沒有對應的結構化欄位。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `POST /api/search` 接受需求與限制、排除項目與（可為 null 的）位置，回傳 SSE：filter 事件（found／passed／pending／各限制的 excluded_by）、每個 (agent, category) 的 ranking／done 事件、最後的 done 事件帶待確認清單
- [ ] 新路由掛在 static 的 catch-all 之前（否則會被靜態檔案接走、回 200 + index.html）
- [ ] 資料庫連線維持 lazy：不需要資料庫的既有測試仍然全過
- [ ] 過期紀錄（`valid_until < now()`）在查詢當下被判定，不進主要排序，落到待確認
- [ ] 前端 Dashboard、詳情頁、清單頁改吃 SSE 來的紀錄；示範資料只在明確開啟 preview 時出現
- [ ] 主要排序在同成本時的次序穩定；生存模式開啟時免費項目排前面
- [ ] 空結果畫面說明是哪一個限制排除最多筆，並提供放寬該限制的入口
- [ ] 純函式測試涵蓋：證據閘門、各硬限制的排除計數、排序次序
