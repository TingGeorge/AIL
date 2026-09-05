from pathlib import Path
from datetime import datetime
import json, hashlib
ROOT = Path(__file__).resolve().parents[3]
SCRATCH = ROOT / '.scratch/catalog-expansion/transport'
FILE = ROOT / 'prototype-v1/data/live/交通-expansion.json'
rows = json.loads(FILE.read_text())
assert len(rows)==16
before=FILE.read_bytes()
if not (SCRATCH/'before-correction.json').exists(): (SCRATCH/'before-correction.json').write_bytes(before)
now = datetime.now().astimezone().isoformat(timespec='seconds')
by = {r['id']:r for r in rows}
TP='https://www.tpass.tw/faq'
NT='https://www.ntmetro.com.tw/basic/?node=10102'
NB='https://www.ntmetro.com.tw/basic/?mode=detail&node=3'
GOV='https://www.tpedoit.gov.taipei/News_Content.aspx?n=4F905810069A3EC5&s=5FBAC4D99BB609C6&sms=87415A8B9CE81B16'
EC='https://www.easycard.com.tw/easycard?cls=1514964214&id=1510819513'
TY='https://www.tymetro.com.tw/tymetro-new/tw/_pages/travel-guide/ticketson01.php'
TJ='https://www.tymetro.com.tw/tymetro-new/tw/_pages/travel-guide/ticketson04.php'
TG='https://www.tymetro.com.tw/tymetro-new/tw/_pages/travel-guide/ticketson02.php'
TF='https://www.tymetro.com.tw/tymetro-new/upload/ckupload/20241213_11052534.pdf'
BUS='https://taipeisightseeing.com.tw/'
JS='https://taipeisightseeing.com.tw/assets/index-CL_Fz9_Y.js'
snapshots={TP:'tpass.txt',NT:'nttickets-correct.txt',NB:'ntbike-correct.txt',GOV:'funpass-gov-faq.txt',EC:'easycard-funpass.txt',TY:'ty1.txt',TJ:'tyjoint.txt',TG:'group-ty.txt',TF:'tyfare.txt',JS:'bus-app.js'}
def e(field,quote,url):return dict(field=field,quote=quote,url=url,checked_at=now)
def apply(id,source,evidence,**fields):
 r=by[id];r.update(fields);r['source_url']=source;r['action_url']=source;r['evidence']=evidence
 r['collected_at']=now;r['verified_at']=now
 r['extra']['research_batch']='expansion-2026-09-05'
 r['extra']['correction_audit']={'checked_at':now,'method':'官方公開HTTP HTML/PDF/網站前端資源逐字比對；web.run開啟官方網址作交叉查核，未將空白回應或搜尋摘要當引文。','verbatim_quotes_only':True}
 r['lat']=r['lng']=None
 return r
r=apply('t_p120',NT,[e('價格','基北北桃跨城際定期票(1,200元)',TP),e('份量','基隆市、新北市、臺北市、桃園市',NT),e('資格','一般實體悠遊卡，包含普通卡',NT),e('時間','連續30日',NT),e('費用','民眾可以使用原有卡片購買公共運輸定期票',TP)],
 title='基北北桃都會通定期票',
 quantity_or_servings='一張定期票，啟用當日含起連續30日，於基北北桃方案適用範圍搭乘；不表示所有跨區路線均可用',
 eligibility=['已持可設定基北北桃都會通的一般實體悠遊卡普通卡；本筆不含另購票卡'],
 availability_or_event_time='購買設定後30日內啟用；自啟用當日（含）起連續30日，搭乘依各營運者班次',registration_required=False)
