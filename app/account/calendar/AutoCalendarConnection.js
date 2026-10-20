"use client";
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
const ManualCalendar = dynamic(()=>import('./CalendarConnection'),{ssr:false});
const button={padding:'13px 18px',border:'1px solid #ccd8cc',borderRadius:14,background:'#355d47',color:'#fff',fontWeight:750,margin:'6px 8px 6px 0'};
async function request(action,method='GET') {
  const {data,error}=await supabase.auth.getSession();
  if(error||!data?.session?.access_token)throw Error('기존 앱 계정으로 로그인한 뒤 연결해주세요.');
  const response=await fetch('/api/calendar/auto/'+action,{method,headers:{Authorization:'Bearer '+data.session.access_token},cache:'no-store'});
  const result=await response.json();
  const current=await supabase.auth.getSession();
  if(current.error||current.data?.session?.user?.id!==data.session.user?.id)throw Error('앱 계정이 변경됐습니다. 새로고침 후 다시 확인해주세요.');
  if(!response.ok)throw Error(result.error||'캘린더 연결을 확인하지 못했습니다.');return result;
}
export default function AutoCalendarConnection({embedded=false,compact=false,connectedTargetId=null}) {
  const [state,setState]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[manual,setManual]=useState(false);
  const [connectedTarget,setConnectedTarget]=useState(null);
  useEffect(()=>{setConnectedTarget(connectedTargetId?document.getElementById(connectedTargetId):null);},[connectedTargetId]);
  const operation=useRef(false),finish=useRef(null),version=useRef(0);
  useEffect(()=>{
    let alive=true;
    async function load(){
      const current=++version.current;
      try {
        const query=new URLSearchParams(window.location.search);
        if(query.get('auto')==='finish') {
          if(!finish.current)finish.current=request('finish','POST');
          await finish.current;
          if(alive&&current===version.current){setMessage('자동 연결을 완료했습니다. 첫 일정은 다음 자동 실행에서 반영됩니다.');window.history.replaceState(null,'','/account/calendar');}
        }else if(query.get('auto')==='error') {if(alive)setError('구글 연결이 취소되었거나 만료됐습니다. 다시 연결해주세요.');}
        const result=await request('status');if(alive&&current===version.current)setState(result);
      }catch(e){if(alive&&current===version.current)setError(e.message);}
    }
    load();
    const {data}=supabase.auth.onAuthStateChange(event=>{if(['SIGNED_OUT','SIGNED_IN','USER_UPDATED'].includes(event)){setState(null);setMessage('');setError('');load();}});
    return ()=>{alive=false;data.subscription.unsubscribe();};
  },[]);
  async function run(action) {
    if(operation.current)return;operation.current=true;setBusy(true);setError('');setMessage('');
    try {
      if(action==='start') {const {url}=await request('start','POST');window.location.assign(url);return;}
      const result=await request(action,'POST');
      if(action==='sync')setMessage(result.failed?'일부 일정을 반영하지 못했습니다. 연결 상태를 확인해주세요.':result.queued?'다음 자동 실행을 기다리고 있습니다.':'일정 반영 완료 · 추가·수정 '+result.changed+'개 · 동일 '+result.skipped+'개 · 제외 '+result.removed+'개');
      if(action==='disconnect')setMessage('자동 동기화를 해제했습니다. 이미 보낸 일정은 유지됩니다.');
      setState(await request('status'));
    }catch(e){setError(e.message);}finally{operation.current=false;setBusy(false);}
  }
  const c=state?.connection,enabled=c?.enabled&&!c.needs_reconnect;
  const panel = <section style={{padding:embedded?18:24,margin:'16px auto',maxWidth:760,border:'1px solid #dedfd5',borderRadius:22,background:'#fff'}}>
    {embedded&&(enabled||compact)&&<div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><strong style={{color:'#355d47'}}>구글 캘린더{enabled?' · 자동 연결됨':''}</strong></div>}
    <details open={embedded&&(enabled||compact)?undefined:true}>
    <summary style={{display:embedded&&(enabled||compact)?'list-item':'none',cursor:'pointer',color:'#355d47',fontWeight:700,marginTop:embedded&&(enabled||compact)?8:0}}>{enabled?'더보기 · 캘린더 관리':'구글 캘린더 연결하기'}</summary>
    <h2 style={{margin:'0 0 10px'}}>구글 캘린더 자동 연결</h2>
    <p>한 번 동의하면 앱을 닫아도 내 현장 일정이 자동으로 반영됩니다.</p>
    <p style={{color:'#647168'}}>오늘부터 90일 · 배정·현장 요약 변경 반영 · 취소·배정 제외된 앱 일정 정리 · 같은 일정 중복 방지</p>
    {enabled?<>
      <strong style={{color:'#355d47'}}>자동 연결됨</strong>
      <p>{c.last_sync_at?'최근 반영: '+new Date(c.last_sync_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'첫 자동 반영 대기 중'}</p>
      <p>선택한 구글 계정의 기본 캘린더로 보냅니다. 예약 작업이 설정되어 있으면 약 5분 간격으로 변경된 사용자만 처리하고 하루 한 번 누락을 점검합니다. 이용량이나 재시도에 따라 늦어질 수 있습니다.</p>
      <button style={button} disabled={busy} onClick={()=>run('sync')}>{busy?'처리 중…':'지금 반영 확인'}</button>
      <button style={{...button,background:'#fff',color:'#355d47'}} disabled={busy} onClick={()=>run('disconnect')}>자동 연결 해제</button>
    </>:<>
      <p>전체 주소·동호수·작업내용·사용 필름·현장 메모·내 배정을 보냅니다. 공유 캘린더라면 공유 대상에게도 보입니다. 이후 앱에서 변경·제외된 현장은 구글 일정도 수정·삭제합니다. 개인 일정은 수정하지 않습니다.</p>
      <button style={button} disabled={busy||state?.configured===false} onClick={()=>run('start')}>{busy?'연결 준비 중…':c?.needs_reconnect?'구글 캘린더 다시 동의하기':'동의하고 자동 연결하기'}</button>
      {state?.configured===false&&<p>자동 연결 서버 설정을 준비 중입니다. 기존 수동 보내기는 계속 사용할 수 있습니다.</p>}
    </>}
    {c?.last_error&&<p role="status" style={{color:'#9d4b20'}}>{c.last_error}</p>}
    <button type="button" style={{...button,background:'#f1f3ee',color:'#355d47'}} aria-expanded={manual} onClick={()=>setManual(!manual)}>{manual?'수동 보내기·일정 조회 접기':'수동 보내기·구글 일정 조회'}</button>
    {manual&&<ManualCalendar/>}
    </details>
    {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
    {message&&<p role="status">{message}</p>}
    {!embedded&&<p><Link href="/worker/menu/sites">내 현장으로</Link></p>}
  </section>;
  if(connectedTargetId && !state && !error)return null;
  return enabled && !error && !c?.last_error && connectedTarget ? createPortal(panel,connectedTarget) : panel;
}
