# 01: 匯入管線與食品資料集

**What to build:** 讓「人工蒐集的候選紀錄」真的進得了資料庫，並以食品類走完第一條完整路徑。開發者把蒐集到的食品候選紀錄寫成 `data/食品.json`，跑 `scripts/import.ts` 後資料庫裡就有可查詢的 candidates，跑 `scripts/check-data.ts` 會逐條檢查並印出哪一筆不合格。匯入腳本可重跑，不會產生重複列，也不會刪掉任何東西。

食品類要有 8–10 筆，其中至少 7 筆 `data_status = 已驗證`，並且要包含 Demo 情境 A（2 人、NT$300 內、步行 20 分鐘內）的可行解、同一家店兩個來源的兩筆獨立紀錄（SPEC-ingestion §6.1）、以及一筆沒有 `baseline` 的紀錄。

欄位契約、可空規則、證據規則與 `data_status` 決策表以 SPEC-ingestion §4–§6 為準；`lat`／`lng` 一律留 null，由 04 的腳本補。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `bun run scripts/import.ts` 讀 `data/*.json`，以 `id` upsert 進 candidates；連跑兩次列數不變、內容一致
- [ ] `data/食品.json` 有 8–10 筆，≥7 筆為 `已驗證`，每筆 `價格`／`份量`／`時間` 各至少一條 evidence 摘錄；有 `eligibility` 加 `資格`、有 `address` 加 `地點`
- [ ] 同一家店的兩個來源寫成兩筆各自 `已驗證` 的紀錄，`title` 看得出差別，各帶自己的 `source_url`、`source_authority` 與摘錄；沒有做任何合併
- [ ] 至少一筆 `baseline` 為 null（供 11 驗證「無足夠資料計算節省」）
- [ ] 所有 `lat`／`lng` 為 null，`price_total_twd` 未知的一律 null（不填 0），`tags` 未標示的一律 null（不填 `[]`）
- [ ] `scripts/check-data.ts` 實作 SPEC-ingestion §9 的七條檢查，失敗時印出 id 與原因並 `exit(1)`；此時食品類全過，其餘四類以「數量不足」列在輸出中
