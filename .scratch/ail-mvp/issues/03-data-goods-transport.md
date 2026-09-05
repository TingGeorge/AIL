# 03: 日用品與交通資料集

**What to build:** 補齊最後兩類資料，讓五類 Dashboard 每一格都有東西。日用品全部 paid，至少一筆需要 Costco 會員（`eligibility` 含 `Costco 會員`）並以 `basis = costco` 的基準示範節省計算；交通多數 paid。

這兩類承擔最後一筆邊界資料：一筆 `price_total_twd = null`（未知價格 → `無法納入比較` → 只出現在待確認清單）。做完這張票，`check-data.ts` 應該全綠。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `data/日用品.json` 7–8 筆全部 paid，≥7 筆 `已驗證`；至少一筆 `eligibility` 含 `Costco 會員` 且有 `basis = costco` 的 `baseline`
- [ ] `data/交通.json` 7–8 筆，≥7 筆 `已驗證`
- [ ] 一筆 `price_total_twd = null` 的紀錄存在且 `data_status = 無法納入比較`
- [ ] `bun run scripts/check-data.ts` 全過並 `exit(0)`：五類各 ≥7 筆已驗證、必要摘錄齊全、沒有 0 元卻標 paid 的列、`tags` 規則、座標範圍、六筆邊界資料都在、`source_url` 全為 https
