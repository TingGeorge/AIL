#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
import html, re, subprocess
ROOT = Path(__file__).resolve().parent
class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.skip=0; self.out=[]; self.title=[]; self.in_title=False
    def handle_starttag(self, tag, attrs):
        if tag in {'script','style','noscript','svg'}: self.skip += 1
        if tag == 'title': self.in_title=True
        if tag in {'p','li','br','div','h1','h2','h3','h4','h5','h6','tr','td','th','dt','dd'}: self.out.append('\n')
    def handle_endtag(self, tag):
        if tag in {'script','style','noscript','svg'} and self.skip: self.skip -= 1
        if tag == 'title': self.in_title=False
        if tag in {'p','li','div','h1','h2','h3','h4','h5','h6','tr'}: self.out.append('\n')
    def handle_data(self, data):
        if self.skip: return
        if self.in_title: self.title.append(data)
        self.out.append(data)
for body in sorted(ROOT.glob('*.body')):
    out=body.with_suffix('.txt')
    if body.read_bytes()[:4] == b'%PDF':
        subprocess.run(['pdftotext','-layout',str(body),str(out)],check=True)
        continue
    p=Text(); p.feed(body.read_text(errors='replace'))
    text=''.join(p.out).replace('\xa0',' ')
    lines=[]
    for raw in text.splitlines():
        line=re.sub(r'\s+',' ',html.unescape(raw)).strip()
        if line: lines.append(line)
    title=re.sub(r'\s+',' ',' '.join(p.title)).strip()
    out.write_text((f'TITLE: {title}\n' if title else '')+'\n'.join(lines)+'\n')
