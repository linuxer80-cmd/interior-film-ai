'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../../lib/supabase';
export default function ReferralClaim() {
 const [message,setMessage]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let live=true,working=false;
  async function claim(session){
   if(!live||working||!session?.user?.email_confirmed_at)return;
   let token;try{token=localStorage.getItem('film-referral');}catch{return;}
   if(!/^[a-f0-9]{64}$/.test(token||''))return;
   working=true;
   try{
    const response=await fetch('/api/referrals',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'claim',scope:'worker',token})});
    const result=await response.json();
    if(!live)return;
    if(response.ok){localStorage.removeItem('film-referral');setMessage('초대 확인이 완료되었습니다. 신규 가입한 경우 가입 실적도 함께 반영됩니다.');}
    else {setMessage(result.error||'초대 등록을 다시 확인해주세요.');if(response.status===400)localStorage.removeItem('film-referral');}
   }catch{if(live)setMessage('초대 등록을 확인하지 못했습니다. 다시 확인해주세요.');}
   finally{working=false;}
  }
  supabase.auth.getSession().then(({data})=>claim(data.session)).catch(()=>{});
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>claim(session),0);});
  return()=>{live=false;data.subscription.unsubscribe();};
 },[retry]);
 if(!message)return null;
 return <aside role='status' style={{position:'fixed',bottom:88,left:12,right:12,zIndex:10000,padding:14,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:12,color:'#163153',fontSize:13}}>{message}<div><button onClick={()=>setRetry(v=>v+1)}>다시 확인</button> <button onClick={()=>setMessage('')}>닫기</button></div></aside>;
}
