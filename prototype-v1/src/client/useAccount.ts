import { useEffect, useRef, useState } from "react";
import { accountDataSchema, accountSettingsSchema, defaultAccountData, type AccountData, type AuthResponse, type User } from "../shared/account.ts";
import { mergeAccountChanges, mergeGuestCollections } from "../shared/account-merge.ts";
import * as api from "./api.ts";
const TOKEN_KEY="ail.token", GUEST_KEY="ail.guest-data-v2", LEGACY_GUEST_KEY="ail.guest-settings";
const guestStorage=()=>{try{return typeof localStorage!=="undefined"?localStorage:sessionStorage;}catch{return sessionStorage;}};
const guestData=()=>{const data=defaultAccountData("訪客");try{const storage=guestStorage();const raw=storage.getItem(GUEST_KEY)??storage.getItem(LEGACY_GUEST_KEY);if(raw){const value=JSON.parse(raw);const full=accountDataSchema.safeParse(value);if(full.success)return full.data;const settings=accountSettingsSchema.safeParse(value);if(settings.success)data.settings=settings.data;}}catch{}return data;};
const storeGuest=(data:AccountData|null)=>{try{const storage=guestStorage();if(data)storage.setItem(GUEST_KEY,JSON.stringify(data));else storage.removeItem(GUEST_KEY);storage.removeItem(LEGACY_GUEST_KEY);}catch{}};
const storedToken=()=>{try{return sessionStorage.getItem(TOKEN_KEY);}catch{return null;}};
const storeToken=(token:string|null)=>{try{if(token)sessionStorage.setItem(TOKEN_KEY,token);else sessionStorage.removeItem(TOKEN_KEY);}catch{/* A blocked store leaves an in-memory session only. */}};
export function useAccount(){
 const [token,setToken]=useState<string|null>(storedToken),[user,setUser]=useState<User|null>(null),[data,setData]=useState<AccountData>(guestData);
 const [restoring,setRestoring]=useState(Boolean(token)),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const [reloadCount,setReloadCount]=useState(0);
 const acceptedToken=useRef<string|null>(null);
 const generation=useRef(0),latest=useRef(data),synced=useRef(data),queue=useRef(Promise.resolve());
 function clear(){generation.current++;acceptedToken.current=null;storeGuest(null);storeToken(null);setToken(null);setUser(null);const next=defaultAccountData("訪客");latest.current=next;synced.current=next;setData(next);setSaving(false);setRestoring(false);}
 function reject(e:unknown){const err=e instanceof Error?e.message:"操作失敗";if(e instanceof api.ApiError&&e.status===401)clear();setError(err);}
 useEffect(()=>{if(!token)return;if(acceptedToken.current===token){setRestoring(false);return;}let live=true;setRestoring(true);api.me(token).then(async result=>{const merged=mergeGuestCollections(latest.current,result.data);const changed=merged.list.length!==result.data.list.length||merged.favs.length!==result.data.favs.length;const restored=changed?await api.saveData(token,{...merged,revision:result.data.revision}):result.data;if(!live)return;acceptedToken.current=token;storeGuest(null);setUser(result.user);latest.current=restored;synced.current=restored;setData(restored);}).catch(e=>{if(live)reject(e);}).finally(()=>{if(live)setRestoring(false);});return()=>{live=false;};},[token]);
 async function accept(result:AuthResponse){const merged=mergeGuestCollections(latest.current,result.data);const changed=merged.list.length!==result.data.list.length||merged.favs.length!==result.data.favs.length;const accepted=changed?await api.saveData(result.session_token,{...merged,revision:result.data.revision}):result.data;generation.current++;acceptedToken.current=result.session_token;storeGuest(null);setRestoring(false);storeToken(result.session_token);setToken(result.session_token);setUser(result.user);latest.current=accepted;synced.current=accepted;setData(accepted);setError("");}
 async function authenticate(mode:"login"|"register",username:string,password:string,nickname:string){const result=mode==="login"?await api.login(username,password):await api.register(username,password,nickname);await accept(result);}
 // Serialize writes to avoid an older full-document PUT overwriting a newer click.
 async function update(transform:(value:AccountData)=>AccountData){
  setError("");let next:AccountData;
  try{next=transform(latest.current);}catch(e){reject(e);throw e;}
  latest.current=next;setData(next);
  if(!token||!user){if(!token)storeGuest(next);return;}
  const epoch=generation.current;setSaving(true);
  const task=queue.current.catch(()=>{}).then(async()=>{
   if(epoch!==generation.current)return;
   const submitted=latest.current;
   let base=synced.current, desired=submitted;
   let saved:AccountData|undefined;
   for(let attempt=0;attempt<3;attempt++){
    try{saved=await api.saveData(token,{...desired,revision:base.revision});break;}
    catch(e){
     if(!(e instanceof api.ApiError)||e.status!==409||attempt===2)throw e;
     const remote=(await api.me(token)).data;
     desired=mergeAccountChanges(base,desired,remote);base=remote;
    }
   }
   if(!saved||epoch!==generation.current)return;
   const nextLocal=latest.current===submitted?saved:mergeAccountChanges(submitted,latest.current,saved);
   synced.current=saved;latest.current=nextLocal;setData(nextLocal);setError("");
   setUser(u=>u?{...u,nickname:saved.profile.nickname}:u);
  });
  queue.current=task;
  try{await task;}catch(e){if(epoch===generation.current)reject(e);throw e;}finally{if(epoch===generation.current&&queue.current===task)setSaving(false);}
 }
 async function reload(){
  if(!token)return;
  await queue.current.catch(()=>{});
  const result=await api.me(token);synced.current=result.data;latest.current=result.data;
  setData(result.data);setUser(result.user);setError("");setReloadCount(value=>value+1);
 }
 async function signOut(){try{if(token){await queue.current.catch(()=>{});await api.logout(token);}clear();setError("");}catch(e){if(e instanceof api.ApiError&&e.status===401){clear();setError("");return;}reject(e);throw e;}}
 async function password(current:string,next:string){if(!token)return;await queue.current.catch(()=>{});try{await api.changePassword(token,current,next);clear();}catch(e){reject(e);throw e;}}
 return {token,user,data,restoring,saving,error,reloadCount,setError,authenticate,update,reload,signOut,password,clear,reject};
}