r['extra'].update(scope='使用已持有的一般實體悠遊卡普通卡，在車站設定1,200元定期票；比較核心大眾運輸方案，不把公共自行車優惠當作無條件取得的服務。',pricing_context='1,200元為定期票價格；已持相容票卡，因此本筆不另購卡。另購TPASS實體卡的100元為卡片售價，不是可退押金，也不是儲值金。購卡補助需另符官方條件，未預先扣除。',review_notes=['修正舊引文把一卡通、愛金卡一概視為本生活圈可設定載具的錯誤；本筆僅採官方列出的既有悠遊卡普通卡。','設定後30日內須啟用，與啟用後連續30日是兩個不同期限。','公車、臺鐵、公路與國道客運仍限官方方案範圍；YouBike須另符合註冊、票卡綁定、保險及各縣市優惠規則。','100元購卡補助不當成每位旅客都適用的即時減價，也不列成可退押金。'])
for id,days,cn,price in [('t_fp1d',1,'一',210),('t_fp2d',2,'二',340),('t_fp3d',3,'三',470),('t_fp5d',5,'五',730)]:
 r=apply(id,GOV,[e('價格',f'{cn}日券{price}元',GOV),e('份量','一張票卡僅限一人使用。',EC),e('時間','以票卡正面標示之天數為有效天數，必須連續使用',EC),e('費用','本卡不含押金、不具再加值功能。',EC)],
 title=f'北北基好玩卡|交通暢遊卡（{cn}日券）',
 quantity_or_servings=f'一張票卡限一人，自啟用當日起連續{days}日，於列明交通範圍不限次數搭乘',
 eligibility=[],registration_required=False,
 availability_or_event_time=f'自第一次使用當日（含）起連續{days}個日曆日，至到期日臺北捷運、公車營業截止時間；不是{days*24}小時票',source_authority='official')
 r['extra'].update(scope='臺北捷運各站詢問處或悠遊卡市府轉運站客服中心現場購買交通暢遊實體卡；不含宅配、貓纜版、景點卡或無限暢遊卡。',pricing_context=f'政府FAQ公告{cn}日券{price}元，為包含實體票卡的售價；現場購買無宅配費，卡不含押金且不可加值。未將退款手續費或可選服務當成必要費，也未重複扣折扣。',review_notes=['原商品頁直接HTTP取得403，已改用臺北市政府FAQ價格及發卡方悠遊卡使用條款；不是將未取得內容改寫成引文。','本筆採現場購票，無須預先官網訂購、帳號或自取預約；移除原本混入的網購資格。','適用臺北捷運、臺北市／新北市／基隆市公車，以及九份金瓜石、北投竹子湖、木柵平溪、皇冠北海岸、黃金福隆、濱海奇基6條台灣好行；不包含編碼4碼公路客運及專車。','不含桃園機場捷運；效期按連續日曆日，不按24小時計。','官方僅寫超過50張可洽詢團購，未明列實際折扣，且張數不等於人數；不設定group_offer。'])
r=apply('t_tm1d',TY,[e('價格','優惠價 320元/張',TY),e('份量','不限區間、不限次數、不限車種搭乘',TY),e('時間','啟用後於當日營運結束前',TY),e('費用','本票卡不具加值功能且不含押金。',TY)],
 title='桃園機場捷運一日票',eligibility=[],registration_required=False,
 quantity_or_servings='每人一張一日票；啟用當日不限區間、次數及車種搭乘桃園機場捷運',availability_or_event_time='啟用後至當日營運結束有效；不是連續24小時，搭乘以車站實際班次為準')
