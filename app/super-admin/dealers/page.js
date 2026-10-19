"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {reportRequest} from '../../utils/reportClient';
import {dealerActions} from '../../../lib/dealerActivity.mjs';
import styles from './page.module.css';
const date=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'기록 없음';
const day=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
const status={pending:'승인 대기',active:'승인됨',disabled:'중지',deleted:'삭제됨'};
const stage=o=>o.status==='assigned'?'접수 대기':o.status==='preparing'?(o.phase==='ready'?'주문자 결제 대기':o.phase==='paid'?'출고 대기':'준비 중'):o.status==='partial'?'일부 출고':'수령 확인 대기';
export default function DealerMonitor(){
 const [start,setStart]=useState(()=>day(Date.now()-6*86400000)),[end,setEnd]=useState(()=>day(Date.now()));
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [kind,setKind]=useState('all'),[dealer,setDealer]=useState(''),[query,setQuery]=useState(''),[count,setCount]=useState(100);
 const seq=useRef(0),range=useRef({start,end});
 async function load(next=range.current){
  const n=++seq.current;setBusy(true);setError('');range.current=next;
  try{const result=await reportRequest('/api/super-admin/dealer-activity?'+new URLSearchParams(next));if(n===seq.current)setData(result);}
  catch(e){if(n===seq.current)setError(e.message);}
  finally{if(n===seq.current)setBusy(false);}
 }
 useEffect(()=>{load();const timer=setInterval(()=>{if(!document.hidden)load();},30000);return()=>{clearInterval(timer);seq.current++;};},[]);
 const dealers=(data?.dealers||[]).filter(d=>(kind==='all'||(kind==='test')===d.test)&&(!query||d.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
 const ids=new Set(dealers.map(d=>d.id));
 const activity=(data?.activities||[]).filter(e=>(!dealer||e.dealerId===dealer)&&(e.dealerId?ids.has(e.dealerId):kind==='all'&&!query));
 const pending=(data?.pending||[]).filter(o=>ids.has(o.dealerId)&&(!dealer||o.dealerId===dealer));
 return <main className={styles.root}>
  <Link href="/super-admin" data-ui-link="action">← 슈퍼관리자 홈</Link>
  <h1>필름 대리점 활동</h1>
  <p>대리점 가입·승인 상태와 자재 주문 연동 활동을 확인합니다. 현재 연동 주문은 테스트 주문이며, 실제 결제 주문은 별도 주문관리에서 확인하세요.</p>
  <div className={styles.links}><Link href="/super-admin/material-pilot" data-ui-link="action">대리점 승인·테스트 주문 처리</Link><Link href="/super-admin/material-orders" data-ui-link="action">자재 주문관리</Link></div>
  <form className={styles.filters} onSubmit={e=>{e.preventDefault();setCount(100);load({start,end});}}><label>활동 시작일<input type="date" required value={start} max={end} onChange={e=>setStart(e.target.value)}/></label><label>종료일<input type="date" required value={end} min={start} onChange={e=>setEnd(e.target.value)}/></label><button disabled={busy}>{busy?'조회 중…':'조회 · 새로고침'}</button></form>
  <p className={styles.help}>활동 기간 최대 31일 · 30초마다 새로고침 · 주문 상태는 현재 기준</p>
  {error&&<p role="alert" className={styles.warning}>{error}</p>}
  {data?.truncated&&<p role="alert" className={styles.warning}>조회 한도에 도달해 일부 기록이 빠질 수 있습니다. 표시된 건수는 조회된 데이터 기준입니다.</p>}
  <div className={styles.filters}><label>대리점 구분<select value={kind} onChange={e=>{setKind(e.target.value);setDealer('');setCount(100);}}><option value="all">전체</option><option value="real">실제 대리점</option><option value="test">테스트 대리점</option></select></label><label>이름 검색<input value={query} type="search" onChange={e=>{setQuery(e.target.value);setDealer('');setCount(100);}}/></label></div>
  <h2>대리점별 현재 현황 · {dealers.length}곳</h2>
  {data&&!dealers.length&&<p>조건에 맞는 대리점이 없습니다.</p>}
  {dealers.map(d=><article key={d.id} className={styles.card}><h3>{d.name} <small>{d.test?'테스트':'실제 대리점'} · {status[d.status]||d.status}</small></h3><p>가입: {date(d.registeredAt)} · 로그인 계정 {d.accountLinked?'연결됨':'미연결'}</p><div className={styles.stats}><span>접수 대기 <b>{d.waiting}</b></span><span>준비 중 <b>{d.preparing}</b></span><span>출고·수령 중 <b>{d.shipping}</b></span><span>수령 완료 <b>{d.received}</b></span><span>취소 <b>{d.cancelled}</b></span></div><p>기간 내 마지막 주문 활동: {date(d.lastActivity)}<br/>대리점 계정의 마지막 처리: {date(d.lastDealerActivity)}</p>{d.delegated>0&&<p>슈퍼관리자 대신 처리 {d.delegated}건</p>}<button onClick={()=>{setDealer(d.id);setCount(100);}}>이 대리점 활동 보기</button></article>)}
  <label className={styles.select}>활동 대리점<select value={dealer} onChange={e=>{setDealer(e.target.value);setCount(100);}}><option value="">전체 대리점</option>{dealers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
  <h2>처리 중인 연동 주문 · {pending.length}건</h2>
  <p className={styles.help}>경과 시간은 주문 생성 시각 기준이며, 대리점 응답 지연 시간과 다를 수 있습니다.</p>
  {pending.slice(0,100).map(o=><article className={styles.card} key={o.id}><strong>{o.dealerName} · {stage(o)}</strong><p>주문 후 {o.hours}시간 · {date(o.createdAt)}</p><Link href={'/super-admin/material-pilot?order='+o.id}>TEST-{o.id.slice(0,8).toUpperCase()} 주문 열기</Link></article>)}
  {pending.length>100&&<p>처리 중 주문은 최근 100건을 표시합니다. 대리점을 선택해 범위를 좁혀주세요.</p>}
  <h2>기간별 처리 이력</h2>
  {data&&<p>{data.start} ~ {data.end} · {activity.length}건</p>}
  {data&&!activity.length&&<p>조회 기간에 저장된 활동이 없습니다.</p>}
  {activity.slice(0,count).map(e=><article className={styles.card} key={e.id}><strong>{e.dealerName} · {dealerActions[e.action]||'주문 상태 변경'}</strong><p>{date(e.at)}<br/>처리: {e.actor}</p><Link href={'/super-admin/material-pilot?order='+e.orderId}>TEST-{e.orderId.slice(0,8).toUpperCase()} 주문 열기</Link></article>)}
  {activity.length>count&&<button onClick={()=>setCount(n=>n+100)}>이전 활동 더 보기</button>}
  <p className={styles.help}>‘대리점 계정의 마지막 처리’는 저장된 주문 활동 기준입니다. 로그인·페이지 열람 시각은 수집된 기록이 없어 표시하지 않습니다.</p>
 </main>;
}
