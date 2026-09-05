# 免費／公益資源資料擴充研究（2026-09-05）

## 結果與範圍

- 批次：`expansion-2026-09-05`
- 既有資料：7筆。
- 本批新增：恰好14筆，ID皆為`r_`加4碼小寫英數，未與既有或全repo其他ID重複。
- 合併後：21筆；本子任務未匯入DB，也未修改既有來源檔。
- 地理範圍：全國可用服務或臺北市民可合理使用的服務；沒有把機關所在地假裝成服務地點。
- 全部`address`、`lat`、`lng`維持`null`，沒有猜座標，也沒有建立`extra.source_coordinates`。
- 14筆皆以來源明示的免費範圍填`price_total_twd: 0`及`mandatory_fees_twd: 0`；外部網路、裝置、交通、郵寄、影印、委任、醫療或轉介後服務若未明示免費，均不併入0元結論。

## 14筆服務、費用、資格與限制

| ID | 服務與具體範圍 | 免費依據 | 登記／資格 | 可用時間與主要限制 |
|---|---|---|---|---|
| `r_job0` | 台灣就業通會員履歷維護、職缺媒合與線上應徵 | 官方寫明網路求職求才服務免費，求職與徵才均不需支付費用 | `registration_required: true`；完整履歷與應徵功能須加入會員並登入 | 網站服務；08:30–18:30僅為週一至週五客服時段，不代表網站僅於該時段可用；自備設備與網路不列為平台費用 |
| `r_laf0` | 法扶官方線上系統預約之駐點面對面法律諮詢 | 官方明示免費諮詢，不需負擔律師費 | `registration_required: true`；本筆明確限縮為官方線上預約；在台灣民眾均可用，不審查資力及案情 | 每人20分鐘；駐點與可預約時段依系統；不含委任、代寫訴狀及後續程序 |
| `r_lbrm` | 勞工或雇主任一方向勞務所在地地方主管機關申請勞資爭議調解 | 勞動部頁面標示「調解（免費、迅速）」 | `registration_required: true`；須填調解申請書，可選調解人或調解委員會 | 申請及會議依主管機關安排；臺北市勞動局服務時間週一至週五08:30–12:30、13:30–17:30；不含仲裁、訴訟或自行委任費用 |
| `r_fin0` | 金融消費爭議書面評議申請 | 評議中心明示申請評議不需支付任何費用 | `registration_required: true`；先向金融服務業申訴；不接受結果或逾30日未處理者，於60日內申請 | 書面審理；臨櫃諮詢與免費專線週一至週五08:30–17:30；不推定郵寄、影印、交通或委任成本為零 |
| `r_care` | 家庭照顧者0800專線或官方LINE諮詢、支持與資源銜接 | 提供者明示0800-50-7272為免付費專線 | 不強制預先登記；電話或LINE進線 | 上班日09:00–18:00；0800服務免費，LINE仍需自備設備與網路；後續支持團體或轉介依個案條件 |
| `r_deme` | 0800-474-580失智症照顧、福利、家屬支持及就醫資訊諮詢 | 官方正文明示為免付費專線 | 不強制預先登記 | 上班日09:00–21:00；免費僅指專線，後續醫療、照護或其他資源可能另有條件與費用 |
| `r_smok` | 0800-636-363戒菸電話專業諮詢 | 國健署明示開辦免付費戒菸專線 | 吸菸者或有戒菸諮詢需求者；不強制預先登記 | 週一至週六09:00–21:00；不包含戒菸門診、藥品或其他醫療費用 |
| `r_mate` | 0800-870-870孕產兒衛教、傾聽、支持及必要資源轉介 | 國健署明示為孕產兒免付費關懷專線 | 準爸媽、新手爸媽或照顧孕產婦、嬰幼兒之家人；不強制預先登記 | 週一至週五09:00–17:00；不含產檢、治療、商品或轉介後服務 |
| `r_itwn` | 全臺貼有iTaiwan識別圖示之公共Wi-Fi熱點 | 官方FAQ明示使用iTaiwan不需付費 | 109-07-01起免註冊認證 | 連續4小時或閒置15分鐘登出，可重新使用；火車站及高速公路休息區24小時，其他依場域開放；離開熱點後自動轉4G可能產生商業電信費 |
| `r_elea` | 臺北e大免費會員帳號、學習紀錄與電子報等明列會員服務 | 官方關於我們頁明示加入會員完全免費 | `registration_required: true`；臺北市政府員工及一般民眾可加入 | 線上服務；客服週一至週五08:30–17:30。免費的是會員與明列會員服務，**不代表每門課程免費**；個別課程須另查價格、資格與時數 |
| `r_eboo` | 臺北市立圖書館讀者使用台灣雲端書庫計次借閱電子書／雜誌 | 動態FAQ正文明示讀者使用計次借閱閱讀書籍不需負擔任何費用，費用由文化部及縣市政府支持 | `registration_required: true`；須持臺北市立圖書館借閱證登入；未辦證者可先線上申辦 | 每月最多10次；同一本書每人每年4次；每本14天。累計5本未開啟即歸還會暫停計次借閱1個月 |
| `r_read` | 臺北市立圖書館啟明分館視障者免付費讀報專線 | 官方頁明示「免付費讀報專線0800-011-906」 | `registration_required: true`；須符合視障或指定閱讀／語言學習障礙資格並辦理相應借閱證 | 09:00–12:00、13:30–16:30；休館日、國定假日及臺北市公告不上班日不服務；每人每次最多20分鐘 |
| `r_libc` | 首次申辦一張臺北市立圖書館個人借閱證 | 官方FAQ明示首次辦證一律免費 | `registration_required: true`；中華民國國民、大陸人士、外籍人士可申辦；網路僅限新辦 | 每人限1張；線上辦證後可用部分電子資源，外借與預約須領實體證；遺失補發、家庭證補發及悠遊卡本身不在本筆免費範圍 |
| `r_ycar` | 18–29歲青年一對一即時線上職涯諮詢 | 官方首頁明示由專業顧問提供每年3次免費 | `registration_required: true`；須登入／註冊、同意條款並預約 | 實際諮詢時段依預約系統；週一至週五08:30–20:30是客服時段；須自備穩定網路與影音設備 |

