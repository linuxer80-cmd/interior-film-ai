"use client";
import {useEffect,useState} from 'react';
import {reportRequest} from '../utils/reportClient';
import styles from './AdminClosingTasks.module.css';
const filters=[['all','전체'],['review','검수'],['payment','수금'],['materials','자재']];
export default function AdminClosingTasks({companyId}) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
  const [filter,setFilter]=useState('all');
  useEffect(()=>{
    if(!companyId)return;
    let alive=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    setLoading(true);setError('');setData(null);
    reportRequest('/api/admin/closing-tasks',undefined,{signal:controller.signal})
      .then(result=>{if(!Array.isArray(result.rows)||!result.counts)throw Error('현장 목록을 확인하지 못했습니다.');if(alive)setData(result);})
      .catch(e=>{if(alive)setError(e.name==='AbortError'?'연결이 지연됩니다. 다시 확인해주세요.':e.message);})
      .finally(()=>{clearTimeout(timeout);if(alive)setLoading(false);});
    return()=>{alive=false;clearTimeout(timeout);controller.abort();};
  },[companyId,attempt]);
  useEffect(()=>{
    const refresh=()=>{if(!document.hidden)setAttempt(n=>n+1);};
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    const timer=setInterval(refresh,60000);
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  const menu={review:'report',payment:'settlement',materials:'materials'}[filter];
  const rows=(data?.rows||[]).filter(row=>!menu||row.actions.some(action=>action.menu===menu));
  return <details className={styles.root} aria-label="정리가 필요한 현장" aria-busy={loading}>
    <summary className={styles.toggle}><h2>정리가 필요한 현장</h2><span>{loading?'확인 중':error?'확인 필요':`${data?.counts.all||0}건`} · <span className={styles.whenClosed}>펼쳐보기 ＋</span><span className={styles.whenOpen}>접기 −</span></span></summary>
    <div className={styles.contents}>
    <header><p>남은 정리 업무</p><button type="button" disabled={loading} onClick={()=>setAttempt(n=>n+1)}>새로고침</button></header>
    <p>완료보고가 등록된 현장의 검수·수금·자재 정리를 모았습니다.</p>
    {loading?<p role="status">남은 업무를 확인하고 있습니다…</p>:error?<div role="alert"><p>{error}</p><button type="button" onClick={()=>setAttempt(n=>n+1)}>다시 확인</button></div>:<>
      <nav aria-label="정리 업무 필터">{filters.map(([id,label])=><button type="button" key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label} {data?.counts[id]||0}</button>)}</nav>
      {!rows.length&&<p role="status">{filter==='all'?'현재 정리가 필요한 현장이 없습니다.':'이 항목에 남은 현장이 없습니다.'}</p>}
      {rows.map(row=><article key={row.siteId}><h3>{row.name}</h3>{row.actions.map(action=><div key={action.id} className={styles.action}><p>{action.message}</p><a data-ui-link="action" href={`/admin?${new URLSearchParams({tab:'sites',site:row.siteId,section:action.section})}`}>{action.label} →</a></div>)}</article>)}
      <small>처리한 항목은 다시 조회하면 목록에서 빠집니다. 검수 승인과 입금 완료는 별개입니다.</small>
    </>}
    </div>
  </details>;
}
