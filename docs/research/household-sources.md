# 日用品候選來源研究：圓山使用情境

- 研究日期：2026-09-05（Asia/Taipei）
- 核實時間：2026-09-05T16:08:57+08:00
- research batch：`yuanshan-2026-09-05`
- 產出：`prototype-v1/data/live/日用品.json`

## 結論與範圍

本批建立 7 筆可納入價格比較的日用品候選，全部來自 IKEA 台灣官方商品頁，均按「線上購買＋超商取貨」履約，不是圓山周邊門市庫存。商品頁於核實時顯示「有庫存於線上購物」，並個別明示「適用超商取貨，運費$59/箱」。因此每筆以單一商品單獨占一箱為比較基準，`mandatory_fees_twd` 填 59；沒有把多品項合箱後的運費分攤假設成已知。

研究優先查找圓山周邊可取得選項，但未取得足以同時支持店別售價、店別即時庫存、必要費用與營業時間的第一手證據，因此未把附近商家硬標成 `已驗證`。本批也不以線上庫存冒充圓山或台北城市店現貨。

## 證據門檻與處理方式

- 只採官方／商家第一手商品頁作為價格、份量、線上庫存及本品運費證據。
- 每筆只保留一則「價格」、一則「份量」、一則「時間」摘錄，避免同欄位重複 evidence 被 ingestion 規則判為來源內部衝突。
- 商品頁未明示價格有效期限，故 `valid_until: null`；蒐集時間不當成有效期限。
- 所有紀錄 `address`、`lat`、`lng` 均為 `null`，不做距離篩選；`extra.source_coordinates` 整體也維持 `null`，因本批沒有實體履約地點可驗證。
- 來源未列需符合的會員資格，故 `eligibility: []`；比較未套會員價或會員折扣。
- 庫存量每 30 分鐘更新，紀錄只主張核實當下「有庫存於線上購物」，不把數量快照當持續保證，下單前必須重查。

## 已納入候選

| ID | 官方商品 | 商品價 | 必要費用 | 份量／規格 | 核實時可取得性 | 官方來源 |
|---|---|---:|---:|---|---|---|
| `d_ik01` | BÄSTIS 毛絮黏把, 灰色, 22 公分 | NT$29 | NT$59／箱 | 1支；膠紙總長7.5公尺 | 線上有庫存；超商取貨 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/bastis-art-70425627 |
| `d_ik02` | PEPPRIG 超細纖維抹布, 綠色 藍色/黃色, 28x28 公分 | NT$59 | NT$59／箱 | 3件裝；每件28x28公分 | 線上有庫存；超商取貨 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-20567638 |
| `d_ik03` | BÄSTIS 毛絮黏把補充包, 1100 公分 | NT$69 | NT$59／箱 | 4捲；每捲11公尺，共44公尺 | 線上有庫存；超商取貨 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/bastis-art-70147758 |
| `d_ik04` | LILLNAGGEN 水漬刮刀, 黑色 | NT$39 | NT$59／箱 | 1件；寬25.5公分 | 線上有庫存；超商取貨 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/lillnaggen-art-40435406 |
| `d_ik05` | PEPPRIG 毛絮黏把補充包 | NT$79 | NT$59／箱 | 2件裝 | 線上有庫存；超商取貨 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-60527080 |
| `d_ik06` | PEPPRIG 畚箕/刷子, 黃色 | NT$59 | NT$59／箱 | 畚箕及刷子1組 | 線上有庫存；超商取貨 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-60533552 |
| `d_ik07` | PEPPRIG 附蓋萬用桶 3件組, 灰色/藍色 | NT$249 | NT$59／箱 | 3件組 | 線上有庫存；超商取貨 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-30567614 |

## 短來源摘錄

以下摘錄只保留 gate 所需資訊，完整上下文以官方商品頁為準。

- `d_ik01`：價格「$29 / 7.5公尺」；份量「22公分；總長度7.5公尺」；時間／庫存「有庫存於線上購物；庫存量每30分鐘更新一次」；履約費「適用超商取貨，運費$59/箱」。核實：2026-09-05T16:08:57+08:00。
- `d_ik02`：價格「$59 / 3件裝」；份量「28x28公分，3件裝」；時間／庫存同上；履約費「運費$59/箱」。核實：2026-09-05T16:08:57+08:00。
- `d_ik03`：價格「$69 / 44公尺」；份量「包裝數量4件；每捲11公尺，總長度44公尺」；時間／庫存同上；履約費「運費$59/箱」。核實：2026-09-05T16:08:57+08:00。
- `d_ik04`：價格「$39」；份量「寬度25.5公分」；時間／庫存同上；履約費「運費$59/箱」。核實：2026-09-05T16:08:57+08:00。
- `d_ik05`：價格「$79 / 2件裝」；份量「2件裝」；時間／庫存同上；履約費「運費$59/箱」。核實：2026-09-05T16:08:57+08:00。
- `d_ik06`：價格「$59」；份量「畚箕/刷子1組」；時間／庫存同上；履約費「運費$59/箱」。核實：2026-09-05T16:08:57+08:00。
- `d_ik07`：價格「$249」；份量「附蓋萬用桶3件組」；時間／庫存同上；履約費「運費$59/箱」。核實：2026-09-05T16:08:57+08:00。

## 費用、資格與履約限制

`mandatory_fees_twd: 59` 僅代表各商品頁明示的超商取貨運費 59 元／箱。比較情境是「只買該筆商品、單獨一箱」；如果實際購物車可合箱、超出箱材限制、改選宅配，最終費用可能不同，必須以下單頁為準。沒有來源證據支持的最低消費、會員費或其他必要費用未被自行新增，也未以 0 假裝已知。

IKEA 的一般運送服務頁另有宅配服務與區域說明，但本批沒有把一般配送費率或「3日內到府」套用到超商取貨紀錄，因兩者不是同一履約基準：

- https://www.ikea.com.tw/zh/customerservice/about-service/delivery

## Costco baseline

7 筆均未找到可證明為「完全同 SKU、完全同份量」的 Costco 官方可比品，因此全部 `baseline: null`。不以相似毛絮黏把、抹布、清潔工具或桶子替代同 SKU 比較，也不推算 Costco 單價。

這表示目前未達 ingestion spec「日用品至少一筆 Costco 基準」的資料目標；屬明確缺口，不以不相容商品補數。

## 尚存缺口

1. **圓山周邊實體選項不足**：未找到同時有官方店別價格、即時庫存、必要費用與營業時間的可驗證紀錄；目前 7 筆皆為線上／超商取貨。
2. **價格期限未公告**：商品頁沒有價格有效期，`valid_until` 保持 `null`；下單前須重新核實。
3. **庫存快速變動**：頁面明示每 30 分鐘更新，核實只代表 2026-09-05 的快照，不保證之後仍有貨。
4. **Costco baseline 為 0 筆**：沒有完全相同 SKU 與份量的 Costco 證據，因此不能填 baseline。
5. **運費基準有限**：59 元是超商取貨每箱費率；多品項合箱、箱材限制、改用宅配或結帳端其他條件仍需在實際購物車確認。

## 官方來源索引

- IKEA 台灣清潔用品分類：https://www.ikea.com.tw/zh/products/cleaning-and-laundry-solutions/cleaning-and-cleaning-accessories
- IKEA 台灣運送服務：https://www.ikea.com.tw/zh/customerservice/about-service/delivery
- 7 個商品頁：見「已納入候選」表及每筆 JSON 的 `source_url`／`evidence.url`。