## URL → IDs

### `r_job0`

- https://job.taiwanjobs.gov.tw/Internet/Index/DocDetail.aspx?docid=17062&uk=1420 — 免費範圍與客服時段。
- https://job.taiwanjobs.gov.tw/Internet/jobwanted/job_newuser02.aspx — 加入會員、登入後履歷維護、媒合與線上應徵流程。

### `r_laf0`

- https://www.laf.org.tw/service-legal-advice/1 — 免費律師諮詢、在台灣民眾均可使用、每人20分鐘、線上預約與駐點時段查詢。

### `r_lbrm`

- https://www.mol.gov.tw/1607/28162/28296/81778/81802/81951/ — 免費調解、申請人、所在地主管機關、申請書及調解方式。
- https://bola.gov.taipei/News_Content.aspx?n=1A6417117CA20D98&s=9598CEC46364ACB0&sms=31B6C0BAB6E11488 — 臺北市線上申請入口與機關服務時間。

### `r_fin0`

- https://www.foi.org.tw/Article.aspx?Arti=1616&Lang=1&lid=645 — 申請評議不需費用及服務時段。
- https://www.foi.org.tw/Article.aspx?Arti=1622&Lang=1&p=3 — 先申訴、30日／60日期限及書面申請要求。

### `r_care`

- https://www.familycare.org.tw/taxonomy/term/892 — 0800免付費專線、服務內容與LINE入口。
- https://www.familycare.org.tw/contact — 上班日09:00–18:00服務時間。

### `r_deme`

- https://dementia.gov.taipei/News_Content.aspx?n=04825D3265339708&s=65C3246500BEEBAD&sms=D3FC34DCF234E6DD — 免付費、諮詢內容、上班日09:00–21:00。

