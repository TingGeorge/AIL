import { readFileSync } from "node:fs";

const mapping = new Map(Object.entries({
  "https://job.taiwanjobs.gov.tw/Internet/Index/DocDetail.aspx?docid=17062&uk=1420": "taiwanjobs.txt",
  "https://job.taiwanjobs.gov.tw/Internet/jobwanted/job_newuser02.aspx": "taiwanjobs-newuser.txt",
  "https://www.laf.org.tw/service-legal-advice/1": "laf-onsite.txt",
  "https://www.mol.gov.tw/1607/28162/28296/81778/81802/81951/": "labor-mol.txt",
  "https://bola.gov.taipei/News_Content.aspx?n=1A6417117CA20D98&s=9598CEC46364ACB0&sms=31B6C0BAB6E11488": "labor-taipei.txt",
  "https://www.foi.org.tw/Article.aspx?Arti=1616&Lang=1&lid=645": "foi-fee.txt",
  "https://www.foi.org.tw/Article.aspx?Arti=1622&Lang=1&p=3": "foi-process.txt",
  "https://www.familycare.org.tw/taxonomy/term/892": "caregiver-provider.txt",
  "https://www.familycare.org.tw/contact": "caregiver-contact.txt",
  "https://dementia.gov.taipei/News_Content.aspx?n=04825D3265339708&s=65C3246500BEEBAD&sms=D3FC34DCF234E6DD": "dementia.txt",
  "https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=4705&pid=17752": "smoking.txt",
  "https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=4705&pid=16871": "maternal.txt",
  "https://www.hpa.gov.tw/Pages/List.aspx?nodeid=94": "hpa-hotlines.txt",
  "https://itaiwan.gov.tw/ITaiwanArticle/Contents?articleId=80": "itaiwan-faq.txt",
  "https://elearning.taipei/mpage/about_us": "taipei-elearning-about.txt",
  "https://www.ebookservice.tw/support/faq": "cloud-faq-rendered.txt",
  "https://www.ebookservice.tw/tp/support/library-guide?mode=full": "cloud-library-rendered.txt",
  "https://blind.tpml.gov.taipei/TaipeiLib/wSite/ct?ctNode=338&xItem=64090": "blind-library-tls-bypass.txt",
  "https://tpml.gov.taipei/News_Content.aspx?n=E5F579B94C9D2941&s=0B14D794801EB4E3": "tpml-card-fee.txt",
  "https://tpml.gov.taipei/News_Content.aspx?n=E5F579B94C9D2941&s=3042D939FA6A98F3": "tpml-card-how.txt",
  "https://coach.taiwanjobs.gov.tw/wdaecPublic/": "youth-career.txt",
}));
const norm = value => value.normalize("NFC").replace(/\s+/gu, " ").trim();
const records = JSON.parse(readFileSync("prototype-v1/data/live/免費公益資源-expansion.json", "utf8"));
let matched = 0;
const failures = [];
for (const record of records) {
  for (const evidence of record.evidence) {
    const file = mapping.get(evidence.url);
    if (!file) { failures.push(`${record.id}/${evidence.field}: no snapshot mapping for ${evidence.url}`); continue; }
    const text = readFileSync(`.scratch/catalog-expansion/community/${file}`, "utf8");
    if (!norm(text).includes(norm(evidence.quote))) failures.push(`${record.id}/${evidence.field}: quote missing from ${file}`);
    else matched += 1;
  }
}
console.log(JSON.stringify({ records: records.length, evidence: records.reduce((n,r)=>n+r.evidence.length,0), matched, failures }, null, 2));
if (failures.length) process.exit(1);
