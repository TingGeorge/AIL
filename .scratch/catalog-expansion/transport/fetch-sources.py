import concurrent.futures, subprocess, json, datetime, hashlib
from pathlib import Path
from html.parser import HTMLParser
ROOT = Path(__file__).parent
sources = {
 'tpass': 'https://www.tpass.tw/faq',
 'tpass-nt': 'https://www.ntmetro.com.tw/basic/?node=10105',
 'fun1': 'https://funpass.travel.taipei/tour/ZB4?lang=zh_TW',
 'fun2': 'https://funpass.travel.taipei/tour/9YP?lang=zh_TW',
 'fun3': 'https://funpass.travel.taipei/tour/04V?lang=zh_TW',
 'fun5': 'https://funpass.travel.taipei/tour/71d?lang=zh_TW',
 'ty1': 'https://www.tymetro.com.tw/tymetro-new/tw/_pages/travel-guide/ticketson01.php',
 'tyjoint': 'https://www.tymetro.com.tw/tymetro-new/tw/_pages/travel-guide/ticketson04.php',
 'tyfare': 'https://www.tymetro.com.tw/tymetro-new/upload/ckupload/20241213_11052534.pdf',
 'tya1': 'https://www.tymetro.com.tw/tymetro-new/tw/_pages/travel-guide/A1',
 'ntticket': 'https://www.ntmetro.com.tw/basic/?node=10022',
 'ntservice': 'https://www.ntmetro.com.tw/content/?parent_id=10074',
 'bus': 'https://taipeisightseeing.com.tw/',
 'buswww': 'https://www.taipeisightseeing.com.tw/',
}
class P(HTMLParser):
 def __init__(self):super().__init__();self.out=[];self.skip=0
 def handle_starttag(self,t,a):
  if t in ['script','style']: self.skip+=1
 def handle_endtag(self,t):
  if t in ['script','style']: self.skip=max(0,self.skip-1)
 def handle_data(self,s):
  if not self.skip and s.strip(): self.out.append(s.strip())
def fetch(item):
 k,u=item; ext='pdf' if '.pdf' in u else 'html'; file=ROOT/'snapshots'/f'{k}.{ext}'
 p=subprocess.run(['curl','-fLsS','--max-time','60','-D',str(file.with_suffix('.headers')),'-o',str(file),'-w','%{http_code}\t%{url_effective}',u],capture_output=True,text=True)
 out={'key':k,'url':u,'retrieved_at':datetime.datetime.now().astimezone().isoformat(timespec='seconds'),'returncode':p.returncode,'http':p.stdout,'error':p.stderr,'file':str(file)}
 if p.returncode==0:
  raw=file.read_bytes();out['sha256']=hashlib.sha256(raw).hexdigest()
  if ext=='html':
   h=P();h.feed(raw.decode('utf-8','replace'));file.with_suffix('.txt').write_text('\n'.join(h.out))
 return out
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(fetch,sources.items()))
(ROOT/'fetch-log.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(results,ensure_ascii=False,indent=2))
