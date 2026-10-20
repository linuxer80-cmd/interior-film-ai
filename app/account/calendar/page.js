"use client";
import {useEffect,useRef,useState} from 'react';
import Script from 'next/script';
import Link from 'next/link';
import {supabase} from '../../../lib/supabase';
import {loadMyWorkerSites} from '../../utils/workerSites';
import {CALENDAR_SCOPE,calendarApi,calendarWindow,siteCalendarEvents,readCalendarEvents,writeCalendarEvent,obsoleteCalendarEvents,isOwnCalendarEvent} from '../../../lib/googleCalendar.mjs';
const clientId=process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const card={padding:20,border:'1px solid #dfdfd5',borderRadius:20,background:'#fff',margin:'16px 0'};
const button={padding:14,border:'1px solid #cad7ce',borderRadius:12,background:'#e8f1e8',color:'#254b38',fontWeight:750,margin:'6px 8px 6px 0'};
export default function CalendarConnection(){
 const [user,setUser]=useState(null),[ready,setReady]=useState(false),[scriptReady,setScriptReady]=useState(false),[connected,setConnected]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [from,setFrom]=useState(today),[to,setTo]=useState(()=>{const d=new Date(today()+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+30);return d.toISOString().slice(0,10)});
 const [snapshot,setSnapshot]=useState(null),[removeOld,setRemoveOld]=useState(false);
 const token=useRef(null),lock=useRef(false),alive=useRef(true),authUser=useRef(null),epoch=useRef(0);
 function clear(){epoch.current++;token.current=null;setConnected(false);setSnapshot(null);setRemoveOld(false);}
 useEffect(()=>{alive.current=true;supabase.auth.getUser().then(({data,error})=>{if(alive.current){authUser.current=error?null:data?.user?.id;setUser(error?null:data?.user);setReady(true)}}).catch(()=>{if(alive.current){setError('로그인 상태를 확인하지 못했습니다. 새로고침해주세요.');setReady(true)}});
 const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(session?.user?.id!==authUser.current){authUser.current=session?.user?.id||null;setUser(session?.user||null);clear();}});
 return ()=>{alive.current=false;token.current=null;data.subscription.unsubscribe()};},[]);
 async function checkUser(){const {data,error}=await supabase.auth.getUser();if(error||!data?.user||data.user.id!==user?.id)throw Error('앱 계정이 변경됐습니다. 새로고침 후 다시 연결해주세요.');}
 function access(){if(!token.current||token.current.expires<Date.now()) {clear();throw Error('구글 연결 시간이 만료됐습니다. 다시 연결해주세요.');}return token.current.value;}
 async function load(value=access()){
  const version=epoch.current;calendarWindow(from,to);await checkUser();
  const [remote,assigned]=await Promise.all([readCalendarEvents(value,from,to),loadMyWorkerSites()]);
  if(!Array.isArray(assigned.sites))throw Error('배정 현장을 확인하지 못했습니다. 다시 시도해주세요.');
  const plan=await siteCalendarEvents(assigned.sites,user.id,from,to,window.location.origin);
  await checkUser();if(alive.current&&version===epoch.current){setSnapshot({from,to,remote,plan,userId:user.id});setRemoveOld(false);}
 }
 function connect(){
  if(lock.current||!user||!scriptReady||!clientId)return;
  lock.current=true;setBusy(true);setError('');setMessage('');clear();
  const done=()=>{lock.current=false;if(alive.current)setBusy(false)};
  try{
   window.google.accounts.oauth2.initTokenClient({client_id:clientId,scope:CALENDAR_SCOPE,include_granted_scopes:false,callback:async response=>{
    try{if(!alive.current)return;if(response.error||!response.access_token)throw Error('구글 연결을 완료하지 못했습니다. 다시 시도해주세요.');if(!window.google.accounts.oauth2.hasGrantedAllScopes(response,CALENDAR_SCOPE))throw Error('캘린더 일정 접근에 동의해야 연결할 수 있습니다.');
     await checkUser();token.current={value:response.access_token,expires:Date.now()+Number(response.expires_in||3600)*1000-30000};setConnected(true);await load(response.access_token);
    }catch(e){if(alive.current)setError(e.message)}finally{done()}
   },error_callback:()=>{if(alive.current)setError('인증 창이 닫혔거나 열리지 않았습니다. Chrome에서 다시 연결해주세요.');done()}}).requestAccessToken({prompt:'select_account'});
  }catch{setError('구글 인증을 시작하지 못했습니다. 새로고침 후 다시 시도해주세요.');done()}
 }
 async function run(action){if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');try{await checkUser();await action();}catch(e){if(alive.current){if(e.status===401)clear();setError(e.message)}}finally{lock.current=false;if(alive.current)setBusy(false)}}
 async function send(){
  const value=access();if(!snapshot||snapshot.from!==from||snapshot.to!==to||snapshot.userId!==user.id)throw Error('기간을 확인하고 먼저 새로 불러와주세요.');
  // Re-fetch assignments before any write so stale screen state cannot export removed assignments.
  const assigned=await loadMyWorkerSites();if(!Array.isArray(assigned.sites))throw Error('배정 현장을 확인하지 못했습니다.');
  const plan=await siteCalendarEvents(assigned.sites,user.id,from,to,window.location.origin);
  if(JSON.stringify(plan)!==JSON.stringify(snapshot.plan)){await load(value);throw Error('현장 배정이 변경됐습니다. 갱신된 목록을 확인한 뒤 다시 보내주세요.');}
  let count=0;
  try{
   for(const event of plan){await checkUser();await writeCalendarEvent(value,event,user.id);count++;}
   if(removeOld){for(const old of obsoleteCalendarEvents(snapshot.remote.items,plan,user.id)){await checkUser();const current=await calendarApi(value,'/'+old.id);if(!isOwnCalendarEvent(current,user.id)||!old.etag||current.etag!==old.etag)throw Error('삭제 대상 일정이 변경됐습니다. 새로 불러온 뒤 확인해주세요.');await calendarApi(value,'/'+old.id,{method:'DELETE',etag:old.etag});}}
   await load(value);setMessage(`${count}개 현장 일정을 반영했습니다.${removeOld?' 선택한 기간의 제외된 앱 일정도 정리했습니다.':''}`);
  }catch(e){throw Error(`${count}/${plan.length}개 반영. ${e.message} 다시 보내면 기존 일정을 수정합니다.`);}
 }
 const stale=snapshot&&(snapshot.from!==from||snapshot.to!==to),old=snapshot?obsoleteCalendarEvents(snapshot.remote.items,snapshot.plan,user?.id):[];
 return <main style={{maxWidth:720,margin:'24px auto',padding:20}}>
  {clientId&&<Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={()=>setScriptReady(true)} onError={()=>setError('구글 인증을 불러오지 못했습니다. Chrome에서 다시 열어주세요.')}/>}
  <h1>구글 캘린더 연결</h1><p>내 배정 현장을 기본 캘린더로 보내고, 같은 캘린더의 개인 일정을 확인합니다.</p>
  <p>이메일·카카오로 로그인했어도 연결할 수 있습니다. 개인 일정은 이 화면에서만 표시하며 업체나 팀원에게 공유하지 않습니다.</p>
  <p>화면을 닫거나 연결 시간이 만료되면 다시 연결해주세요. 일정은 아래 버튼을 눌렀을 때 반영됩니다.</p>
  {!ready?<p role="status">로그인 확인 중…</p>:!user?<p><Link href="/login">기존 계정으로 로그인</Link>한 뒤 다시 열어주세요.</p>:<>
   <p>앱 계정: {user.email||'로그인됨'}</p>
   {!clientId&&<p role="status">캘린더 연결 설정을 준비 중입니다. 서비스 관리자가 Google 클라이언트 ID와 Calendar API 설정을 완료해야 합니다.</p>}
   <button style={button} disabled={busy||!scriptReady||!clientId} onClick={connect}>{busy?'처리 중…':connected?'구글 계정 다시 선택':'구글 캘린더 연결'}</button>
   {connected&&<button style={button} disabled={busy} onClick={clear}>이 화면 연결 종료</button>}
   <section style={card}><h2>조회·반영 기간</h2><label>시작일 <input type="date" value={from} disabled={busy} onChange={e=>{setFrom(e.target.value);setRemoveOld(false)}}/></label>{' '}<label>종료일 <input type="date" value={to} disabled={busy} onChange={e=>{setTo(e.target.value);setRemoveOld(false)}}/></label><p>최대 31일 · 시간 미지정 현장은 종일 일정으로 보냅니다.</p><button style={button} disabled={!connected||busy} onClick={()=>run(()=>load())}>현장·캘린더 새로 불러오기</button></section>
   {snapshot&&!stale&&<>
    <section style={card}><h2>보낼 현장 {snapshot.plan.length}개</h2><p>대상 구글 캘린더: <strong>{snapshot.remote.summary||'선택한 구글 계정의 기본 캘린더'}</strong></p><p>현장명·전체 주소·작업내용·배정 역할·현장 링크를 보냅니다. 캘린더를 공유 중이면 공유 대상에게도 보일 수 있습니다.</p>
     {snapshot.plan.length?snapshot.plan.map(e=><div key={e.id} style={{borderTop:'1px solid #eee',padding:'12px 0'}}><strong>{e.start.date} · {e.summary}</strong><p style={{overflowWrap:'anywhere'}}>{e.location||'주소 미등록'}</p></div>):<p>이 기간에 배정된 현장이 없습니다.</p>}
     {old.length>0&&<label style={{display:'block',padding:12}}><input type="checkbox" checked={removeOld} disabled={busy} onChange={e=>setRemoveOld(e.target.checked)}/> 이 기간의 취소·배정 제외·날짜 변경된 필름장이 일정 {old.length}개 삭제</label>}
     <button style={button} disabled={busy||(!snapshot.plan.length&&!removeOld)} onClick={()=>run(send)}>현장 일정 보내기·갱신{removeOld?' 및 제외 일정 삭제':''}</button>
    </section>
    <section style={card}><h2>구글 캘린더 일정</h2><p>본인에게만 표시됩니다. 다른 보조 캘린더는 이번 버전에 포함되지 않습니다.</p>{snapshot.remote.items.length?snapshot.remote.items.map(e=><article key={e.id} style={{borderTop:'1px solid #eee',padding:'12px 0'}}><strong>{e.summary||'제목 없는 일정'}</strong><p>{e.start?.date||new Date(e.start?.dateTime).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p>{e.location&&<p>{e.location}</p>}</article>):<p>등록된 일정이 없습니다.</p>}</section>
   </>}
   {stale&&<p role="status">기간이 바뀌었습니다. 새로 불러오기를 눌러주세요.</p>}
  </>}
  {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}{message&&<p role="status">{message}</p>}
  <p>Google 접근 권한 철회는 <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">Google 계정의 연결 관리</a>에서 할 수 있습니다. 종료해도 이미 보낸 일정은 유지됩니다.</p>
  <p><Link href="/admin">관리자 홈</Link> · <Link href="/worker">시공자 홈</Link></p>
 </main>
}
