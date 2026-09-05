from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from html.parser import HTMLParser
import json, subprocess, hashlib
ROOT = Path(__file__).parent
S = ROOT / 'snapshots'
urls = {
'easycard-funpass': 'https://www.easycard.com.tw/easycard?cls=1514964214&id=1510819513',
'funpass-gov-faq': 'https://www.tpedoit.gov.taipei/News_Content.aspx?n=4F905810069A3EC5&s=5FBAC4D99BB609C6&sms=87415A8B9CE81B16',
'nttickets-correct': 'https://www.ntmetro.com.tw/basic/?node=10102',
'ntbike-correct': 'https://www.ntmetro.com.tw/basic/?mode=detail&node=3',
'group-ty': 'https://www.tymetro.com.tw/tymetro-new/tw/_pages/travel-guide/ticketson02.php',
}
class Extract(HTMLParser):
 def __init__(self): super().__init__(); self.out=[];self.skip=0
 def handle_starttag(self,t,a):
  if t in ['script','style']: self.skip+=1
  if t in ['div','p','br','tr','td','h1','h2','h3','li']:self.out.append('\n')
 def handle_endtag(self,t):
  if t in ['script','style']:self.skip=max(0,self.skip-1)
  if t in ['div','p','tr','td','li']:self.out.append('\n')
 def handle_data(self,d):
  if not self.skip:self.out.append(d)
def fetch(item):
 key,url=item;p=S/(key+'.html');before=datetime.now().astimezone().isoformat(timespec='seconds')
 r=subprocess.run(['curl','-fLsS','--max-time','40','-w','%{http_code}\t%{url_effective}',url,'-o',str(p)],capture_output=True,text=True)
 d={'key':key,'url':url,'started_at':before,'retrieved_at':datetime.now().astimezone().isoformat(timespec='seconds'),'returncode':r.returncode,'http':r.stdout,'error':r.stderr,'file':str(p.resolve())}
 if r.returncode==0:
  d['sha256']=hashlib.sha256(p.read_bytes()).hexdigest();x=Extract();x.feed(p.read_text());p.with_suffix('.txt').write_text('\n'.join(s.strip() for s in ''.join(x.out).splitlines() if s.strip())+'\n')
 return d
if __name__=='__main__':
 rows=list(ThreadPoolExecutor(max_workers=5).map(fetch,urls.items()));(ROOT/'audit-fetch-log.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n');print(json.dumps(rows,ensure_ascii=False,indent=2))