r['extra'].update(scope='車站詢問處購買普通一日票單張，不含聯名、贈品或多人套票組。',pricing_context='單張320元為官方現行優惠售價；票卡不含押金、不可加值，無另購卡費。discount_twd維持0，不把售價中的優惠再扣一次。',review_notes=['4張1,280元等於每張320元，並無人數折扣，不建立團購。','同頁混列歷年聯名促銷；不採用已過期的2020年雙張75折等活動。','票價可比較的是一日票本體，不含未列明之加購服務。'])
for id,hours,price in [('t_tm48',48,520),('t_tm72',72,600)]:
 r=apply(id,TJ,[e('價格',f'機捷來回票+北捷{hours}小時票：{price}元',TJ),e('份量','搭乘2次桃園機場捷運',TJ),e('時間','自首次刷卡進入臺北捷運車站之時間起計連續48/72小時',TJ),e('費用','本套票以優惠價格出售，套票內之票卡不得轉售予他人。',TJ)],
 title=f'機捷來回票+北捷{hours}小時票',eligibility=[],registration_required=False,
 quantity_or_servings=f'一人套票，含機場捷運任選起訖站2次搭乘及臺北捷運連續{hours}小時不限次搭乘',
 availability_or_event_time=f'北捷票自首次刷卡進站起連續{hours}小時；機捷部分限2次，來源未明示60日使用限制，各運具依班次營運')
 r['extra'].update(scope='在桃園機場捷運A1台北車站、A12機場第一航廈站或A13機場第二航廈站以現金購買整套票；不是兩個人的團體票。',pricing_context=f'官方整套售價{price}元，包含機捷票卡與北捷票卡；比較站內現金售出的完整套票，無須另備儲值載具。未使用成套退票時的20元手續費是可選退款成本，不加在必要購票費；未主張票卡具有可退押金。',review_notes=['刪除先前無來源支持的「60日內」條件；機捷兩趟的額外啟用截止未在本頁明示，不自行推定。','機捷兩趟都可任選起訖站，不強制同路線往返；北捷時數從首次刷卡進站起算。','北捷48/72小時票與機捷來回票是同一套商品，不是兩人優惠；未設定group_offer。','20元只在未使用票卡成套退票時收取；原「套票不含押金」斷言改為實際整套票卡售價的費用依據。'])
r=apply('t_a1a3',TY,[e('價格','160',TF),e('份量','單程票',TY),e('時間','發售當日營運時間內有效。',TY),e('費用','出站時由自動收費閘門回收。',TY)],
 title='桃園機場捷運單程票（A1台北車站→A13機場第二航廈站）',eligibility=[],registration_required=False,
 quantity_or_servings='一人由A1台北車站至A13機場第二航廈站單程全票一次；160元不是全團總價',
 availability_or_event_time='發售當日營運時間內有效；直達車與普通車依搭乘日班次，不把車站05:00開門視為此行程首班車')
r['extra'].update(scope='A1台北車站至A13機場第二航廈站，單程一般全票；不含敬老、身障、兒童或市民卡補助。團體另依group_offer條件。',pricing_context='一般全票160元／人，購買一次使用的單程票，出站回收，不需另購電子票證或儲值。基本價格與discount_twd=0不預先套用團體優惠。',review_notes=['官方PDF第1頁三角票價表：A13機場第二航廈站橫列與A1臺北車站直欄交格為160；價格引文只摘實際儲存格「160」，站別判讀是推導，不冒充完整原文。','PDF標示114年1月2日起實施，這是票價生效日，不是本次HTTP查核時間。','未將A1車站開放時間05:00~末班車誤當A1→A13列車時刻。','160元為每人單程；10人以上當日同進同出現場團體購票可用8折，不與其他資格優惠重疊。'],fare_cell={'page':1,'row':'A13機場第二航廈站','column':'A1臺北車站','cell_text':'160','image':'tyfare-page.png'})
r['group_offer']={'min_people':10,'discount_pct':20,'redeem_code':None,'note':'現場團體購票：10人以上於車站詢問處購買當日團體票，不可預購、不予退票；全團須同一起訖、團進團出並由公務門進出站。A1→A13一般全票160元的8折為每人128元，不是全團總價，亦不與其他票種優惠重複套用。'}
r['extra']['group_offer_evidence']=[e('人數','10人以上團體',TG),e('折扣','依公告票價之8折收費',TG),e('兌換','車站詢問處',TG),e('購票限制','不可預購。',TG),e('同行條件','旅客須團進團出，由公務門進出站。',TG),e('期限','發售當日營運時間內有效',TG),e('退票','不予退票',TG)]
r['extra']['group_offer_terms']={'redemption_method':'現場團體購票：10人以上於車站詢問處購買同日起訖站一致的團體票，不可預購，須團進團出由公務門通行，出站由站務人員回收；無兌換碼。','valid_until':None,'valid_from':None,'ticket_validity':'發售當日營運時間內有效','source_url':TG,'checked_at':now,'price_basis':'一般公告全票160元×0.8＝128元／人；此計算為推導，非引文。'}
r=apply('t_nt1d',NT,[e('價格','50元',NT),e('份量','限1人使用。',NT),e('時間','本票限發售或啟用當日營運時間內有效，當天營運時間內可不限次數搭乘。',NT)],
 title='新北捷運輕軌一日票（紙票）',eligibility=[],registration_required=False,
 quantity_or_servings='一張紙票限一人，發售或啟用當日於新北捷運輕軌系統營運區間不限次數搭乘',
 availability_or_event_time='發售或啟用當日營運時間內有效；使用時須蓋日期戳章，首末班依搭乘車站時刻表')
