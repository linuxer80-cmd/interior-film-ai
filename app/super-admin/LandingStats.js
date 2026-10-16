'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../../lib/supabase';
import styles from './OperationsMonitor.module.css';
export default function LandingStats(){
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
 useEffect(()=>{
  let live=true; const controller=new AbortController();setLoading(true);setError('');setData(null);
  (async()=>{
   const {data:session}=await supabase.auth.getSession();
   if(!session.session)throw Error('다시 로그인해주세요.');
   const response=await fetch('/api/super-admin/landing-stats',{headers:{Authorization:`Bearer ${session.session.access_token}`},cache:'no-store',signal:controller.signal});
   const result=await response.json();if(!response.ok)throw Error(result.error);
   if(live)setData(result);
  })().catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;controller.abort();};
 },[reload]);
 return <section className={styles.panel} aria-label="인스타그램 랜딩 방문 통계" aria-busy={loading}>
  <div className={styles.heading}><h2>인스타그램 랜딩 방문자</h2><button type="button" disabled={loading} onClick={()=>setReload(v=>v+1)}>새로고침</button></div>
  <p className={styles.muted}>홍보 랜딩 페이지 전체 방문 · 한국 시간 기준</p>
  {loading&&<p role="status">방문 통계를 불러오는 중…</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}
  {data&&<div className={styles.stats}>{[['오늘','today'],['최근 7일','week'],['최근 30일','month'],['누적','total']].map(([label,key])=><div className={styles.stat} key={key}><span>{label}</span><strong>{Number(data[key]).toLocaleString('ko-KR')}명</strong></div>)}</div>}
  <p className={styles.muted}>각 기간 내 같은 브라우저는 1명으로 집계합니다. 다른 기기·브라우저나 저장정보 삭제 시 별도로 집계될 수 있습니다. 인스타그램 외 유입도 포함합니다.</p>
  <p className={styles.muted}>기능 적용 이후부터 집계하며 이전 방문 기록은 포함되지 않습니다.</p>
  <a href="/for-business" target="_blank" rel="noopener noreferrer">랜딩 페이지 열기 ↗</a>
 </section>;
}
