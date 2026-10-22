"use client";
import {useEffect,useRef,useState} from "react";
import {usePathname,useRouter} from "next/navigation";
import {supabase} from "../../lib/supabase";
import {workerProfileRequirements} from "../utils/workerProfileRequirements";

export default function WorkerProfileReminder(){
 const pathname=usePathname(),router=useRouter();
 const [missing,setMissing]=useState([]);
 const dialog=useRef(null),dismissed=useRef(false);
 const excluded=pathname==="/worker/account" || pathname==="/worker/login" || pathname.startsWith("/worker/connect/");
 useEffect(()=>{
  let active=true;
  async function check(){
   if(excluded)return;
   try{
    const result=await workerProfileRequirements();
    if(!active)return;
    if(!result.authenticated || result.complete){setMissing([]);return;}
    if(!dismissed.current && result.complete===false && result.missing?.length)setMissing(result.missing);
   }catch{ /* A profile-check outage must not block assigned sites. */ }
  }
  check();
  let authTimer;
  const {data:authListener}=supabase.auth.onAuthStateChange((event)=>{
   if(event==="SIGNED_OUT"){dismissed.current=false;setMissing([]);}
   if(event==="SIGNED_IN"){
    clearTimeout(authTimer);authTimer=setTimeout(()=>{if(active)check();},0);
   }
  });
  const refresh=()=>{if(document.visibilityState==="visible")check();};
  window.addEventListener("focus",refresh);
  return()=>{active=false;clearTimeout(authTimer);authListener.subscription.unsubscribe();window.removeEventListener("focus",refresh);};
 },[pathname,excluded]);
 useEffect(()=>{
  const element=dialog.current;
  if(missing.length && !excluded && element && !element.open)element.showModal();
  else if((!missing.length || excluded)&&element?.open)element.close();
 },[missing,excluded]);
 function close(){dismissed.current=true;setMissing([]);}
 return <dialog ref={dialog} aria-labelledby="worker-profile-reminder-title"
  onCancel={close} style={{width:"calc(100% - 36px)",maxWidth:420,border:"1px solid #dce3e8",borderRadius:22,padding:24,color:"#243c57"}}>
  <h2 id="worker-profile-reminder-title" style={{marginTop:0}}>프로필을 완성해주세요</h2>
  <p style={{lineHeight:1.7}}>현장 배정은 완료할 수 있습니다. 정확한 연락과 일당 확인을 위해 아래 정보를 등록해주세요.</p>
  <ul>{missing.map(item=><li key={item}>{item}</li>)}</ul>
  <div style={{display:"flex",gap:10,marginTop:22}}>
   <button type="button" autoFocus onClick={()=>{close();router.push("/worker/account?required=1&next="+encodeURIComponent(pathname));}}
    style={{flex:1,padding:14,border:0,borderRadius:12,background:"#243c57",color:"white",fontWeight:700}}>프로필 등록하기</button>
   <button type="button" onClick={close} style={{padding:14,border:"1px solid #cbd5e1",borderRadius:12,background:"white"}}>나중에</button>
  </div>
 </dialog>;
}