r['extra'].update(scope='僅車站詢問處出售的50元紙本一日票；限新北捷運輕軌系統，不擴張至環狀線等一般捷運。',pricing_context='紙本一日票完整售價50元，紙票為搭乘憑證，無須另買儲值卡；合作APP的QR Code票另依合作方案收費，不宣稱一律50元。',review_notes=['修正失效來源node=10022為票價與票種node=10102。','紙票使用時須蓋印日期戳章；發售或啟用當日有效，不是連續24小時。','刪除無來源支持的06:00–24:00；頁尾07:00–23:00是客服時間，不是列車時刻。','官方團體票是單次使用之另一票種，不能把其10人8折套用在此一日票。'])
r=apply('t_ntbk',NT,[e('價格','單一票價收費新台幣50元',NB),e('份量','人車須一同進出車站',NT),e('資格','長180公分、高120公分、寬70公分以下非動力式腳踏車',NB),e('時間','車票限發售1小時內有效，逾期作廢。',NT)],
 title='新北捷運輕軌自行車單程票',eligibility=['攜帶長180公分、高120公分、寬70公分以下非動力式腳踏車；人車同進同出，依指定車廂及位置搭乘'],registration_required=False,
 quantity_or_servings='一名旅客與一輛自行車人車合併計費，單趟不限里程；不可把50元當成自行車附加費再加一次人票',
 availability_or_event_time='發售1小時內有效；輕軌營運時段開放，但上班日07–09、17–19及公告特定疏運日期除外')
