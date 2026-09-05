# 活動資料擴充研究紀錄（2026-09-05）

- 研究批次：`expansion-2026-09-05`
- 核心資料查核：2026-09-05 23:41:03（Asia/Taipei）；團體優惠再查核：2026-09-05 23:45:09（`2026-09-05T23:45:09+08:00`）。
- 新增檔：`prototype-v1/data/live/活動-expansion.json`
- 新增 20 筆；其中 19 筆 `已驗證`、1 筆 `部分驗證／待確認`（`a_moca` 尚未開展）。
- 團體優惠：6 筆，均保留一般入場價在 `price_total_twd`，優惠價／折扣只放在 `group_offer`；全部沒有虛構兌換碼，`redeem_code` 為 `null`。
- 價格與時間以場館、政府或主辦單位第一手頁面為準。`.scratch/catalog-expansion/activity/fetch-log.tsv` 中先前受 sandbox 網路限制而產生的 HTTP `000` **不作為驗證成功依據**；本批資料改以本次 `web.run` 開啟的官方正文逐字核對。未取得正文的搜尋摘要不作為票價覆寫依據。

## 1. 官方 URL → 新增 ID

| ID | 場館／票券 | 官方價格或主頁 | 官方時間／展期頁 | 本次基礎成本 |
|---|---|---|---|---:|
| `a_zoo1` | 臺北市立動物園一般入園票 | https://english.zoo.gov.taipei/cp.aspx?n=8ED5B9F3BA1D301D | https://english.zoo.gov.taipei/cp.aspx?n=4AC205302039EC51 | 100 + 必要費 0 |
| `a_kids` | 臺北市兒童新樂園入園全票 | https://www.tcap.taipei/cp.aspx?n=EE083F2DED91AB99 | 同左 | 30 + 必要費 0 |
| `a_npm1` | 故宮北院普通參觀券（16:30前） | https://www.npm.gov.tw/Articles.aspx?l=1&sno=02007004 | https://www.npm.gov.tw/News-Content.aspx?idstr=MDMwMDAwOTY%3D&l=1&sno=04014630&type=03000096 | 350 + 必要費 0 |
| `a_ntm1` | 臺博館本館暨古生物館全票 | https://www.ntm.gov.tw/cp.aspx?n=5444 | 同左 | 30 + 必要費 0 |
| `a_nmh1` | 國立歷史博物館普通票 | https://www.nmh.gov.tw/cp.aspx?n=7423 | https://www.nmh.gov.tw/cp.aspx?n=7145 | 80 + 必要費 0 |
| `a_jmhr` | 白色恐怖景美紀念園區 | https://www.nhrm.gov.tw/w/nhrm/JM_Visit | 同左 | 免費、必要費 0 |
| `a_post` | 郵政博物館臺北館 | https://museum.post.gov.tw/post/Postal_Museum/museum/north/map.jsp | 同左 | 免費、必要費 0 |
| `a_moca` | 台北當代藝術館「美術館之後」 | https://www.mocataipei.org.tw/tw/About/%E5%8F%83%E8%A7%80%E8%B3%87%E8%A8%8A | https://www.mocataipei.org.tw/tw/ExhibitionAndEvent/Info/%E7%BE%8E%E8%A1%93%E9%A4%A8%E4%B9%8B%E5%BE%8C | 100 + 必要費 0；未開展待確認 |
| `a_egmm` | 長榮海事博物館四樓換展期間票 | https://www.evergreenmuseum.org.tw/visit | 同左 | 100 + 必要費 0 |
| `a_t101` | 台北101觀景台一般票 | https://www.taipei-101.com.tw/tw/observatory/ticket/information | 同左 | 600 + 必要費 0 |
| `a_bm01` | 北投文物館「百鬼繚亂—妖怪WORLD」特展全票 | https://beitoumuseum.org.tw/intro/opening | https://beitoumuseum.org.tw/exhibition/expo/E202602 | 120 + 必要費 0 |
| `a_ying` | 鶯歌陶瓷博物館全票 | https://www.ceramics.ntpc.gov.tw/xmdoc/cont?sid=0l196423054308732923&xsmsid=0l196418676818644838 | https://www.ceramics.ntpc.gov.tw/xmdoc/cont?sid=0L196422589861814951&xsmsid=0L196418676818644838 | 80 + 必要費 0 |
| `a_gold` | 黃金博物館入園全票 | https://www.gep.ntpc.gov.tw/xmdoc/cont?sq=249&xsmsid=0G246368552167800609 | 同左 | 80 + 必要費 0 |
| `a_13xh` | 十三行博物館全票 | https://www.sshm.ntpc.gov.tw/xmdoc/cont?xsmsid=0G244537677948124632 | https://www.sshm.ntpc.gov.tw/xmdoc/cont?xsmsid=0G244537366769376687 | 80 + 必要費 0 |
| `a_linf` | 林本源園邸全票 | https://www.linfamily.ntpc.gov.tw/xmdoc/cont?xsmsid=0G245356561322447606 | 同左 | 80 + 必要費 0 |
| `a_tea1` | 坪林茶業博物館全票 | https://www.tea.ntpc.gov.tw/xmdoc/cont?xsmsid=0G266540184006780639 | https://www.tea.ntpc.gov.tw/xmdoc/cont?xsmsid=0G266540526907255656 | 80 + 必要費 0 |
| `a_wlty` | 烏來泰雅民族博物館 | https://www.museum.ntpc.gov.tw/xmdoc/cont?sid=0G297835720922930721&xsmsid=0G275735901206394658 | https://www.atayal.ntpc.gov.tw/ | 免費、必要費 0 |
| `a_hakk` | 新北市客家文化園區 | https://www.hakka.ntpc.gov.tw/tw/%E5%8F%83%E8%A7%80%E8%B3%87%E8%A8%8A/%E9%96%8B%E6%94%BE%E6%99%82%E9%96%93 | 同左 | 免費、必要費 0 |
| `a_watr` | 臺北自來水園區非夏月全票 | https://waterpark.water.gov.taipei/cp.aspx?n=83AB9156FF18845C | 同左 | 50 + 必要費 0 |
| `a_ncpi` | 國家攝影文化中心臺北館 | https://ncpi.ntmofa.gov.tw/cp.aspx?n=7929 | 同左 | 免費、必要費 0 |

