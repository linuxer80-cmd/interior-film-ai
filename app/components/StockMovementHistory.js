"use client";
import {useEffect,useRef,useState} from 'react';
import {reportRequest} from '../utils/reportClient';
import {stockHistoryActions} from '../../lib/stockHistory.mjs';
import styles from './StockMovementHistory.module.css';
const day = value => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const number = value => Number(value).toLocaleString('ko-KR',{maximumFractionDigits:3});
export default function StockMovementHistory() {
  const [end,setEnd]=useState(()=>day(Date.now()));
  const [start,setStart]=useState(()=>day(Date.now()-6*86400000));
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [action,setAction]=useState(''),[query,setQuery]=useState(''),[shown,setShown]=useState(100);
  const sequence=useRef(0);
  async function load() {
    const current=++sequence.current;
    setBusy(true);setError('');setData(null);setShown(100);
    try{
      const result=await reportRequest('/api/admin/stock-history?'+new URLSearchParams({start,end}));
      if(current===sequence.current)setData(result);
    }catch(e){if(current===sequence.current)setError(e.message);}
    finally{if(current===sequence.current)setBusy(false);}
  }
  useEffect(()=>{load();return()=>{sequence.current++;};},[]);
  const q=query.trim().toLocaleLowerCase();
  const rows=(data?.rows||[]).filter(r=>(!action||r.action===action)&&(!q||[r.brand,r.code,r.name,r.roll,r.site,r.actor,r.memo].join(' ').toLocaleLowerCase().includes(q)));
  const groups=new Map();
  for(const row of rows.slice(0,shown)){const key=day(row.at);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  return <section className={styles.root} aria-label="날짜별 입출고 이력" aria-busy={busy}>
    <h2>날짜별 입고·반출·반납</h2>
    <p>한국 시간 기준입니다. 담당자는 해당 처리를 저장한 사람입니다. 수량만 입력한 기록은 창고 롤 이동과 구분해 표시합니다.</p>
    <form onSubmit={e=>{e.preventDefault();load();}} className={styles.filters}>
      <label>시작일<input type="date" required value={start} max={end} onChange={e=>setStart(e.target.value)}/></label>
      <label>종료일<input type="date" required value={end} min={start} onChange={e=>setEnd(e.target.value)}/></label>
      <button type="submit" disabled={busy}>{busy?'조회 중…':'기간 조회 · 새로고침'}</button>
    </form>
    <p className={styles.help}>한 번에 최대 31일을 조회할 수 있습니다.</p>
    <div className={styles.filters}>
      <label>이동 구분<select value={action} onChange={e=>{setAction(e.target.value);setShown(100);}}><option value="">전체</option>{Object.entries(stockHistoryActions).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>자재·사람·현장 검색<input type="search" value={query} placeholder="제품번호, 롤번호, 이름, 현장명" onChange={e=>{setQuery(e.target.value);setShown(100);}}/></label>
    </div>
    {error&&<p role="alert" className={styles.warning}>{error}</p>}
    {data?.truncated&&<p role="alert" className={styles.warning}>기록이 많아 일부만 조회됐습니다. 조회 기간을 줄여주세요. 아래 건수는 조회된 기록 기준입니다.</p>}
    {data&&<p role="status">조회된 기록 중 {rows.length}건</p>}
    {data&&!rows.length&&<p>선택한 기간과 조건에 맞는 기록이 없습니다.</p>}
    {[...groups].map(([date,items])=><section key={date} className={styles.day}><h3>{date} · {items.length}건 표시</h3>{items.map(r=><article key={r.id} className={styles.card}>
      <div className={styles.heading}><strong>{stockHistoryActions[r.action]||'재고 이동'}{r.voided?' · 취소됨':''}</strong><time dateTime={r.at}>{new Date(r.at).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time></div>
      <strong>{[r.brand,r.code,r.name].filter(Boolean).join(' · ')||'자재 정보 없음'}</strong>
      <p>{r.action==='correct_return'?'수정 후 반납량':'수량'}: {r.quantity==null?'확인 필요':number(r.quantity)+' '+r.unit}</p>
      <p><b>{r.action==='issue'?'반출 등록자':r.action==='return'?'반납 등록자':r.action==='receive'?'입고 등록자':'처리자'}:</b> {r.actor}</p>
      {r.site&&<p>현장: {r.site}</p>}
      <p>롤: {r.roll||'연결 정보 없음'}</p>
      {r.source!=='roll'&&<p className={styles.help}>수량 입력 기록 · 롤 연결 없음{r.source==='manual-return'?' · 마지막 저장 시각 기준':''}</p>}
      {r.memo&&<p className={styles.help}>{r.memo}</p>}
    </article>)}</section>)}
    {rows.length>shown&&<button type="button" onClick={()=>setShown(n=>n+100)}>이전 기록 더 보기</button>}
    <p className={styles.help}>이력에 저장되지 않은 사람이나 롤은 추정하지 않습니다. 예전 수량 반납 기록은 마지막 저장 상태만 확인할 수 있습니다.</p>
  </section>;
}
