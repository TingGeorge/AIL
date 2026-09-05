import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareCandidate, publicHttpsUrl } from "../src/shared/ingestion.ts";
import { candidateSchema, comparableTotal, dataStatusOf, passesGate, rowToRec } from "../src/shared/records.ts";
import { assessCatalog } from "../src/shared/catalog-quality.ts";
import { publicRecords, summarizeCatalog } from "../src/server/catalog.ts";
import { readCatalog } from "../scripts/catalog-files.ts";
import { canMarkBought } from "../src/client/purchases.ts";

const now = Date.now();
const checked = new Date(now - 60_000).toISOString();
const raw = () => ({
  id:"t_z9z9",category:"交通",agent:"paid",title:"測試票券",provider:"測試營運單位",
  price_total_twd:100, mandatory_fees_twd:0, discount_twd:0,
  quantity_or_servings:"每人一張",availability_or_event_time:"啟用後一日",
  source_url:"https://www.metro.taipei/test",source_type:"curated",source_authority:"official",
  collected_at:checked, verified_at:checked, data_status:"已驗證",
  evidence:["價格","份量","時間"].map(field => ({field,quote:"測試摘錄",url:"https://www.metro.taipei/test",checked_at:checked})),
});
const rec = (over = {}) => rowToRec(prepareCandidate({...raw(),...over},{now}));
const originalDemo = process.env.ALLOW_DEMO_DATA;
afterEach(() => { if (originalDemo === undefined) delete process.env.ALLOW_DEMO_DATA; else process.env.ALLOW_DEMO_DATA = originalDemo; });

test("provenance rejects private, reserved, credentialed and non-HTTPS URLs", () => {
  for (const url of ["http://metro.taipei/", "https://localhost/x", "https://example.com/x", "https://a.example.org", "https://127.0.0.1/", "https://[::1]/", "https://a.internal/", "https://user:secret@metro.taipei/", "https://metro.taipei:444/", "https://example.com./x", "https://example.com../x", "https://localhost./x", "https://com./x", "https://a..com/x", "https://router.home.arpa/x"]) expect(publicHttpsUrl(url)).toBe(false);
  expect(publicHttpsUrl("https://www.metro.taipei/cp.aspx?n=x")).toBe(true);
});

test("real records must explicitly declare unknown fees; null cannot rank or be marked bought", () => {
  const {mandatory_fees_twd: _, ...missing} = raw();
  expect(() => prepareCandidate(missing,{now})).toThrow("必要費用");
  const unknown = rec({mandatory_fees_twd:null, data_status:"無法納入比較"});
  expect(unknown.mandatory_fees_twd).toBeNull();
  expect(comparableTotal(unknown)).toBeNull();
  expect(passesGate(unknown)).toBe(false);
  expect(canMarkBought(unknown)).toBe(false);
  expect(() => prepareCandidate({...raw(),mandatory_fees_twd:null},{now})).toThrow();
});

test("real verification rejects future dates, empty availability and missing necessary evidence", () => {
  expect(() => prepareCandidate({...raw(),verified_at:new Date(now+3600_000).toISOString()},{now})).toThrow("未來");
  expect(() => prepareCandidate({...raw(),availability_or_event_time:""},{now})).toThrow("份量與可用時間");
  expect(() => prepareCandidate({...raw(),evidence:[]},{now})).toThrow();
  expect(() => prepareCandidate({...raw(),source_url:"https://example.com/fake"},{now})).toThrow("公開 HTTPS");
});

test("only source-backed coordinates with an address are promoted; unknown stays null", () => {
  const coordinates = {lat:25.07133,lng:121.52024,url:"https://www.metro.taipei/location"};
  const address = "臺北市大同區酒泉街9之1號";
  const record = {...raw(),address,extra:{address_source:"source",source_coordinates:coordinates},evidence:[...raw().evidence,{field:"地點",quote:address,url:coordinates.url,checked_at:checked}]};
  expect(prepareCandidate(record,{now}).lat).toBe(coordinates.lat);
  expect(prepareCandidate(record,{now}).lng).toBe(coordinates.lng);
  expect(prepareCandidate(raw(),{now}).lat).toBeNull();
  expect(() => prepareCandidate({...raw(),extra:{source_coordinates:coordinates}},{now})).toThrow("地址");
  expect(() => prepareCandidate({...record,extra:{address_source:"source",source_coordinates:{...coordinates,url:"https://www.metro.taipei/other"}}},{now})).toThrow("同 URL");
  expect(() => prepareCandidate({...record,extra:{address_source:"source",source_coordinates:{...coordinates,lat:0}}},{now})).toThrow("臺灣".replace("臺","台"));
  expect(() => prepareCandidate({...raw(),lat:25,lng:121},{now})).toThrow();
});

