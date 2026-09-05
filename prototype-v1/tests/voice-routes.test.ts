import { afterEach, beforeEach, expect, test } from "bun:test";
import { app } from "../src/server/index.ts";
import { EMPTY_NEED } from "../src/shared/need.ts";
import { MAX_AUDIO_BYTES } from "../src/server/voice.ts";

const keys = ["GEMINI_API_KEY", "GEMINI_MODEL"] as const;
let saved: (string | undefined)[];
let originalFetch: typeof fetch;
let calls: RequestInit[];
const result = {transcript:"兩人晚餐三百元", need:{...EMPTY_NEED,need:"晚餐",people_or_servings:2,budget_total_twd:300}};
const completed = (value: unknown) => ({status:"completed",steps:[{type:"model_output",content:[{type:"text",text:JSON.stringify(value)}]}]});
beforeEach(() => {
  saved=keys.map(key=>process.env[key]); originalFetch=globalThis.fetch; calls=[];
  process.env.GEMINI_API_KEY="fake-test-key"; process.env.GEMINI_MODEL="gemini-test";
  globalThis.fetch=(async (_url: Parameters<typeof fetch>[0],init?: RequestInit)=>{calls.push(init!);return Response.json(completed(result));}) as unknown as typeof fetch;
});
afterEach(()=>{
  globalThis.fetch=originalFetch;
  keys.forEach((key,i)=>{if(saved[i]===undefined)delete process.env[key];else process.env[key]=saved[i];});
});
const webm = new Uint8Array([0x1a,0x45,0xdf,0xa3,0,0,0,0,0,0,0,0]);
function upload(bytes: Uint8Array=webm,type="audio/webm;codecs=opus") {
  const form=new FormData();form.append("audio",new File([bytes as Uint8Array<ArrayBuffer>],"clip.webm",{type}));
  return form;
}
const voice=(body:BodyInit)=>app.request("/api/voice",{method:"POST",body});

