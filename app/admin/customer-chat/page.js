'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ChatConversation,chatRequest} from '../../components/CustomerChat';
import CustomerChatQuote from './CustomerChatQuote';
import useAdminCustomerRealtime from './useAdminCustomerRealtime';
import styles from '../../components/CustomerChat.module.css';
export default function CustomerChatInbox(){
 const [threads,setThreads]=useState([]),[selected,setSelected]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[offset,setOffset]=useState(0),[hasMore,setHasMore]=useState(false);
 const [quoteOpen,setQuoteOpen]=useState(false),[identity,setIdentity]=useState(null),[refreshSignal,setRefreshSignal]=useState(0);
 const current=useRef(0);
 useEffect(()=>{
   let active=true;
   const id=new URLSearchParams(window.location.search).get('thread');
   if(!id)return;
   chatRequest('/api/admin/customer-chat?thread='+encodeURIComponent(id),null,true)
     .then(data=>{if(active)setSelected(data.thread);})
     .catch(e=>{if(active)setError(e.message);});
   return()=>{active=false;};
 },[]);

 const load=useCallback(async()=>{const version=++current.current;try{const data=await chatRequest('/api/admin/customer-chat?offset='+offset,null,true);if(version!==current.current)return;setThreads(data.threads);setHasMore(data.hasMore);setIdentity({companyId:data.companyId,userId:data.userId});setError('');}catch(e){if(version===current.current)setError(e.message);}finally{if(version===current.current)setLoading(false);}},[offset]);
 const onRealtime=useCallback(kind=>{
  if(kind==='auth'){current.current++;setIdentity(null);setThreads([]);setSelected(null);setQuoteOpen(false);}
  if(document.visibilityState==='visible')void load();
  if(kind==='changed')setRefreshSignal(v=>v+1);
 },[load]);
 const realtimeConnected=useAdminCustomerRealtime(identity,onRealtime);
 useEffect(()=>{
  setLoading(true);void load();
  const visible=()=>{if(document.visibilityState==='visible')void load();};
  const timer=setInterval(visible,realtimeConnected?60000:10000);
  window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  return()=>{current.current++;clearInterval(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
 },[load,realtimeConnected]);
 return <main className={styles.inbox}><header className={styles.top}><Link href="/admin" data-ui-link="action"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/></svg><span>관리자 홈</span></Link><button type="button" className={styles.pageAction} onClick={load}>새로고침</button></header><h1>고객 채팅</h1><p>고객 페이지에서 보낸 문의에 답장하세요. 열린 화면에서 새 메시지를 자동으로 확인합니다.</p>{error&&<p role="alert" className={styles.error}>{error}</p>}
 {selected?<section className={styles.detail}><header className={styles.header}><h2>{selected.customer_name}</h2><button onClick={()=>{setSelected(null);load();}}>목록</button></header><ChatConversation key={selected.id} admin realtimeConnected={realtimeConnected} refreshSignal={refreshSignal} url={'/api/admin/customer-chat?thread='+selected.id} onUpdated={load} onCreateQuote={()=>setQuoteOpen(true)}/></section>:<><div className={styles.threads}>{loading?<p>문의 목록을 불러오는 중…</p>:!threads.length?<p>아직 받은 문의가 없습니다.</p>:threads.map(t=><button key={t.id} className={styles.thread} onClick={()=>setSelected(t)}><strong>{t.customer_name} {t.last_customer_at&&(!t.owner_read_at||t.last_customer_at>t.owner_read_at)&&<span className={styles.unread}>● 새 메시지</span>}</strong><span>{t.last_preview||'새 대화'}</span><small>{new Date(t.updated_at).toLocaleString('ko-KR')}</small></button>)}</div><div className={styles.top}>{offset>0&&<button onClick={()=>setOffset(v=>Math.max(0,v-50))}>이전</button>}{hasMore&&<button onClick={()=>setOffset(v=>v+50)}>다음</button>}</div></>}
 {quoteOpen&&selected&&<CustomerChatQuote thread={selected} onClose={()=>setQuoteOpen(false)}/>}
 </main>;
}