r['extra'].update(scope='旅客攜帶未包裝的一般非動力自行車，在新北捷運輕軌開放時段單次搭乘；不混同包裝完整折疊車的隨身攜帶物規則。',pricing_context='50元已合併人與車的單趟費用；售票機購票，不必另買電子卡、付押金或儲值。',review_notes=['修正失效來源，增加自行車服務正式規定頁mode=detail&node=3。','補上發售1小時內有效，以及上班日07–09、17–19禁帶自行車時段。','只可停放第2、第4車多功能區，各區2輛、每列車共4輛；擁擠時須等下一班，特殊疏運可暫停。','不得騎乘或滑乘、不得搭電扶梯；使用旅客通道、無障礙坡道或電梯進出。','不把普通旅客團體票折扣推定適用人車合併票；group_offer維持null。'])
common_bus_notes=['引文由本次下載的官方公開網站前端資源bus-app.js逐字取得；新站版本與主agent直接開啟的版本文字不同，未把改寫或QA轉述冒充同一份來源原文。','本筆按現場向車服人員購票的票種本體比較；不混入官網線上購票或電話團體預訂規則，也不推定班次保證有座。','一般票價未套用65歲、兒童、身障或臺北市敬老悠遊卡點數補助；這些限定資格的金額不是本筆通用售價。']
for id,name,price,quantity,time,quantity_quote,time_quote in [
 ('t_dd24','24小時票',660,'一人一票；官網此票說明為首次搭乘日及次日營業時間內不限次數上下車，紅藍線可搭','首次搭乘日及次日有效，僅營業時間內；依官方此票說明，不自行改成首次使用後精確24小時','可不限次數上下車使用','首次搭乘日及次日有效'),
 ('t_dd48','48小時票',1100,'一人一票，首次搭乘起48小時內紅藍線不限次數上下車；排除公告不適用班次','首次搭乘起48小時內有效，仍限營業班次；不是巴士全日24小時營運','可不限次數上下車使用','首次搭乘起，48小時內有效'),
 ('t_dddy','日間票',550,'一人一票，當日營業時間內紅藍線不限次數搭乘；排除公告不適用班次','當日營運時間內有效；沒有16:00前班次的限制，依當日適用紅藍線時刻表','營業時間內紅、藍線任意搭乘','當天有效'),
 ('t_dd4h','4小時票',330,'一人一票，啟用4小時內紅藍線任意搭乘；排除公告不適用班次','啟用起4小時內有效，仍須符合適用紅藍線營運班次','紅、藍線任意搭乘','啟用4小時內'),
 ]:
 r=apply(id,BUS,[e('價格',f'$ {price}',JS),e('份量',quantity_quote,JS),e('時間',time_quote,JS)],title=f'台北市雙層觀光巴士{name}',eligibility=[],registration_required=False,quantity_or_servings=quantity,availability_or_event_time=time)
 r['extra'].update(scope=f'每人一張{name}、現場購票，使用台北市雙層觀光巴士紅／藍線適用班次；不是其他市區公車通用票，也不保證所有班次都使用雙層車。',pricing_context=f'現行一般票價{price}元／人，未重複扣優惠；scope限定現場購入一次票券本體，不以儲值卡購卡費、錢包儲值金或敬老補助充當車資。',review_notes=common_bus_notes.copy(),evidence_resource={'page_url':BUS,'resource_url':JS,'snapshot':'snapshots/bus-app.js'})
 if id=='t_dd24': r['extra']['review_notes'].append('雖名為24小時票，目前前端原文寫「首次搭乘日及次日有效」；按官方這段期限記錄，刪除原先精確24小時計時的推論。')
 if id=='t_dddy': r['extra']['review_notes'].append('修正原先錯寫的16:00前班次；當日營運時間內可不限次數搭乘。這是欄位描述，未冒充本次前端逐字引文。')
 if id in ['t_dd48','t_dddy','t_dd4h']:
  r['extra']['review_notes'].append('主agent直接開啟官網的QA補充：部分hihi bus班次為單層巴士且不適用48小時票、4小時票及日間票。保留此限制並排除此類班次；本次前端快照未包含hihi文字，不能把QA轉述放進evidence.quote。')
  r['extra']['qa_addendum']={'source_url':BUS,'provenance':'本task主agent官方頁面交叉QA訊息；不是本次HTTP資源的逐字引文','checked_at':None,'condition':'部分hihi bus班次為單層巴士，不適用48小時票、4小時票及日間票。','handling':'本筆scope排除這些班次；搭乘前須依官網時刻表確認。'}
r=apply('t_dd1x',BUS,[e('價格','$ 170',JS),e('份量','限搭乘紅線或藍線一次，下車失效',JS),e('資格','國人限定，含有本國居留證的外國人亦可。',JS),e('時間','首末班發車時間 09:10-18:50',JS)],title='台北市雙層觀光巴士單次票（國人／持本國居留證者）',eligibility=['中華民國國民，或持本國居留證的外國人'],registration_required=False,
 quantity_or_servings='每人一張、紅線或藍線一次，下車失效；不論哪一站上車最遠只到臺北車站，不能繞回原上車站',
 availability_or_event_time='僅當次紅線或藍線旅程；票種頁列首末班09:10–18:50，並非兩線每站均以此為首末班，仍以當日各線時刻表為準')
