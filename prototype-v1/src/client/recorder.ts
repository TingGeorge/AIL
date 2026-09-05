// MediaRecorder lifecycle owns every track, including cancelled permission requests.
export const MAX_SECONDS = 30;
export const scheduleRecordingLimit = (onLimit: () => void) => setTimeout(onLimit, MAX_SECONDS * 1000);

const MIME_ALIASES:Record<string,string>={
 "audio/mp4":"audio/m4a",
 "audio/x-m4a":"audio/m4a",
};
const AUDIO_EXTENSIONS:Record<string,string>={
 "audio/webm":"webm",
 "audio/m4a":"m4a",
 "audio/wav":"wav",
 "audio/x-wav":"wav",
 "audio/ogg":"ogg",
 "audio/mpeg":"mp3",
 "audio/mp3":"mp3",
 "audio/aac":"aac",
 "audio/flac":"flac",
 "audio/aiff":"aiff",
 "audio/x-aiff":"aiff",
};

export function audioMimeEssence(value:string){return value.split(";",1)[0]!.trim().toLowerCase();}
export function canonicalAudioMimeType(value:string){
 const [raw,...parameters]=value.split(";");
 const essence=MIME_ALIASES[raw!.trim().toLowerCase()]??raw!.trim().toLowerCase();
 return [essence,...parameters.map(parameter=>parameter.trim()).filter(Boolean)].join(";");
}
export function recordedAudioFile(chunks:BlobPart[],mimeType:string):File{
 const type=canonicalAudioMimeType(mimeType);
 const extension=AUDIO_EXTENSIONS[audioMimeEssence(type)];
 if(!extension)throw new Error("瀏覽器產生了不支援的錄音格式。");
 return new File(chunks,`voice.${extension}`,{type});
}

export const recordingSupported = () => typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
export class Recorder {
 private rec:MediaRecorder|null=null;
 private chunks:Blob[]=[];
 private cancelled=false;
 private stopping:Promise<File>|null=null;
 async start():Promise<void>{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  if(this.cancelled){stream.getTracks().forEach(track=>track.stop());throw new DOMException("Recording cancelled","AbortError");}
  try{this.chunks=[];this.rec=new MediaRecorder(stream);this.rec.ondataavailable=event=>{if(event.data.size)this.chunks.push(event.data);};this.rec.start();}
  catch(error){stream.getTracks().forEach(track=>track.stop());this.rec=null;throw error;}
 }
 stop():Promise<File>{
  this.cancelled=true;
  if(this.stopping)return this.stopping;
  const rec=this.rec;
  if(!rec)return Promise.resolve(recordedAudioFile([],"audio/webm"));
  this.stopping=new Promise((resolve,reject)=>{
   const cleanup=()=>{rec.stream.getTracks().forEach(track=>track.stop());this.rec=null;};
   const finish=()=>{
    try{resolve(recordedAudioFile(this.chunks,rec.mimeType||this.chunks.find(chunk=>chunk.type)?.type||""));}
    catch(error){reject(error);}
   };
   rec.onstop=()=>{cleanup();finish();};
   rec.onerror=()=>{cleanup();reject(new Error("錄音中斷"));};
   if(rec.state==="inactive"){cleanup();finish();}else rec.stop();
  });
  return this.stopping;
 }
}