### `r_smok`

- https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=4705&pid=17752 — 免付費戒菸專線及即時、隱密之專業諮詢。
- https://www.hpa.gov.tw/Pages/List.aspx?nodeid=94 — 週一至週六09:00–21:00。

### `r_mate`

- https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=4705&pid=16871 — 免付費孕產兒專線、適用對象與服務內容。
- https://www.hpa.gov.tw/Pages/List.aspx?nodeid=94 — 週一至週五09:00–17:00。

### `r_itwn`

- https://itaiwan.gov.tw/ITaiwanArticle/Contents?articleId=81 — 免費公共Wi-Fi、全臺熱點、免註冊認證。
- https://itaiwan.gov.tw/ITaiwanArticle/Contents?articleId=80 — iTaiwan本身不收費、4G自動連線風險、4小時／15分鐘限制及熱點開放時間。

### `r_elea`

- https://elearning.taipei/mpage/about_us — 會員完全免費、一般民眾可使用、會員服務項目與客服時間。
- 未再使用`Provision0407.pdf`把「免費／付費」分類規則充當一門具體免費課程；免費結論已限縮為官方明示的會員服務。

### `r_eboo`

- https://www.ebookservice.tw/support/faq — 完整計次借閱閱讀不向讀者收費；動態頁須渲染後取得正文。
- https://www.ebookservice.tw/tp/support/library-guide?mode=full — 臺北市圖借閱證條件、每月10次、同書每年4次、14天借期與未開啟歸還限制；動態頁須渲染後取得正文。

### `r_read`

- https://blind.tpml.gov.taipei/TaipeiLib/wSite/ct?ctNode=338&xItem=64090 — 資格、免付費電話、時段與每次20分鐘限制。

### `r_libc`

- https://tpml.gov.taipei/News_Content.aspx?n=E5F579B94C9D2941&s=0B14D794801EB4E3 — 首次辦證免費及補發例外。
- https://tpml.gov.taipei/News_Content.aspx?n=E5F579B94C9D2941&s=3042D939FA6A98F3 — 可申辦對象、每人1張、線上申辦與領實體證條件。

### `r_ycar`

- https://coach.taiwanjobs.gov.tw/wdaecPublic/ — 18–29歲、每年3次免費、一對一線上諮詢、預約流程與客服時段。

## 來源取得與核查方式

核查日期均為臺北時間2026-09-05；JSON的本輪`checked_at`、`collected_at`、`verified_at`為`2026-09-05T23:38:22+08:00`。

1. 使用`web.run`搜尋並開啟官方／實際提供者頁，確認目前正文，而非只依搜尋摘要或舊資料。
2. 對靜態頁與PDF使用保持TLS驗證的`curl GET -sS -L --max-time 35`保存body，再以`.scratch/catalog-expansion/community/extract-text.py`抽取可核對文字。
3. 台灣雲端書庫兩頁是動態殼頁；curl雖回HTTP 200，但HTML本身沒有完整FAQ／指南正文，因此另以in-app browser等待渲染後保存`document.body.innerText`：
   - `.scratch/catalog-expansion/community/cloud-faq-rendered.txt`
   - `.scratch/catalog-expansion/community/cloud-faq-rendered.meta.json`
   - `.scratch/catalog-expansion/community/cloud-library-rendered.txt`
   - `.scratch/catalog-expansion/community/cloud-library-rendered.meta.json`
4. JSON所有53條`evidence.quote`都以`.scratch/catalog-expansion/community/verify-evidence-quotes.mjs`做NFC與空白正規化後的逐字包含檢查；結果`53/53`匹配，沒有把摘要、改寫或推論句放入quote。
5. 推論、比較單位、免費邊界與客服時段說明放在`extra.quantity_basis`及`extra.review_notes`，沒有偽裝成來源引文。

## HTTP、有效URL與快照狀態