## 2. 收費、票種與必要費用前提

1. `mandatory_fees_twd: 0` 只用在官方明示免費，或官方已列出完整基本入場票且沒有該票券必須加購項目的情況。
2. `a_kids` 的遊樂設施票、`a_gold` 的體驗活動、`a_t101` 的101樓加購、`a_nmh1` 的國際特展皆是另購項目，不是所記錄基本票券的必要費用。
3. `a_zoo1` 基礎票只比較一般入園；園內接駁另購。團體優惠也明確限定由動物園大門入場，因此南站5元接駁券不列為必要費。
4. `a_npm1` 限定16:30前的350元普通參觀券；16:30後的離峰票價是另一票價條件，未混入本筆。
5. `a_egmm` 採官方2026-09-01起四樓換展期間「每人100元」規則；四樓不在可參觀範圍。
6. `a_watr` 採9月1日至隔年6月30日的非夏月50元全票；夏月票價不混入。
7. 全部 `quantity_or_servings` 的「每人1次／每張1票」是比較單位正規化，不冒充官方逐字摘錄；官方逐字內容只放在 `evidence.quote`。

## 3. 六筆官方團體優惠

| ID | 基礎價 | `group_offer` | 官方資格與兌換方式 | 官方逐字短摘錄與來源 |
|---|---:|---|---|---|
| `a_zoo1` | 100 | 30人；每人70 | 30人皆須為100元普通票適用者；全團集合後洽現場工作人員清點並同時購票入場。本比較限定由動物園大門口入園，南站另需每人5元接駁車資且僅限現金。 | 「團體達30人(限購買普通票100元者)，集合好請洽現場工作人員，由工作人員清點人數後購買團體票同時入場，單一票價每人70元。」https://www.gov.taipei/News_Content.aspx?n=EEC70A4186D4C828&s=94DE6AB433A19EE6&sms=87415A8B9CE81B16 |
| `a_kids` | 30 | 30人；7折（`discount_pct: 30`） | 30人（含）以上按票價7折；另有平常日30人以上於前1日17:00前完成預約可免費入園的獨立規則，兩者不重複套用；設施另付費。 | 「團體票7折」、「30人(含)以上按票價7折」、「免費入園（入園時，應主動出示身分證明文件）」及「平常日凡30人(含)以上之團體，依現行團體預約方式，於前1日17:00前完成預約作業。」https://www.tcap.taipei/cp.aspx?n=EE083F2DED91AB99 |
| `a_ntm1` | 30 | 20人；每人15 | 僅機關或學校20人（含）以上團體；須一週前網路預約申請。未擴張到其他法人團體。 | 「全票：每張 30元｜半票：每張 15元」及「機關學校團體二十人(含)以上(須一週前網路預約申請)」https://www.ntm.gov.tw/cp.aspx?n=5444 |
| `a_nmh1` | 80 | 10人；每人40 | 10人以上團體適用40元優待票；現行票價頁未列本團體票額外預約、同時購票或隨團免費名額，因此全部移除、不加推。國際特展另售。 | 「優待票新臺幣四十元」及「六歲以上未滿十二歲兒童、學生(持有效學生證或入學通知)、六十五歲以上長者(假日)、十人以上團體。」https://www.nmh.gov.tw/cp.aspx?n=7423 |
| `a_t101` | 600 | 20人；每人540 | 跨頁採保守資格：團體申請頁明示外籍團體20人（含）以上、每日限額、線上申請；購票資訊頁較廣泛寫20人以上團體可傳真或網路預約。因資格表述不一致，本筆限外籍團體，不擴張到本國團體。票含91樓、89樓、88樓，91樓視天氣開放。 | 申請頁：「團體預約每日採限額制，可填寫線上申請表單」、「外籍團體滿20人(含)，可享優惠價每位NT$540」https://www.taipei-101.com.tw/tw/observatory/application；購票頁：「20人(含)以上團體，請以傳真或網路預約」、「參觀樓層 91F;89F;88F／NT$ 540」https://www.taipei-101.com.tw/tw/observatory/ticket/information |
| `a_watr` | 50 | 30人；8折（`discount_pct: 20`） | 團體30人以上；本筆不加入官網未寫的預約或其他資格，優惠期間跟隨非夏月票價至2027-06-30。 | 「3.團體30人以上享票價8折優待。」https://waterpark.water.gov.taipei/cp.aspx?n=83AB9156FF18845C |

