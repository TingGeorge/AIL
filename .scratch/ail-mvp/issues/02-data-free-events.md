# 02: 免費／公益資源與活動資料集

**What to build:** 補齊 Demo 情境 B 需要的兩類資料：免費／公益資源與活動。免費／公益資源全部是 free；活動要同時有 paid 與 free，讓同一個類別能示範「免費與付費並存」。

這兩類同時承擔三筆邊界資料：一筆 `valid_until` 已過期（搜尋時應退出主要排序並標示到期時間）、一筆同一來源自己前後矛盾（同一 `field` 兩筆互斥 evidence → `衝突待確認`）、一筆沒有 `address`（線上服務或電話申請，顯示但不做距離篩選）。

**Blocked by:** 01（匯入管線與 check-data 已經可跑）

**Status:** ready-for-agent

- [ ] `data/免費公益資源.json` 7–10 筆全部 `agent = free`，≥7 筆 `已驗證`，其中 ≥2 筆有登記或資格條件（`registration_required` 或 `eligibility` 非空）
- [ ] `data/活動.json` 7–10 筆，paid 與 free 都有，≥7 筆 `已驗證`
- [ ] 一筆 `valid_until` 已過期的紀錄存在
- [ ] 一筆同來源矛盾的紀錄：同一個 `source_url`、同一個 `field` 兩筆互斥 evidence、`data_status = 衝突待確認`
- [ ] 一筆 `address` 為 null 的紀錄存在
- [ ] 說出「這週末圓山區有沒有不用付費的活動或公共資源可以先登記」時，資料集裡有對應得上的可行解
- [ ] 重跑 import 後 `check-data.ts` 對這兩類的數量與摘錄檢查全過
