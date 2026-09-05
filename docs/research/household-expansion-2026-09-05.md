# 日用品資料擴充研究（expansion-2026-09-05）

- 研究日期：2026-09-05（Asia/Taipei）
- 本輪核實時間：2026-09-05T23:35:17+08:00
- 目標：既有 7 筆之外新增恰好 14 筆，合併後日用品共 21 筆
- 產出：`prototype-v1/data/live/日用品-expansion.json`
- 來源原則：只採 IKEA 台灣官方商品頁；必須同頁核到商品價、規格／包裝資訊、線上可用性及該 SKU 的配送費

## QA 修正結論

- `evidence.quote` 依現有 ingestion schema 保存「價格／份量／時間」三個唯一欄位；配送原文另存於 `extra.fulfillment_evidence.quote`。所有摘錄都是本輪官方商品頁可逐字找到的短句，不再把不同區塊改寫或拼成一句假原文。
- `quantity_or_servings`、`mandatory_fees_twd` 與 `extra.pricing_context` 是結構化整理欄位；尺寸、件數推導與商品價加必要運費的比較前提只寫在實際欄位／`extra`，不冒充來源原句。
- `d_ix01` 已改用官方列示的畚箕 16.5×20.5 公分及刷子 16×19.2 公分，不再使用錯誤的 20×16 公分，也未拿包裝尺寸代替商品尺寸。
- `d_ix08`、`d_ix09`、`d_ix13` 已按現頁更正為「除毛刷」、「灰色平板拖把用纖維墊」及「百潔布」。
- 原 `d_ix11` 與既有 `d_ik06` 都是 PEPPRIG 畚箕／刷子的顏色變體，已換成不同用途及不同 SKU 的 RINNIG 洗滌刷。
- 原 `d_ix12` 是既有黑色 LILLNAGGEN 水漬刮刀的顏色變體；為避免只靠換色擴充，已換成不同用途及不同 SKU 的 RINNIG 置盤架。
- 原 `d_ix14` 有線上價套用內湖店購買的跨通路假設，已整筆換成線上有庫存且同頁明示宅配費的 RINNIG 碗盤瀝乾墊；本批不再有實體店購買候選。

## 14 筆候選與比較前提

所有候選在查核時的官方頁均顯示「有庫存於線上購物」。這只代表本輪快照，不保證後續庫存；下單前必須重查。