r['extra'].update(scope='符合國人／本國居留證資格者，上車購買170元單次票；任一站上車只可搭至臺北車站，下車失效，不涵蓋網路或電話預訂。',pricing_context='170元是資格限定的單次票全額，不是無資格旅客的一般價；不套用85元優待票或敬老點數。上車購入當次票券，不加入非必要儲值卡成本。',review_notes=common_bus_notes.copy()+['補上上車購票限定，並把任一上車站最遠只至臺北車站、不能搭回原上車點寫入scope及份量。','原先藍線09:40–16:30的引文未有逐字來源，已刪；本次僅引用票種段落實際列出的09:10–18:50，並說明仍依各線時刻表。','主agentQA版明示單次票限上車購票；本次新站前端同時有通用購物車與優待票車上購買文字，故採較保守的上車購票scope，不拿通用購物流程當170元線上可買的證據。'],evidence_resource={'page_url':BUS,'resource_url':JS,'snapshot':'snapshots/bus-app.js'},qa_addendum={'source_url':BUS,'provenance':'主agent官方頁面交叉QA；本次前端另可逐字查到終點臺北車站限制','checked_at':None,'condition':'單次170元限上車購票；不論任何一站上車只能搭乘至臺北車站。'})
r['extra']['terminal_evidence']=e('終點限制','提醒您終點站為台北車站，並無法搭回原上車點。',JS)
# The schema only accepts price/quantity/eligibility/time/location in primary evidence.
# Retain fee evidence verbatim under extra, without inventing a new schema field.
for record in rows:
 fees=[item for item in record['evidence'] if item['field']=='費用']
 record['evidence']=[item for item in record['evidence'] if item['field']!='費用']
 if fees: record['extra']['fee_evidence']=fees
# Verify exact character substrings, not approximate/paraphrase/whitespace-normalized matches.
checks=[]
for r in rows:
 assert r['data_status']=='已驗證'
 assert r['extra']['research_batch']=='expansion-2026-09-05'
 entries=r['evidence']+r['extra'].get('group_offer_evidence',[])+r['extra'].get('fee_evidence',[])
 if 'terminal_evidence' in r['extra']:entries.append(r['extra']['terminal_evidence'])
 for x in entries:
  path=SCRATCH/'snapshots'/snapshots[x['url']];text=path.read_text();pos=text.find(x['quote'])
  if pos<0:raise ValueError(f"Not verbatim: {r['id']} {x}")
  checks.append({'id':r['id'],'field':x['field'],'quote':x['quote'],'url':x['url'],'snapshot':str(path.relative_to(SCRATCH)),'offset':pos,'line':text[:pos].count('\n')+1,'exact_match':True})
assert len({r['id'] for r in rows})==16
assert all(r['discount_twd']==0 for r in rows)
FILE.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
(SCRATCH/'quote-audit.json').write_text(json.dumps({'checked_at':now,'method':'exact substring, no paraphrase or normalization','records':16,'quotes':len(checks),'passed':True,'checks':checks},ensure_ascii=False,indent=2)+'\n')
source_notes=[]
for url,filename in snapshots.items():
 ids=sorted({x['id'] for x in checks if x['url']==url}); p=SCRATCH/'snapshots'/filename
 source_notes.append({'url':url,'ids':ids,'snapshot':str(p.relative_to(SCRATCH)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'checked_at':now})
(SCRATCH/'official-source-notes.json').write_text(json.dumps({'checked_at':now,'research_batch':'expansion-2026-09-05','sources':source_notes,'limitations':['FunPASS商品頁HTTP 403；價格改用政府FAQ、條款改用官方發卡方。','新北兩個舊連結導回首頁；已改用node=10102及自行車mode=detail&node=3。','觀光巴士本次HTML為JS應用程式；引文定位到官方公開前端資源，不把改寫句冒充原文。','hihi bus及170元上車購票更嚴規則來自主agent官網QA，單獨保留限制及來源歸屬，不偽造HTTP時間或quote。'],'group_offers':{'verified_ids':['t_a1a3'],'not_applied':{'t_tm1d':'四張1280元沒有折扣','t_tm48,t_tm72':'單人套票不是人數優惠','t_fp1d,t_fp2d,t_fp3d,t_fp5d':'超過50張可洽詢，未有明確折扣且不是people門檻','t_nt1d,t_ntbk':'普通單程團體票不能擴張到一日票或人車票','sightseeing':'未找到明示人數及折扣的同票種優惠'}}},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'written':str(FILE),'records':len(rows),'verbatim_checks':len(checks),'checked_at':now,'group_ids':['t_a1a3']},ensure_ascii=False))
