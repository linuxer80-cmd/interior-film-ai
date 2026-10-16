'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ChatConversation,chatRequest} from '../../components/CustomerChat';
import styles from '../../components/CustomerChat.module.css';
export default function CustomerChatInbox(){
 const [threads,setThreads]=useState([]),[selected,setSelected]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[offset,setOffset]=useState(0),[hasMore,setHasMore]=useState(false);
 const current=useRef(0);
 const load=useCallback(async()=>{const version=++current.current;try{const data=await chatRequest('/api/admin/customer-chat?offset='+offset,null,true);if(version!==current.current)return;setThreads(data.threads);setHasMore(data.hasMore);setError('');}catch(e){if(version===current.current)setError(e.message);}finally{if(version===current.current)setLoading(false);}},[offset]);
 useEffect(()=>{setLoading(true);load();const timer=setInterval(()=>{if(document.visibilityState==='visible')load();},10000);return()=>{current.current++;clearInterval(timer);};},[load]);
 return <main className={styles.inbox}><header className={styles.top}><Link href="/admin">‹ 관리자 홈</Link><button onClick={load}>새로고침</button></header><h1>고객 채팅</h1><p>고객 페이지에서 보낸 문의에 답장하세요. 열린 화면에서 새 메시지를 자동으로 확인합니다.</p>{error&&<p role="alert" className={styles.error}>{error}</p>}
 {selected?<section className={styles.detail}><header className={styles.header}><h2>{selected.customer_name}</h2><button onClick={()=>{setSelected(null);load();}}>목록</button></header><ChatConversation key={selected.id} admin url={'/api/admin/customer-chat?thread='+selected.id} onUpdated={load}/></section>:<><div className={styles.threads}>{loading?<p>문의 목록을 불러오는 중…</p>:!threads.length?<p>아직 받은 문의가 없습니다.</p>:threads.map(t=><button key={t.id} className={styles.thread} onClick={()=>setSelected(t)}><strong>{t.customer_name} {t.last_customer_at&&(!t.owner_read_at||t.last_customer_at>t.owner_read_at)&&<span className={styles.unread}>● 새 메시지</span>}</strong><span>{t.last_preview||'새 대화'}</span><small>{new Date(t.updated_at).toLocaleString('ko-KR')}</small></button>)}</div><div className={styles.top}>{offset>0&&<button onClick={()=>setOffset(v=>Math.max(0,v-50))}>이전</button>}{hasMore&&<button onClick={()=>setOffset(v=>v+50)}>다음</button>}</div></>}
 </main>;
}