| ID | 官方商品 | 商品價 | 必要費用 | `quantity_or_servings` 整理值 | 官方來源 |
|---|---|---:|---:|---|---|
| `d_ix01` | LÄSKIS 掃帚組, 透明 | NT$39 | 超商取貨 NT$59／箱 | 畚箕及刷子1組（畚箕寬16.5公分、長20.5公分；刷子寬16公分、長19.2公分） | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/laskis-art-10307542 |
| `d_ix02` | PEPPRIG 噴式澆水瓶, 55厘升 | NT$49 | 超商取貨 NT$59／箱 | 容積0.55公升 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-90501432 |
| `d_ix03` | PEPPRIG 畚箕掃把組, 灰色/綠色 | NT$299 | 便利箱宅配 NT$150／箱 | 1包裝（畚箕掃把組） | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-70567631 |
| `d_ix04` | PEPPRIG 臉盆, 折疊式/黃色, 27 公分 | NT$99 | 超商取貨 NT$59／箱 | 折疊式臉盆，27公分 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-40567722 |
| `d_ix05` | PEPPRIG 刷子 兩件組, 綠色 | NT$79 | 超商取貨 NT$59／箱 | 2件組 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-90567649 |
| `d_ix06` | PEPPRIG 臉盆, 折疊式/綠色, 10 公升 | NT$199 | 便利箱宅配 NT$150／箱 | 折疊式臉盆，10公升 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-50572964 |
| `d_ix07` | PEPPRIG 縫隙清潔套, 綠色, 45x7 公分 | NT$39 | 便利箱宅配 NT$150／箱 | 縫隙清潔套，45x7公分 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-60567636 |
| `d_ix08` | FRUKTPLOCKARE 除毛刷, 黑／淺灰, 12x6x4 公分 | NT$69 | 超商取貨 NT$59／箱 | 除毛刷，12x6x4公分 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/fruktplockare-art-00528389 |
| `d_ix09` | PEPPRIG 平板拖把用纖維墊, 灰色, 10x29 公分 | NT$79 | 超商取貨 NT$59／箱 | 2件裝，每件10x29公分 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-80567616 |
| `d_ix10` | PEPPRIG 清潔伸縮桿, 灰色, 76-128 公分 | NT$99 | 便利箱宅配 NT$150／箱 | 清潔伸縮桿，76-128公分 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-10567747 |
| `d_ix11` | RINNIG 洗滌刷, 亮黃色/淺乳白色 | NT$39 | 便利箱宅配 NT$150／箱 | 1包裝（洗滌刷） | https://www.ikea.com.tw/zh/products/storing/organisers-and-washing-up/rinnig-art-00565857 |
| `d_ix12` | RINNIG 置盤架 | NT$149 | 超商取貨 NT$59／箱 | 可同時瀝乾9個碟子 | https://www.ikea.com.tw/zh/products/storing/organisers-and-washing-up/rinnig-art-40387269 |
| `d_ix13` | PEPPRIG 百潔布, 綠色 藍色/黃色 | NT$29 | 超商取貨 NT$59／箱 | 3件裝 | https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-50567651 |
| `d_ix14` | RINNIG 碗盤瀝乾墊, 米色, 51x42 公分 | NT$149 | 便利箱宅配 NT$150／箱 | 1包裝（碗盤瀝乾墊） | https://www.ikea.com.tw/zh/products/storing/organisers-and-washing-up/rinnig-art-30595443 |

## 逐字來源摘錄摘要

下列文字是各官方頁可逐字找到的短摘錄；JSON 的 `evidence` 保存價格、份量與時間，`extra.fulfillment_evidence` 保存配送原文、URL、必要費用與 `checked_at`。現有 ingestion schema 不接受 `field: "配送"`，因此沒有為了表面一致而改動共同 schema。

| ID | 價格 quote | 份量／規格 quote | 配送 quote | 時間 quote |
|---|---|---|---|---|
| `d_ix01` | `$ 39` | `含：畚箕(寬16.5公分，長20.5公分)及刷子(寬16公分，長19.2公分)` | `適用超商取貨，運費$59/箱` | `有庫存於線上購物` |
| `d_ix02` | `$ 49` | `容積:0.55 公升` | `適用超商取貨，運費$59/箱` | `有庫存於線上購物` |
| `d_ix03` | `$ 299` | `1 x PEPPRIG 畚箕掃把組 產品編號： 705.676.31 1 包裝` | `適用便利箱宅配到府服務，運費$150/箱` | `有庫存於線上購物` |
| `d_ix04` | `$ 99` | `臉盆, 折疊式/黃色, 27 公分` | `適用超商取貨，運費$59/箱` | `有庫存於線上購物` |
| `d_ix05` | `$ 79` | `刷子 兩件組, 綠色` | `適用超商取貨，運費$59/箱` | `有庫存於線上購物` |
| `d_ix06` | `$ 199` | `臉盆, 折疊式/綠色, 10 公升` | `適用便利箱宅配到府服務，運費$150/箱` | `有庫存於線上購物` |
| `d_ix07` | `$ 39` | `縫隙清潔套, 綠色, 45x7 公分` | `適用便利箱宅配到府服務，運費$150/箱` | `有庫存於線上購物` |
| `d_ix08` | `$ 69` | `除毛刷, 黑／淺灰, 12x6x4 公分` | `適用超商取貨，運費$59/箱` | `有庫存於線上購物` |
| `d_ix09` | `$ 79 / 2 件裝` | `平板拖把用纖維墊, 灰色, 10x29 公分` | `適用超商取貨，運費$59/箱` | `有庫存於線上購物` |
| `d_ix10` | `$ 99` | `清潔伸縮桿, 灰色, 76-128 公分` | `適用便利箱宅配到府服務，運費$150/箱` | `有庫存於線上購物` |
| `d_ix11` | `$ 39` | `1 x RINNIG 洗滌刷 產品編號： 005.658.57 1 包裝` | `適用便利箱宅配到府服務，運費$150/箱` | `有庫存於線上購物` |
| `d_ix12` | `$ 149` | `可同時瀝乾9個碟子。` | `適用超商取貨，運費$59/箱` | `有庫存於線上購物` |
| `d_ix13` | `$ 29 / 3 件裝` | `3 件裝` | `適用超商取貨，運費$59/箱` | `有庫存於線上購物` |
| `d_ix14` | `$ 149` | `1 x RINNIG 碗盤瀝乾墊 產品編號： 305.954.43 1 包裝` | `適用便利箱宅配到府服務，運費$150/箱` | `有庫存於線上購物` |