test("default catalog hides demonstrations and archived rows; demo exposure is explicit", () => {
  process.env.ALLOW_DEMO_DATA="0";
  const live = rec();
  const demo = {...live,id:"t_demo",extra:{demo:true}};
  const archive = {...live,id:"t_arch",extra:{archived:true}};
  const unsafe = {...live,id:"t_bad1",source_url:"javascript:alert(1)"};
  const guessed = {...live,id:"t_geo1",address:"臺北市",lat:25.07,lng:121.52};
  expect(publicRecords([live,demo,archive,unsafe])).toEqual([live]);
  expect(publicRecords([guessed],now)[0]).toMatchObject({lat:null,lng:null});
  process.env.ALLOW_DEMO_DATA="1";
  expect(publicRecords([live,demo,archive,unsafe])).toEqual([live,demo]);
});

test("unsubstantiated verified labels are downgraded without mutating the DB-shaped input", () => {
  const live = rec();
  const forged = {...live,quantity_or_servings:null};
  const visible = publicRecords([forged],now);
  expect(forged.data_status).toBe("已驗證");
  expect(visible[0]?.data_status).toBe("部分驗證／待確認");
  const summary = summarizeCatalog([forged],now);
  expect(summary.rankable).toBe(0);
  expect(summary.pending).toBe(1);
  expect(summary.latest_verified_at).toBeNull();
});

test("coverage counts expired/unknown costs as pending and never uses fixtures to fill quotas", () => {
  const live = rec();
  const expired = {...live,id:"t_old1",valid_until:new Date(now-1000).toISOString()};
  const unknown = rec({id:"t_unk1",mandatory_fees_twd:null,data_status:"無法納入比較"});
  const demo = {...live,id:"t_demo",extra:{demo:true}};
  const summary = summarizeCatalog([live,expired,unknown],now);
  expect(summary.total).toBe(3);
  expect(summary.rankable).toBe(1);
  expect(summary.pending).toBe(2);
  expect(summary.categories).toHaveLength(5);
  const quality = assessCatalog([live,expired,unknown,demo],undefined,now);
  expect(quality.ignored).toBe(1);
  expect(quality.ready).toBe(false);
  expect(quality.categories.find(category=>category.category==="交通")?.gap).toBe(6);
  expect(quality.issues.some(issue=>issue.includes("t_old1"))).toBe(true);
});

test("batch validation rejects duplicate IDs and malformed records before returning any data", async () => {
  const directory = await mkdtemp(join(tmpdir(),"ail-catalog-validation-"));
  try {
    await Bun.write(join(directory,"a.json"),JSON.stringify([raw()]));
    await Bun.write(join(directory,"b.json"),JSON.stringify([raw()]));
    await expect(readCatalog(directory,false)).rejects.toThrow("重複 id");
    await Bun.write(join(directory,"b.json"),JSON.stringify([{...raw(),id:"t_z9z8",price_total_twd:-1}]));
    await expect(readCatalog(directory,false)).rejects.toThrow("b.json");
    await Bun.write(join(directory,"b.json"),JSON.stringify([{...raw(),id:"t_z9z8",mandatory_fees_twd:null,data_status:"無法納入比較"}]));
    const batch = await readCatalog(directory,false);
    expect(batch.records).toHaveLength(2);
    expect(batch.records[1]?.mandatory_fees_twd).toBeNull();
  } finally { await rm(directory,{recursive:true,force:true}); }
});


test("batch validation rejects files that contain no candidate rows", async () => {
  const directory = await mkdtemp(join(tmpdir(),"ail-catalog-empty-"));
  try {
    await Bun.write(join(directory,"empty.json"),"[]");
    await expect(readCatalog(directory,false)).rejects.toThrow("沒有任何候選紀錄");
  } finally { await rm(directory,{recursive:true,force:true}); }
});


test("omitted mandatory fees cannot become zero through the shared schema or domain helpers", () => {
  const {mandatory_fees_twd: _, ...missing} = raw();
  expect(candidateSchema.safeParse(missing).success).toBe(false);
  expect(candidateSchema.parse(raw()).mandatory_fees_twd).toBe(0);
  const runtimeMissing = {...rec(),mandatory_fees_twd:undefined} as unknown as ReturnType<typeof rec>;
  expect(comparableTotal(runtimeMissing)).toBeNull();
  expect(dataStatusOf(runtimeMissing)).toBe("無法納入比較");
  expect(passesGate(runtimeMissing)).toBe(false);
  expect(publicRecords([runtimeMissing],now)[0]?.data_status).toBe("無法納入比較");
});