所有團體優惠都另存：

- `extra.group_offer_evidence[]`：`field`、可逐字找到的 `quote`、官方 `url`、本次 `checked_at`。
- `extra.group_offer_terms`：`redemption_method`、資格、是否需預約、必要費用與 `valid_until`。
- 基礎 `price_total_twd` 不因團體優惠而改寫，避免重複折扣。

## 4. 未開展、休館、整修與可用範圍查核

- **`a_moca` 不作為目前可參觀項目。** 官方公告2026-09-01至09-18佈展；「美術館之後」於2026-09-19才開展。截至本次2026-09-05夜間查核仍未開放，因此標記 `部分驗證／待確認`，開展後須重查才可改回 `已驗證`。本筆沒有套用或宣稱任何現行團體優惠。佈展公告：https://www.mocataipei.org.tw/index.php/tw/News/2026%5E09%5E01%28%E4%BA%8C%29-2026%5E09%5E18%28%E4%BA%94%29%E4%BD%88%E5%B1%95%E5%85%AC%E5%91%8A
- **台北探索館排除。** 官方明示已於2024-12-30閉館，未納入20筆：https://www.tpedoit.gov.taipei/News_Content.aspx?n=603755835E928BED&s=3371C9401E36522D
- **`a_post` 僅代表郵政博物館臺北館。** 重慶南路總館整修不外推為臺北館閉館。總館公告：https://www.post.gov.tw/post/internet/Message/index.jsp?ID=150101&control_type=page&group_name=post&news_cat=6&news_no=74982&news_type=latest_news
- **`a_egmm` 四樓換展中。** 票價100元只代表其餘開放範圍；官方只寫換展至2027年10月，沒有確切日，故 `valid_until: null`。
- **`a_wlty` 舊暫停服務已結束。** 2026-07-30至08-21的暫停服務不是現行閉館；館方官網2026-09-01仍有更新。本筆仍要求到訪前重查。舊公告：https://www.ipb.ntpc.gov.tw/infor_detail.php?flag=menu&id=4140&p_id=5999999
- **`a_gold`、`a_linf`、`a_tea1`、`a_hakk`** 均在備註明示2026-09-07第一個星期一的例行休館／休園限制；沒有把每日或平日開館句誤讀為該日仍開放。
- **`a_13xh`** 保留官方休館限制並提示2026-09-07前往前重查。
- **`a_watr`** 2026-07-01至07-10的部分設施維護已結束，不冒充現行限制。舊公告：https://eng.water.gov.taipei/News_Content.aspx?n=5AE31D16E6C8ED48&s=1543392635B40925&sms=78D644F2755ACCAA
- 所有紀錄地址、經緯度皆為 `null`；沒有推估座標、距離或聲稱可由圓山步行抵達。臺北市紀錄在 `extra.scope` 明示已超出圓山核心區；新北市紀錄明示超出圓山與臺北市範圍。

## 5. `valid_until` 使用理由

僅在官方明示截止時設定：

- `a_npm1`：延長開館公告至2026-09-13；本票又限定16:30前，故設 `2026-09-13T16:29:59+08:00`。
- `a_nmh1`：國際特展期間開館安排至2026-09-28，設 `2026-09-28T18:00:00+08:00`；到期後重查一般時段。
- `a_moca`：展期至2026-12-31 18:00，但目前仍是未開展待確認。
- `a_bm01`：官方展期至2027-02-14，設當日18:00。
- `a_watr`：本期非夏月票價至2027-06-30，設當日17:00；團體優惠條件也跟隨此筆票價有效期。
- 其他常設場館沒有捏造永久有效期限；官方未明示截止者維持 `null`。

## 6. 離線驗證

只使用要求的離線入口：

```sh
bun run .scratch/catalog-expansion/activity/validate.ts
```

驗證內容：

- 對既有10筆與新增20筆逐筆呼叫 `prepareCandidate`。
- 檢查新增ID不重複、每筆恰好各有一個價格／份量／時間 evidence、研究批次正確。
- 檢查6筆 `group_offer` 的門檻、價格或折扣、`redeem_code: null`、`group_offer_evidence` 與 `group_offer_terms`。
- 合併既有活動資料後，只以 `assessCatalog(..., ["活動"])` 評估活動類。
- 結果：原始30筆、公開29筆、封存忽略1筆、rankable 26、pending 3、issues 0、ready true。pending 3包含既有公開資料2筆與本批尚未開展的 `a_moca` 1筆。
