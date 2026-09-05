import { useEffect, useRef, useState } from "react";
import { accountSettingsSchema, defaultAccountData, type AccountData, type AuthResponse, type User } from "../shared/account.ts";
import * as api from "./api.ts";
const TOKEN_KEY="ail.token", GUEST_KEY="ail.guest-settings";
const guestData=()=>{const data=defaultAccountData("訪客");try{const raw=sessionStorage.getItem(GUEST_KEY);if(raw){const settings=accountSettingsSchema.safeParse(JSON.parse(raw));if(settings.success)data.settings=settings.data;}}catch{}return data;};
const storeGuest=(data:AccountData|null)=>{try{if(data)sessionStorage.setItem(GUEST_KEY,JSON.stringify(data.settings));else sessionStorage.removeItem(GUEST_KEY);}catch{}};
const storedToken=()=>{try{return sessionStorage.getItem(TOKEN_KEY);}catch{return null;}};
const storeToken=(token:string|null)=>{try{if(token)sessionStorage.setItem(TOKEN_KEY,token);else sessionStorage.removeItem(TOKEN_KEY);}catch{/* A blocked store leaves an in-memory session only. */}};
export function useAccount(){
 const [token,setToken]=useState<string|null>(storedToken),[user,setUser]=useState<User|null>(null),[data,setData]=useState<AccountData>(guestData);
 const [restoring,setRestoring]=useState(Boolean(token)),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const acceptedToken=useRef<string|null>(null);
 const generation=useRef(0),latest=useRef(data),queue=useRef(Promise.resolve());
 function clear(){generation.current++;acceptedToken.current=null;storeGuest(null);storeToken(null);setToken(null);setUser(null);const next=defaultAccountData("訪客");latest.current=next;setData(next);setSaving(false);setRestoring(false);}
 function reject(e:unknown){const err=e instanceof Error?e.message:"操作失敗";if(e instanceof api.ApiError&&e.status===401)clear();setError(err);}
 useEffect(()=>{if(!token)return;if(acceptedToken.current===token){setRestoring(false);return;}let live=true;setRestoring(true);api.me(token).then(result=>{if(!live)return;setUser(result.user);latest.current=result.data;setData(result.data);}).catch(e=>{if(live)reject(e);}).finally(()=>{if(live)setRestoring(false);});return()=>{live=false;};},[token]);
 function accept(result:AuthResponse){generation.current++;acceptedToken.current=result.session_token;storeGuest(null);setRestoring(false);storeToken(result.session_token);setToken(result.session_token);setUser(result.user);latest.current=result.data;setData(result.data);setError("");}
 async function authenticate(mode:"login"|"register",username:string,password:string,nickname:string){const result=mode==="login"?await api.login(username,password):await api.register(username,password,nickname);accept(result);}
 // Serialize writes to avoid an older full-document PUT overwriting a newer click.
 async function update(transform:(value:AccountData)=>AccountData){
  setError("");const next=transform(latest.current);latest.current=next;setData(next);
  if(!token||!user){if(!token)storeGuest(next);return;}
  const epoch=generation.current;setSaving(true);
  const task=queue.current.catch(()=>{}).then(async()=>{
   if(epoch!==generation.current)return;
   const saved=await api.saveData(token,next);
   if(epoch!==generation.current)return;
   if(latest.current===next){latest.current=saved;setData(saved);setUser(u=>u?{...u,nickname:saved.profile.nickname}:u);}
  });
  queue.current=task;
  try{await task;}catch(e){if(epoch===generation.current)reject(e);throw e;}finally{if(epoch===generation.current&&queue.current===task)setSaving(false);}
 }
 async function signOut(){try{if(token){await queue.current.catch(()=>{});await api.logout(token);}clear();setError("");}catch(e){if(e instanceof api.ApiError&&e.status===401){clear();setError("");return;}reject(e);throw e;}}
 async function password(current:string,next:string){if(!token)return;await queue.current.catch(()=>{});try{await api.changePassword(token,current,next);clear();}catch(e){reject(e);throw e;}}
 return {token,user,data,restoring,saving,error,setError,authenticate,update,signOut,password,clear,reject};
}