- 第一批靜態來源的詳細紀錄在`.scratch/catalog-expansion/community/fetch-log.tsv`；新增補查來源在`extra-fetch-log.tsv`。
- 下列來源均為HTTP 200且effective URL未改到其他內容頁：台灣就業通免費說明、台灣就業通新手上路、法扶現場法律諮詢、勞動部勞資爭議、臺北市勞動局、金融評議中心兩頁、家庭照顧者兩頁、失智症專線、國健署戒菸與孕產兒頁、國健署專線列表、iTaiwan兩頁、臺北e大關於我們、臺北市圖兩個辦證FAQ、Youth職涯。
- `labor-form`雖HTTP 200，但effective URL是臺北服務通`Errors/PageNotFound`，因此沒有引用。
- 台灣雲端書庫FAQ及臺北市指南的curl shell均HTTP 200；正式引文來自同一URL渲染後DOM快照，而不是空殼HTML。FAQ渲染核查時間為`2026-09-05T23:37:27+08:00`（meta內以UTC記錄為`2026-09-05T15:37:27.837Z`）。
- 啟明分館來源的正常curl因憑證SAN不含`blind.tpml.gov.taipei`而以exit 60失敗；沒有把此狀態隱藏。研究快照另以`curl -k`取得HTTP 200正文，並以`web.run`官方頁正文再次核對。這只用於保存可審計文字，不宣稱TLS狀態正常，也沒有在瀏覽器略過安全警告。
- 各`.txt`首行保存頁面title；PDF另保存content type `application/pdf`及抽取文字。完整HTTP status、effective URL、content type、bytes與取得時間見兩個TSV。

## 明確排除與免費邊界

### 成人預防保健／成人健檢

成人健檢候選未納入14筆。雖政府頁可能寫明補助檢查費，來源沒有一致明示合作醫療院所免掛號費、免部分負擔或完整就診0成本；「政府補助檢查費」不等於整體服務免費。為避免把醫療院所可能收取的費用推定為0，本批改採非醫療免費資源。

### 公共電話與通信費

- 只把正文明示「免付費專線」或「不需付費」的服務填0。
- iTaiwan另明示離開Wi-Fi範圍後裝置自動連上4G等商業服務可能產生費用，已在記錄揭露。
- LINE、線上諮詢、線上學習與電子書使用者須自備設備及網路；來源未把個人電信方案列為該服務收費，因此不在服務直接成本內，也不聲稱外部通信完全零成本。

### 其他限制

- 法扶記錄限縮為「官方線上系統預約」的20分鐘現場諮詢，因此不會在使用者拒絕登記時錯推；其他駐點的電話預約或現場排隊不納入本筆比較。
- 台灣就業通記錄限縮為會員履歷、媒合與線上應徵功能，`registration_required: true`；不把公開瀏覽職缺當成完整求職服務。
- 臺北e大記錄是免費會員學習服務，不再以「課程可分免費／付費」通則假裝一門已確認免費課程；也明示會員免費不代表全部課程免費。
- 台灣雲端書庫價格引文採此次動態FAQ實際正文：「讀者使用電子書計次借閱服務閱讀書籍，不需負擔任何費用，該費用由文化部及各縣市政府共同支持。」不是先前未保存正文中的改寫句，也不是只支持免費閱讀部分章節的引文。

## 離線驗證

只使用允許的離線驗證函式，未跑全套測試、未讀寫DB：

```text
prepareCandidate: 新增14/14通過
新增 truthfullyVerified: 14
既有7 + 新增14: 21
合併 truthfullyVerified: 21
ID unique: true
assessCatalog issues: []
assessCatalog ready: true
quote audit: 53/53 matched
```

驗證工具：

- `.scratch/catalog-expansion/community/validate-expansion.ts`
- `.scratch/catalog-expansion/community/verify-evidence-quotes.mjs`
- `.scratch/catalog-expansion/community/build-expansion.mjs`

正式新增檔：

- `prototype-v1/data/live/免費公益資源-expansion.json`
- `docs/research/community-expansion-2026-09-05.md`
