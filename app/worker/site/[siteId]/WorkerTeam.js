'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../../../../lib/supabase';
import styles from '../../../components/CustomerChat.module.css';
export default function WorkerTeam({siteId,dates,active,initialChat=false,initialDate=null}){
 const days=[...new Set((dates||[]).map(d=>d.work_date).filter(Boolean))].sort();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const [date,setDate]=useState(days.includes(initialDate)?initialDate:days.includes(today)?today:days[0]||''),[data,setData]=useState(null),[error,setError]=useState(''),[text,setText]=useState(''),[sending,setSending]=useState(false),[chat,setChat]=useState(initialChat);
 const daysKey=days.join(',');
 const [readError,setReadError]=useState('');
 const readBatch=useRef({key:'',ids:new Set(),sent:new Set(),timer:null});
 useEffect(()=>{if(!days.includes(date))setDate(days.includes(today)?today:days[0]||'');},[daysKey,date,today]);
 useEffect(()=>{const requested=initialDate || new URLSearchParams(window.location.search).get('teamDate');if(requested&&days.includes(requested)){setDate(requested);setChat(true);}},[siteId,daysKey,initialDate]);
 const endpoint=`/api/worker/team?siteId=${encodeURIComponent(siteId)}&date=${encodeURIComponent(date)}`;
 async function request(options={}){const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('로그인이 필요합니다.');const r=await fetch(endpoint,{...options,headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},cache:'no-store'});const result=await r.json();if(!r.ok)throw Error(result.error||'불러오지 못했습니다.');return result;}
 const markVisible=useCallback(id=>{
  if(!active||!chat||document.hidden)return;
  let batch=readBatch.current;
  if(batch.key!==endpoint){clearTimeout(batch.timer);batch={key:endpoint,ids:new Set(),sent:new Set(),timer:null};readBatch.current=batch;}
  if(batch.sent.has(id))return;
  batch.ids.add(id);
  if(batch.timer)return;
  batch.timer=setTimeout(async()=>{
   batch.timer=null;
   if(document.hidden)return;
   const ids=[...batch.ids].slice(0,100);if(!ids.length)return;
   ids.forEach(id=>{batch.ids.delete(id);batch.sent.add(id);});
   try{await request({method:'PATCH',body:JSON.stringify({messageIds:ids})});if(readBatch.current===batch)setReadError('');window.dispatchEvent(new Event('team-chat-read')); }
   catch(e){ids.forEach(id=>batch.sent.delete(id));if(readBatch.current===batch)setReadError(e.message || '읽음 상태를 저장하지 못했습니다.');}
  },250);
 },[endpoint,active,chat]);
 useEffect(()=>{setReadError('');return()=>{clearTimeout(readBatch.current.timer);readBatch.current.timer=null;};},[endpoint,active,chat]);
 useEffect(()=>{
  if(!active||!date)return;let alive=true,running=false,pending=false,connected=false,channel=null,timer;
  setData(null);setError('');
  async function load(){
   if(!alive||document.hidden)return;
   if(running){pending=true;return;}
   running=true;
   try{const result=await request();if(alive){setData(result);setError('');}}
   catch(e){if(alive){setError(e.message);setData(null);}}
   finally{running=false;if(alive&&pending){pending=false;void load();}}
  }
  function schedule(){clearInterval(timer);timer=setInterval(load,chat&&!connected?5000:60000);}
  function visible(){if(!document.hidden)void load();}
  window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  void load();schedule();
  if(chat)(async()=>{
   try{
    await supabase.realtime.setAuth();if(!alive)return;
    channel=supabase.channel(`team-chat:${siteId}:${date}`,{config:{private:true}})
     .on('broadcast',{event:'changed'},()=>void load())
     .subscribe(status=>{
      if(!alive)return;
      const wasConnected=connected;connected=status==='SUBSCRIBED';schedule();
      if(connected&&!wasConnected)void load();
     });
   }catch{if(alive){connected=false;schedule();}}
  })();
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);if(channel)void supabase.removeChannel(channel);};
 },[siteId,date,active,chat]);
 async function send(e){e.preventDefault();if(sending||!text.trim())return;setSending(true);try{await request({method:'POST',body:JSON.stringify({id:crypto.randomUUID(),body:text})});setText('');setData(await request());setError('');}catch(e){setError(e.message);}finally{setSending(false);}}
 if(!days.length)return <p>날짜별 팀 배정이 등록되면 함께 일하는 팀원을 확인할 수 있습니다.</p>;
 return <section style={{background:'#fffef9',border:'1px solid #dfe4df',borderRadius:16,padding:16,marginTop:12}}>
  <h2 style={{fontSize:18}}>함께 일하는 팀원 · 팀 채팅</h2>
  <label>배정 날짜 <select value={date} disabled={sending} onChange={e=>{setDate(e.target.value);setData(null);setText('');}} style={{padding:10,fontSize:16}}>{days.map(d=><option key={d} value={d}>{d}</option>)}</select></label>
  <p style={{fontSize:13}}>같은 현장·날짜에 배정된 팀원과 업체 관리자가 함께 대화할 수 있습니다.</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {!data&&!error&&<p>팀원을 불러오는 중입니다.</p>}
  {data?.members.map(m=><article key={m.id} style={{borderTop:'1px solid #e3e7df',padding:'14px 0'}}>
   <strong>{m.name} · {m.role==='owner'?'관리자':m.role==='leader'?'팀장':'팀원'}{m.user_id===data.userId?' (나)':''}</strong>
   <div style={{marginTop:8}}>{m.phone?<a href={`tel:${m.phone.replace(/[^+0-9]/g,'')}`} style={{display:'inline-block',padding:'10px 14px',background:'#edf3ec',borderRadius:10}}>☎ {m.phone}</a>:<span>전화번호 미등록</span>}</div>
   <details style={{marginTop:10}}><summary style={{cursor:'pointer',padding:8}}>프로필 보기</summary>{m.profile?<div>{m.profile.photoUrl&&<img src={m.profile.photoUrl} alt={`${m.name} 프로필`} width={100} height={100} style={{objectFit:'cover',borderRadius:12}}/>}<p>지역: {m.profile.region||'미등록'} · 경력: {m.profile.experience_years??'미등록'}{m.profile.experience_years!=null?'년':''}</p><p>기술: {Array.isArray(m.profile.skills)?m.profile.skills.join(', '):m.profile.skills||'미등록'}</p><p style={{whiteSpace:'pre-wrap'}}>{m.profile.introduction||'소개 미등록'}</p></div>:<p>아직 등록된 프로필이 없습니다.</p>}</details>
  </article>)}
  <button type="button" className={styles.older} onClick={()=>setChat(v=>!v)}>{chat?'팀 채팅 닫기':'이 날짜 팀원들과 채팅하기'}</button>
  {chat&&data&&<div className={styles.detail} style={{height:500,maxHeight:'75dvh'}}><div className={styles.header}><h2>{date} 팀 채팅</h2></div><div className={styles.messages} aria-live="polite"><p className={styles.notice}>최근 100개 메시지 · 팀원 전체가 보는 대화입니다.</p>{data.messages.map(m=><TeamChatMessage key={m.id} message={m} mine={m.sender_id===data.userId} active={active&&chat&&data.readReady!==false} onVisible={markVisible}><small>{data.members.find(w=>w.user_id===m.sender_id)?.name||'이전 팀원'}</small>{m.body}<small>{new Date(m.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</small></TeamChatMessage>)}{!data.messages.length&&<p>첫 메시지를 남겨주세요.</p>}</div>{data.readReady===false&&<p className={styles.notice}>읽음 인원수 설정이 필요합니다.</p>}{readError&&<p role="alert" className={styles.error}>{readError}</p>}{data.notice&&<p className={styles.notice}>{data.notice}</p>}<form className={styles.form} onSubmit={send}><textarea value={text} disabled={sending||!data.chatReady} onChange={e=>setText(e.target.value)} maxLength={2000} aria-label="팀원에게 메시지" placeholder="팀원에게 메시지를 보내세요"/><button disabled={sending||!data.chatReady||!text.trim()}>{sending?'보내는 중':'보내기'}</button></form></div>}
 </section>;
}


function TeamChatMessage({message,mine,active,onVisible,children}){
 const element=useRef(null);
 useEffect(()=>{
  if(!active||mine||!element.current)return;
  const node=element.current;let timer;
  const observer=new IntersectionObserver(entries=>{
   clearTimeout(timer);
   if(entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>0)&&!document.hidden)
    timer=setTimeout(()=>{if(!document.hidden)onVisible(message.id);},350);
  },{threshold:[0,0.01]});
  const observe=()=>{clearTimeout(timer);observer.disconnect();if(!document.hidden)observer.observe(node);};
  observe();const retry=setInterval(observe,5000);document.addEventListener('visibilitychange',observe);
  return()=>{clearTimeout(timer);clearInterval(retry);observer.disconnect();document.removeEventListener('visibilitychange',observe);};
 },[message.id,message.unreadCount,mine,active,onVisible]);
 return <div ref={element} className={`${styles.bubble} ${mine?styles.mine:''}`}>{children}
  {Number(message.unreadCount)>0&&<small aria-label={`아직 읽지 않은 사람 ${message.unreadCount}명`} style={{color:'#a26708',fontWeight:800}}>{message.unreadCount}</small>}
 </div>;
}
