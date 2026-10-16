'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabase';
import styles from './CustomerChat.module.css';
export async function chatRequest(url,body,admin=false){
  const headers={};if(admin){const {data}=await supabase.auth.getSession();if(!data.session)throw Error('관리자 로그인이 필요합니다.');headers.Authorization=`Bearer ${data.session.access_token}`;}
  if(body)headers['Content-Type']='application/json';
  const response=await fetch(url,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'채팅을 불러오지 못했습니다.');return result;
}
export function ChatConversation({url,admin=false,onUpdated}){
  const [messages,setMessages]=useState([]),[thread,setThread]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[older,setOlder]=useState(false),[loadingOlder,setLoadingOlder]=useState(false);
  const [text,setText]=useState(''),[name,setName]=useState(''),[consent,setConsent]=useState(false);
  const list=useRef(null), pending=useRef(null), sending=useRef(false),alive=useRef(true),generation=useRef(0),nearBottom=useRef(true),historyLoaded=useRef(false),readAt=useRef(null);
  const refresh=useCallback(async()=>{
    const version=++generation.current;
    try{const data=await chatRequest(url,null,admin);if(!alive.current||version!==generation.current)return;
      setThread(data.thread);setReady(true);setError('');
      setMessages(previous=>{const map=new Map(previous.map(m=>[m.id,m]));for(const m of data.messages)map.set(m.id,m);return [...map.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));});
      if(!historyLoaded.current)setOlder(data.hasOlder);
      if(admin&&data.thread?.last_customer_at&&readAt.current!==data.thread.last_customer_at){await chatRequest(url,{action:'read',seenAt:data.thread.last_customer_at},true);readAt.current=data.thread.last_customer_at;}
    }catch(e){if(alive.current&&version===generation.current)setError(e.name==='TimeoutError'?'연결이 지연됩니다. 다시 시도해주세요.':e.message);}
  },[url,admin]);
  useEffect(()=>{alive.current=true;refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},5000);return()=>{alive.current=false;generation.current++;clearInterval(timer);};},[refresh]);
  useEffect(()=>{if(nearBottom.current&&list.current)list.current.scrollTop=list.current.scrollHeight;},[messages]);
  async function loadOlder(){if(loadingOlder||!messages.length)return;setLoadingOlder(true);try{const data=await chatRequest(url+'&before='+encodeURIComponent(messages[0].created_at),null,admin);if(!alive.current)return;setMessages(previous=>{const map=new Map([...data.messages,...previous].map(m=>[m.id,m]));return [...map.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at));});historyLoaded.current=true;setOlder(data.hasOlder);}catch(e){setError(e.message);}finally{setLoadingOlder(false);}}
  async function send(event){event.preventDefault();if(sending.current||!text.trim())return;sending.current=true;setBusy(true);setError('');
    if(!pending.current||pending.current.text!==text.trim())pending.current={messageId:crypto.randomUUID(),text:text.trim()};
    try{await chatRequest(url,{...pending.current,name,consent},admin);if(!alive.current)return;setText('');pending.current=null;nearBottom.current=true;await refresh();onUpdated?.();}catch(e){if(alive.current)setError(e.message);}finally{sending.current=false;if(alive.current)setBusy(false);}}
  return <div className={styles.chat}>
    <div className={styles.messages} ref={list} role="log" aria-live="polite" aria-label="대화 내용" onScroll={()=>{const el=list.current;nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}}>
      {older&&<button className={styles.older} disabled={loadingOlder} onClick={loadOlder}>{loadingOlder?'불러오는 중…':'이전 대화 보기'}</button>}
      {!messages.length&&<p className={styles.notice}>{ready?'궁금한 내용을 남겨주세요. 담당자가 확인 후 답장합니다.':'대화를 불러오는 중…'}</p>}
      {messages.map(m=><div key={m.id} className={`${styles.bubble} ${(m.sender==='owner')===admin?styles.mine:''}`}><small>{m.sender==='owner'?'담당 관리자':'고객'}</small>{m.body}<small>{new Date(m.created_at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small></div>)}
    </div>
    {error&&<p className={styles.error} role="alert">{error} <button type="button" onClick={refresh}>다시 확인</button></p>}
    <form className={styles.form} onSubmit={send}>
      {!admin&&!thread&&<><input type="text" aria-label="이름 또는 별명" placeholder="이름 또는 별명" maxLength={60} value={name} onChange={e=>setName(e.target.value)} required/><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> 이름·대화내용을 문의 응대 목적으로 해당 업체에 전달하고 저장하는 데 동의합니다. 민감한 정보는 입력하지 마세요.</label></>}
      <textarea aria-label="메시지" placeholder="문의 내용을 입력하세요" maxLength={2000} value={text} onChange={e=>setText(e.target.value)} disabled={busy}/>
      <button disabled={busy||!ready||!text.trim()||(!admin&&!thread&&(!consent||!name.trim()))}>{busy?'보내는 중…':'보내기'}</button>
    </form>
  </div>;
}
export default function CustomerChat({slug,companyName}){
  const [open,setOpen]=useState(false);const trigger=useRef(null);
  useEffect(()=>{if(!open)return;const escape=e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[open]);
  return <>{!open&&<button ref={trigger} className={styles.launcher} onClick={()=>setOpen(true)}>채팅 문의</button>}{open&&<section className={styles.panel} role="dialog" aria-label="업체 채팅 문의"><header className={styles.header}><div><h2>{companyName || '담당 관리자'}</h2><small>고객 문의 채팅 · 자동 새로고침</small></div><button autoFocus onClick={()=>{setOpen(false);setTimeout(()=>trigger.current?.focus(),0);}}>닫기</button></header><p className={styles.notice}>답장은 이 페이지에서 확인해주세요. 같은 브라우저에서 대화가 이어지며 쿠키를 삭제하면 이전 대화를 다시 볼 수 없습니다.</p><ChatConversation key={slug} url={'/api/customer-chat?slug='+encodeURIComponent(slug)}/></section>}</>;
}
