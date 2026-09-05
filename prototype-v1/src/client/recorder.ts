// MediaRecorder lifecycle owns every track, including cancelled permission requests.
export const MAX_SECONDS = 30;
export const recordingSupported = () => typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
export class Recorder {
 private rec:MediaRecorder|null=null;
 private chunks:Blob[]=[];
 private cancelled=false;
 private stopping:Promise<Blob>|null=null;
 async start():Promise<void>{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  if(this.cancelled){stream.getTracks().forEach(track=>track.stop());throw new DOMException("Recording cancelled","AbortError");}
  try{this.chunks=[];this.rec=new MediaRecorder(stream);this.rec.ondataavailable=event=>{if(event.data.size)this.chunks.push(event.data);};this.rec.start();}
  catch(error){stream.getTracks().forEach(track=>track.stop());this.rec=null;throw error;}
 }
 stop():Promise<Blob>{
  this.cancelled=true;
  if(this.stopping)return this.stopping;
  const rec=this.rec;
  if(!rec)return Promise.resolve(new Blob());
  this.stopping=new Promise((resolve,reject)=>{
   const cleanup=()=>{rec.stream.getTracks().forEach(track=>track.stop());this.rec=null;};
   rec.onstop=()=>{cleanup();resolve(new Blob(this.chunks,{type:rec.mimeType}));};
   rec.onerror=()=>{cleanup();reject(new Error("錄音中斷"));};
   if(rec.state==="inactive"){cleanup();resolve(new Blob(this.chunks,{type:rec.mimeType}));}else rec.stop();
  });
  return this.stopping;
 }
}
