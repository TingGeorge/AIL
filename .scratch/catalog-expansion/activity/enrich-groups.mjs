import fs from 'node:fs';
const path = 'prototype-v1/data/live/活動-expansion.json';
const records = JSON.parse(fs.readFileSync(path, 'utf8'));
const checked = '2026-09-05T23:49:45+08:00';
const by = id => { const r = records.find(x => x.id === id); if (!r) throw new Error(id); r.verified_at = checked; return r; };
const ge = (field, quote, url) => ({ field, quote, url, checked_at: checked });

{
  const r = by('a_zoo1');
  r.group_offer = { min_people: 30, price_per_person: 70, redeem_code: null, note: '團體達30人且均購買100元普通票者，每人70元；全團集合後洽現場工作人員清點並同時購票入場。本比較限定由大門口入園；南站另需每人5元接駁車資且僅限現金。' };
  r.extra.group_offer_evidence = [
    ge('團體門檻與價格', '團體達30人(限購買普通票100元者)，集合好請洽現場工作人員，由工作人員清點人數後購買團體票同時入場，單一票價每人70元。', 'https://www.gov.taipei/News_Content.aspx?n=EEC70A4186D4C828&s=94DE6AB433A19EE6&sms=87415A8B9CE81B16'),
    ge('南站費用', '若由動物園南站入口入園，需同時支付遊客列車接駁車資每人5元，並僅限現金支付；如欲使用信用卡支付之團體，請改由大門口統一入園。', 'https://www.gov.taipei/News_Content.aspx?n=EEC70A4186D4C828&s=94DE6AB433A19EE6&sms=87415A8B9CE81B16'),
  ];
  r.extra.group_offer_terms = { redemption_method: '全團集合後洽現場工作人員清點並購買團體票同時入場；本比較由動物園大門口入園，無兌換碼。', qualification: '至少30人，且團員均為100元普通票適用者。', mandatory_fees_twd: 0, excluded_optional_costs: '南站入園另付每人5元接駁車資；本比較限定大門口入園。', reservation_required: false, valid_until: null };
}
{
  const r = by('a_kids');
  r.availability_or_event_time = '非寒暑假：週一休園、週二至週五09:00–17:00、週六至週日09:00–18:00；寒暑假每日09:00–20:00；另依官方公告調整';
  r.evidence = r.evidence.map(x => x.field === '時間' ? { field: '時間', quote: '週二~週五\n09:00~17:00', url: 'https://www.tcap.taipei/cp.aspx?n=EE083F2DED91AB99', checked_at: checked } : x);
  r.group_offer = { min_people: 30, discount_pct: 30, redeem_code: null, note: '30人（含）以上團體按票價7折；另有平常日30人以上依現行團體預約方式，於前1日17:00前完成預約作業，可符合免費入園資格。兩者不重複套用；遊樂設施仍另付費。' };
  r.extra.group_offer_evidence = [
    ge('團體折扣', '團體票7折', 'https://www.tcap.taipei/cp.aspx?n=EE083F2DED91AB99'),
    ge('團體門檻', '30人(含)以上按票價7折', 'https://www.tcap.taipei/cp.aspx?n=EE083F2DED91AB99'),
    ge('免費資格標題', '免費入園（入園時，應主動出示身分證明文件）', 'https://www.tcap.taipei/cp.aspx?n=EE083F2DED91AB99'),
    ge('平常日預約免費', '平常日凡30人(含)以上之團體，依現行團體預約方式，於前1日17:00前完成預約作業。', 'https://www.tcap.taipei/cp.aspx?n=EE083F2DED91AB99'),
  ];
  r.extra.group_offer_terms = { redemption_method: '30人以上依團體票規則購票；無兌換碼。平常日若依現行團體預約方式於前1日17:00前完成預約作業，官方另列於免費入園資格。', qualification: '團體至少30人。', mandatory_fees_twd: 0, excluded_optional_costs: '各項遊樂設施費用。', reservation_required: false, alternative_offer: { price_per_person: 0, qualification: '平常日30人（含）以上團體', reservation_deadline: '前1日17:00前完成預約作業' }, valid_until: null };
}
{
  const r = by('a_ntm1');
  r.group_offer = { min_people: 20, price_per_person: 15, redeem_code: null, note: '限機關、學校20人（含）以上團體，須於一週前完成網路預約申請，每人15元。' };
  r.extra.group_offer_evidence = [
    ge('票價', '全票：每張 30元｜半票：每張 15元', 'https://www.ntm.gov.tw/cp.aspx?n=5444'),
    ge('團體資格與預約', '＊半票優待：學生、6至12歲兒童，年滿65歲以上的民眾假日半票，機關學校團體二十人(含)以上(須一週前網路預約申請)', 'https://www.ntm.gov.tw/cp.aspx?n=5444'),
  ];
  r.extra.group_offer_terms = { redemption_method: '一週前完成國立臺灣博物館網路預約申請；無兌換碼。', qualification: '機關或學校團體至少20人。', mandatory_fees_twd: 0, reservation_required: true, reservation_lead_time: '一週前', valid_until: null };
}
{
  const r = by('a_nmh1');
  r.group_offer = { min_people: 10, price_per_person: 40, redeem_code: null, note: '10人以上團體適用40元優待票；官方現行票價頁未列本團體票的額外預約、同時購票或隨團免費名額，本筆不加推。國際特展另售。' };
  r.extra.group_offer_evidence = [
    ge('團體價格', '優待票新臺幣四十元', 'https://www.nmh.gov.tw/cp.aspx?n=7423'),
    ge('團體資格', '六歲以上未滿十二歲兒童、學生(持有效學生證或入學通知)、六十五歲以上長者(假日)、十人以上團體。', 'https://www.nmh.gov.tw/cp.aspx?n=7423'),
  ];
  r.extra.group_offer_terms = { redemption_method: '依國立歷史博物館現行票價頁購買團體優待票；無兌換碼。', qualification: '團體至少10人。', mandatory_fees_twd: 0, excluded_optional_costs: '另售之國際特展票。', reservation_required: null, valid_until: null };
}
{
  const r = by('a_t101');
  r.group_offer = { min_people: 20, price_per_person: 540, redeem_code: null, note: '保守依團體申請頁限定外籍團體20人（含）以上，每人540元；團體預約每日限額，填寫線上申請表單。購票資訊頁另以較廣的20人以上團體、傳真或網路預約表述，因跨頁資格不一致，本筆不擴張到本國團體。91樓視天氣狀況開放。' };
  r.extra.group_offer_evidence = [
    ge('團體申請方式', '團體預約每日採限額制，可填寫線上申請表單', 'https://www.taipei-101.com.tw/tw/observatory/application'),
    ge('外籍團體資格與價格', '外籍團體滿20人(含)，可享優惠價每位NT$540', 'https://www.taipei-101.com.tw/tw/observatory/application'),
    ge('購票資訊頁團體表述', '團體票\n20人(含)以上團體，請以傳真或網路預約', 'https://www.taipei-101.com.tw/tw/observatory/ticket/information'),
    ge('團體價格與樓層', '參觀樓層 91F;89F;88F\nNT$ 540', 'https://www.taipei-101.com.tw/tw/observatory/ticket/information'),
    ge('樓層限制', '91F 視天氣狀況不定期開放，不另行通知', 'https://www.taipei-101.com.tw/tw/observatory/ticket/information'),
  ];
  r.extra.group_offer_terms = { redemption_method: '依團體申請頁填寫線上申請表單；每日限額，無兌換碼。', qualification: '外籍團體至少20人。', mandatory_fees_twd: 0, excluded_optional_costs: '其他未列於團體票參觀樓層的加購項目。', reservation_required: true, cross_page_note: '團體申請頁明示外籍團體20人以上；購票資訊頁較廣泛寫20人以上團體可傳真或網路預約。採較窄的外籍資格，不推定本國團體也適用540元。', valid_until: null };
}
{
  const r = by('a_watr');
  r.group_offer = { min_people: 30, discount_pct: 20, redeem_code: null, note: '團體30人以上享全票8折；本筆在非夏月50元全票上記為20%折扣，不另加入未公告的資格或預約條件。' };
  r.extra.group_offer_evidence = [ge('團體門檻與折扣', '3.團體30人以上享票價8折優待。', 'https://waterpark.water.gov.taipei/cp.aspx?n=83AB9156FF18845C')];
  r.extra.group_offer_terms = { redemption_method: '依自來水園區團體票規則購票；無兌換碼。', qualification: '團體至少30人。', mandatory_fees_twd: 0, reservation_required: null, valid_from: '2026-09-01T00:00:00+08:00', valid_until: '2027-06-30T17:00:00+08:00' };
}

if (records.filter(x => x.group_offer).length !== 6) throw new Error('expected six group offers');
fs.writeFileSync(path, `${JSON.stringify(records, null, 2)}\n`);
console.log(records.filter(x => x.group_offer).map(x => ({ id: x.id, min: x.group_offer.min_people, price: x.group_offer.price_per_person, discount: x.group_offer.discount_pct })));
