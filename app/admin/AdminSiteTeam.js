"use client";
import {useEffect,useState} from 'react';
import {supabase} from '../../lib/supabase';
import WorkerTeam from '../worker/site/[siteId]/WorkerTeam';
export default function AdminSiteTeam({siteId,active,initialDate=null}){
 const [dates,setDates]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(!active)return;
  let alive=true;const controller=new AbortController();setDates(null);setError('');
  (async()=>{try{
   const {data}=await supabase.auth.getSession();if(!data?.session)throw Error('다시 로그인해주세요.');
   const r=await fetch('/api/worker/team?'+new URLSearchParams({siteId,mode:'dates'}),{headers:{Authorization:'Bearer '+data.session.access_token},cache:'no-store',signal:controller.signal});
   const result=await r.json();if(!r.ok)throw Error(result.error||'현장 채팅 날짜를 확인하지 못했습니다.');
   if(alive)setDates(result.dates);
  }catch(e){if(alive&&!controller.signal.aborted)setError(e.message);}})();
  return()=>{alive=false;controller.abort();};
 },[siteId,active,attempt]);
 if(!active)return null;
 if(error)return <div role="alert"><p>{error}</p><button onClick={()=>setAttempt(v=>v+1)}>다시 확인</button></div>;
 if(!dates)return <p role="status">현장 채팅을 불러오는 중입니다…</p>;
 return <><p>업체 관리자로 현장 팀 채팅에 참여합니다. 날짜를 선택하면 해당 날짜의 팀원과 대화할 수 있습니다.</p><WorkerTeam key={siteId} siteId={siteId} dates={dates} initialDate={initialDate} active={active} initialChat /></>;
}