## 費用處理

- 超商取貨：`d_ix01`、`d_ix02`、`d_ix04`、`d_ix05`、`d_ix08`、`d_ix09`、`d_ix12`、`d_ix13`。每一頁均明示 `適用超商取貨，運費$59/箱`，故 `mandatory_fees_twd: 59`。
- 便利箱宅配到府：`d_ix03`、`d_ix06`、`d_ix07`、`d_ix10`、`d_ix11`、`d_ix14`。每一頁均明示 `適用便利箱宅配到府服務，運費$150/箱`，故 `mandatory_fees_twd: 150`。
- 比較採「單一商品單獨一箱」；不自行推定可合箱、分攤運費、滿額免運、會員折扣或其他結帳優惠。
- 本批所有候選都採線上通路；沒有把線上售價套到門市，也沒有把門市庫存當作線上可用性。

## URL → ID

- https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/laskis-art-10307542 → `d_ix01`
- https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-90501432 → `d_ix02`
- https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-70567631 → `d_ix03`
- https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-40567722 → `d_ix04`
- https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-90567649 → `d_ix05`
- https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-50572964 → `d_ix06`
- https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-60567636 → `d_ix07`
- https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/fruktplockare-art-00528389 → `d_ix08`
- https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-80567616 → `d_ix09`
- https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-10567747 → `d_ix10`
- https://www.ikea.com.tw/zh/products/storing/organisers-and-washing-up/rinnig-art-00565857 → `d_ix11`
- https://www.ikea.com.tw/zh/products/storing/organisers-and-washing-up/rinnig-art-40387269 → `d_ix12`
- https://www.ikea.com.tw/zh/products/care-and-repair/cleaning-and-cleaning-accessories/pepprig-art-50567651 → `d_ix13`
- https://www.ikea.com.tw/zh/products/storing/organisers-and-washing-up/rinnig-art-30595443 → `d_ix14`

## 限制

1. 本批 14 筆都來自 IKEA 台灣，商家來源多樣性不足；這是為了保留同頁可核對的價格、規格、庫存及 SKU 專屬配送費證據，後續批次仍宜補其他第一手商家。
2. 價格、配送條件與庫存都可能變動；商品頁未明示價格有效期限，因此 `valid_until: null`，不表示永久有效。
3. `address`、`lat`、`lng` 及 `extra.source_coordinates` 全為 `null`；不從文字地址猜座標，不做圓山距離推算。
4. 14 筆均未找到完全相同 SKU、份量及通路條件的 Costco 官方比較證據，因此 `baseline: null`，不製造 Costco baseline。
5. `assessCatalog` 是離線結構與可排名性檢查，不等於第三方持續監測；人工 QA 仍應直接開啟以上官方頁核對最新狀態。
