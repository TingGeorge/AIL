# ALL in life · try-muse UI 展示版

單一檔案 `index.html`，零依賴、無後端，直接用瀏覽器開啟（或 `python3 -m http.server`）即可走完 Demo。

對照設計稿（黑底＋螢光黃 `#e4ff1a` 粗黑體卡片風）與 `docs/` 全套規格：

- 需求 → 確認（逐字稿、解析欄位、未解析內容、修正語句）→ 獵人出動（第一階段篩選＋雙 Agent 進度）
  → 五類 Dashboard（食品／日用品／免費／公益資源／活動／交通）→ 詳情（成本拆解、節省、揪團兌換碼、證據、回報）
  → 生活預算（月預算／已花費／生存模式／排除項目／偏好／Costco 會員開關／定位）→ 註冊／登入／修改密碼
- 邏輯對齊 `prototype-v1/src/shared/records.ts`：總可比成本、證據閘門、硬限制＋`excluded_by`、
  `haversine` 直線估算（步行每分鐘 80 公尺）、`valid_until` 過期退出、`?check=1` 內建 14 項 self-check 斷言
- 帳號是前端模擬（`localStorage`＋簡易雜湊＋30 分鐘 token），展示匿名→登入→清單／收藏／回報閉環；
  真實後端契約見 `docs/SPEC-backend.md`、`docs/SPEC-voice-input.md`

展示用示範資料（15 筆：食品 4、日用品 3、免費 3、活動 3、交通 2，含未知價格／過期／衝突／Costco 會員邊界案例）為虛構，
僅供流程展示；真實 Demo 資料以來源頁面與 `docs/SPEC-ingestion.md` 驗收為準。

驗證：`open index.html?check=1` 應顯示 `self-check：14/14 通過`。