test("voice directly returns transcript and schema-validated needs in one call, with no-store",async()=>{
  const res=await voice(upload());
  expect(res.status).toBe(200);expect(await res.json()).toEqual(result);
  expect(res.headers.get("Cache-Control")).toBe("no-store");expect(calls).toHaveLength(1);
  const body=JSON.parse(String(calls[0]!.body));
  expect(body.input[1].mime_type).toBe("audio/webm");
  expect(JSON.parse(body.input[0].text).today).toBe(new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"}));
});
test("config exposes voice capability without old STT flag or credentials",async()=>{
  const res=await app.request("/api/config");const config=await res.json();
  expect(config.voice).toBe(true);expect(config.parse).toBe(true);expect(config.ranking).toBe(true);
  expect(config).not.toHaveProperty("transcribe");expect(JSON.stringify(config)).not.toContain("fake-test-key");
  delete process.env.GEMINI_API_KEY;
  const disabled=await(await app.request("/api/config")).json();
  expect(disabled.voice).toBe(false);expect(disabled.parse).toBe(false);expect(disabled.ranking).toBe(false);
  expect((await voice(upload())).status).toBe(503);expect(calls).toHaveLength(0);
});
test("legacy STT endpoint is gone and never triggers a provider call",async()=>{
  expect((await app.request("/api/transcribe",{method:"POST",body:upload()})).status).toBe(404);
  expect(calls).toHaveLength(0);
});
test("rejects missing, empty, oversized and invalid-container audio before the model",async()=>{
  expect((await voice(new FormData())).status).toBe(400);
  expect((await voice(upload(new Uint8Array(0)))).status).toBe(400);
  expect((await voice(upload(new Uint8Array(MAX_AUDIO_BYTES+1)))).status).toBe(413);
  expect((await voice(upload(webm,"text/html"))).status).toBe(415);
  expect((await voice(upload(webm,"audio/wav"))).status).toBe(415);
  expect((await voice(upload(new TextEncoder().encode("not real audio")))).status).toBe(415);
  expect((await voice("not multipart")).status).toBe(400);
  expect(calls).toHaveLength(0);
});
test("Safari AAC MP4 container is sent as supported M4A without altering bytes",async()=>{
  const bytes=new TextEncoder().encode("0000ftypM4A ");
  expect((await voice(upload(bytes,"audio/mp4"))).status).toBe(200);
  const audio=JSON.parse(String(calls[0]!.body)).input[1];
  expect(audio.mime_type).toBe("audio/m4a");expect(audio.data).toBe(Buffer.from(bytes).toString("base64"));
});
test("silence returns a retryable no-speech message",async()=>{
  globalThis.fetch=(async()=>Response.json(completed({transcript:"",need:EMPTY_NEED}))) as unknown as typeof fetch;
  const res=await voice(upload());expect(res.status).toBe(422);
  expect(await res.json()).toEqual({error:"no_speech",message:"沒有辨識到語音，請重錄或改用文字"});
});
test("invalid model output and upstream failures never leak private provider detail",async()=>{
  for(const response of [Response.json(completed({...result,need:{...result.need,date:"2026-02-30"}})),Response.json({error:"fake-test-key PRIVATE TRANSCRIPT"},{status:429})]){
    globalThis.fetch=(async()=>response) as unknown as typeof fetch;
    const res=await voice(upload());expect(res.status).toBe(502);
    expect(await res.json()).toEqual({error:"voice_failed",message:"語音解析失敗，請重試或改用文字"});
  }
});
test("text parsing still supports manual text/corrections using the same native provider",async()=>{
  globalThis.fetch=(async (_url: Parameters<typeof fetch>[0],init?: RequestInit)=>{calls.push(init!);return Response.json(completed(result.need));}) as unknown as typeof fetch;
  const res=await app.request("/api/parse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript:"改成兩人",current:{...EMPTY_NEED,budget_total_twd:300}})});
  expect(res.status).toBe(200);expect(await res.json()).toEqual(result.need);expect(calls).toHaveLength(1);
  expect(JSON.parse(JSON.parse(String(calls[0]!.body)).input[0].text).current.budget_total_twd).toBe(300);
});

test("multipart header, not filename, controls MIME validation", async () => {
  const form = upload(webm, "text/html"); // deliberately .webm filename
  const rejected = await voice(form);
  expect(rejected.status).toBe(415);
  expect((await rejected.json()).error).toBe("unsupported_audio");
  expect(calls).toHaveLength(0);
  const good = new FormData();
  good.append("audio", new File([webm], "arbitrary-name.bin", { type: "audio/webm" }));
  expect((await voice(good)).status).toBe(200);
  expect(calls).toHaveLength(1);
});

test("rejects duplicate, extra and truncated multipart parts without calling Gemini", async () => {
  const duplicate = upload();
  duplicate.append("audio", new File([webm], "second.webm", { type: "audio/webm" }));
  expect((await voice(duplicate)).status).toBe(400);
  const extra = upload(); extra.append("override", "anything");
  expect((await voice(extra)).status).toBe(400);
  const request = new Request("http://localhost/api/voice", { method: "POST", body: upload() });
  const bytes = await request.arrayBuffer();
  const malformed = await app.request("/api/voice", { method: "POST", headers: request.headers, body: bytes.slice(0, -50) });
  expect(malformed.status).toBe(400);
  expect(calls).toHaveLength(0);
});

test("provider timeout returns a safe retryable timeout response", async () => {
  globalThis.fetch = (async () => { throw new DOMException("Provider detail", "TimeoutError"); }) as unknown as typeof fetch;
  const res = await voice(upload());
  // An upstream fetch timeout must stay actionable; never echo provider detail.
  expect(res.status).toBe(504);
  expect(await res.json()).toEqual({ error: "timeout", message: "逾時" });
});
