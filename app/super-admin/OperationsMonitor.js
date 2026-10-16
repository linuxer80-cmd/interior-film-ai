'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import styles from './OperationsMonitor.module.css';
const statusNames={consulting:'상담 중',scheduled:'시공 예정',in_progress:'시공 중',completed:'완료',cancelled:'취소'};
const reportNames={pending:'검수 대기',approved:'승인',rejected:'반려'};
const date=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}):'기록 없음';
function Pager({page,total,onChange}){const last=Math.max(1,Math.ceil(total/10));return <nav className={styles.pages} aria-label='모니터링 목록 페이지'><button type='button' disabled={page<=1} onClick={()=>onChange(page-1)}>이전</button><span>{page} / {last}</span><button type='button' disabled={page>=last} onClick={()=>onChange(page+1)}>다음</button></nav>;}
export default function OperationsMonitor({type,id,lazy=false}){
 const listRef=useRef(null);
 const [opened,setOpened]=useState(!lazy),[days,setDays]=useState(30),[reload,setReload]=useState(0);
 const [data,setData]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [tab,setTab]=useState('sites'),[filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[page,setPage]=useState(1);
 useEffect(()=>{
  if(!opened)return;
  const controller=new AbortController();let live=true;setLoading(true);setError('');setData(null);setPage(1);
  (async()=>{
   const {data:session}=await supabase.auth.getSession();
   if(!session.session)throw Error('슈퍼관리자로 다시 로그인해주세요.');
   const response=await fetch(`/api/super-admin/monitor?${new URLSearchParams({type,id,days:String(days)})}`,{headers:{Authorization:`Bearer ${session.session.access_token}`},cache:'no-store',signal:controller.signal});
   const result=await response.json();if(!response.ok)throw Error(result.error||'조회 실패');if(live)setData(result);
  })().catch(e=>{if(live&&e.name!=='AbortError')setError(e.message);}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;controller.abort();};
 },[opened,type,id,days,reload]);
 const company=type==='company';
 const rows=useMemo(()=>{
  const q=search.trim().toLowerCase();
  const source=tab==='schedule'?(data?.upcoming||[]):(data?.sites||[]);
  return source.filter(r=>{
   if(q&&![r.name,r.siteName,r.companyName,...(r.people||[]).map(p=>p.name)].filter(Boolean).join(' ').toLowerCase().includes(q))return false;
   if(filter==='all')return true;
   if(tab==='schedule')return filter==='unassigned'?!r.people.length:filter==='noLeader'?r.people.length&&!r.people.some(p=>p.role==='leader'):true;
   return filter==='pending'?r.status!=='cancelled'&&r.reportStatus==='pending':filter==='overdue'?r.overdue:filter==='stalePending'?r.status!=='cancelled'&&r.stalePending:filter==='rejected'?r.status!=='cancelled'&&r.reportStatus==='rejected':r.status===filter;
  });
 },[data,tab,filter,search]);
 const current=Math.min(page,Math.max(1,Math.ceil(rows.length/10)));
 function select(nextTab,nextFilter='all'){setTab(nextTab);setFilter(nextFilter);setSearch('');setPage(1);requestAnimationFrame(()=>{listRef.current?.scrollIntoView({behavior:'smooth',block:'start'});listRef.current?.focus({preventScroll:true});});}
 if(!opened)return <button type='button' onClick={()=>setOpened(true)}>활동·배정 현황 보기</button>;
 const s=data?.summary||{};
 return <section className={styles.panel} aria-label={company?'업체 운영 모니터링':'시공자 활동 모니터링'} aria-busy={loading}>
  <div className={styles.heading}><div><h2>{company?'업체 운영 모니터링':'시공자 활동 모니터링'}</h2><p className={styles.muted}>조회 시점 기준 · 한국 시간</p></div><button type='button' disabled={loading} onClick={()=>setReload(v=>v+1)}>새로고침</button></div>
  <div className={styles.controls}><label>배정 이력 조회 기간<select value={days} onChange={e=>{setDays(Number(e.target.value));setPage(1);}}><option value={30}>최근 30일</option><option value={90}>최근 90일</option><option value={180}>최근 180일</option></select></label>{lazy&&<button type='button' onClick={()=>setOpened(false)}>현황 접기</button>}</div>
  {loading&&<p role='status'>현장·배정·보고 상태를 확인하고 있습니다…</p>}
  {error&&<p role='alert' className={styles.error}>{error}</p>}
  {data&&<>
   <p className={styles.muted}>조회 {date(data.generatedAt)} · 현장 상태는 전체 기간, 과거 배정일은 오늘을 제외한 조회 기간, 예정 배정은 오늘부터 14일입니다.</p>
   <div className={styles.stats}>
    {(company?[
     ['전체 현장',s.sites||0,'sites','all'],['시공 중',s.inProgress||0,'sites','in_progress'],['검수 대기',s.pending||0,'sites','pending'],['예정일 지남·보고 확인',s.overdue||0,'sites','overdue'],
     ['7일 넘은 검수 대기',s.stalePending||0,'sites','stalePending'],['반려된 현장',s.rejected||0,'sites','rejected'],['인원 미배정 일정',s.unassigned||0,'schedule','unassigned'],['팀장 미지정 일정',s.noLeader||0,'schedule','noLeader'],
    ]:[['배정 현장',s.sites||0,'sites','all'],['예정 배정일',s.upcomingDays||0,'schedule','all'],['배정 현장 검수 대기',s.pending||0,'sites','pending'],['배정 현장 보고 확인',s.overdue||0,'sites','overdue']]).map(([label,value,t,f])=><button type='button' key={label} className={styles.stat} onClick={()=>select(t,f)}><span>{label}</span><strong>{value}</strong><span>목록 확인 →</span></button>)}
   </div>
   {!company&&<p className={styles.muted}>지난 {days}일 배정일수 {s.pastAssignmentDays||0}일 · 그중 팀장 배정 {s.pastLeaderDays||0}일. 같은 날짜는 업체·현장이 여러 개여도 1일로 셉니다. 실제 출근·근무일수나 보고서 작성자 실적은 아닙니다.</p>}
   {company&&<p className={styles.muted}>시공자 명단 {s.workers||0}건 · 활성 명단 {s.activeWorkers||0}건 · 로그인 계정 미연결 {s.unlinkedWorkers||0}건 · 최근 {days}일 수정된 현장 {s.recentlyUpdated||0}건</p>}
   <p className={styles.muted}>팀장 미지정은 확인 항목이며 오류로 단정하지 않습니다. 로그인·접속 기록과 현장 수정 기록은 다릅니다.</p>
   {!!data.conflicts.length&&<div className={styles.alert}><strong>같은 날짜에 여러 현장 배정 {data.conflicts.length}건</strong><p>시간대가 다를 수 있으므로 배정 내용을 확인해주세요.</p>{data.conflicts.slice(0,20).map((r,i)=><p key={r.date+':'+i}>{r.date} · {r.name} · {r.sites.map(s=>`${s.companyName} / ${s.name}`).join(', ')}</p>)}{data.conflicts.length>20&&<p>앞의 20건 표시 · 전체 {data.conflicts.length}건</p>}</div>}
   <div ref={listRef} tabIndex={-1} style={{scrollMarginTop:100}}><h3 aria-live='polite'>{tab==='sites'?'현장·보고 목록':'예정 배정 목록'} · {rows.length}건</h3></div>
   <div className={styles.controls}><button type='button' aria-pressed={tab==='sites'} onClick={()=>select('sites')}>현장·보고 상태</button><button type='button' aria-pressed={tab==='schedule'} onClick={()=>select('schedule')}>앞으로 14일 배정</button></div>
   <div className={styles.controls}>
    <label className={styles.search}>검색<input type='search' value={search} maxLength={100} placeholder='현장명·업체명·배정자' onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label>
    <label>확인 항목<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value='all'>전체</option>{tab==='sites'?<><option value='pending'>검수 대기</option><option value='stalePending'>7일 넘은 검수 대기</option><option value='rejected'>반려</option><option value='overdue'>예정일 지남·보고 확인</option>{Object.entries(statusNames).map(([v,n])=><option value={v} key={v}>{n}</option>)}</>:<><option value='unassigned'>인원 미배정</option><option value='noLeader'>팀장 미지정</option></>}</select></label>
   </div>
   <p className={styles.muted}>조건에 맞는 {tab==='sites'?'현장':'일정'} {rows.length}건</p>
   {rows.slice((current-1)*10,current*10).map(row=><article className={styles.row} key={tab==='sites'?row.companyId+':'+row.id:row.key}>
    <h3>{tab==='sites'?row.name:row.siteName}</h3>
    {!company&&<Link href={`/super-admin/company/${row.companyId}#monitor`} data-ui-link="inline">{row.companyName}</Link>}
    {tab==='sites'?<><div><span className={styles.badge}>{statusNames[row.status]||row.status||'상태 미지정'}</span><span className={styles.badge}>보고: {reportNames[row.reportStatus]||row.reportStatus||'기록 없음'}</span>{row.overdue&&<span className={styles.badge}>예정일 경과</span>}</div><p className={styles.muted}>현장 수정 {date(row.updatedAt)} · 보고 수정 {date(row.reportUpdatedAt)}</p></>:<><p><strong>{row.date}</strong>{row.legacy&&<span className={styles.badge}>기존 기간 배정</span>}</p><p>{row.people.length?row.people.map(p=>`${p.name} (${p.role==='leader'?'팀장':'팀원'})`).join(' · '):'배정된 활성 시공자가 없습니다.'}</p></>}
   </article>)}
   {!rows.length&&<p className={styles.empty}>조건에 맞는 기록이 없습니다.</p>}
   <Pager page={current} total={rows.length} onChange={setPage}/>
   <details><summary>{company?'업체 시공자 연결 명단':'연결된 업체·명단'} ({data.memberships.length})</summary><div className={styles.roster}>{data.memberships.map(w=><div className={styles.row} key={w.id}><strong>{w.name||'이름 미등록'}</strong><p className={styles.muted}>{data.companies.find(c=>c.id===w.company_id)?.company_name||'업체 확인 필요'} · {w.is_active===false?'명단 비활성':'명단 활성'} · {w.user_id?'계정 연결':'계정 미연결'}</p><Link href={`/super-admin/workers?kind=${w.user_id?"account":"unlinked"}&company=${encodeURIComponent(w.company_id)}&q=${encodeURIComponent(w.name||'')}`} data-ui-link="action">시공자 관리</Link></div>)}</div>{!data.memberships.length&&<p>연결된 업체 명단이 없습니다.</p>}</details>
   {company&&<div className={styles.links}><Link href={`/super-admin/company/${id}#usage`} data-ui-link="action">AI 사용량·한도</Link><Link href={`/super-admin/company/${id}#accounts`} data-ui-link="action">계정·최근 로그인</Link><Link href={`/super-admin/company/${id}#photos`} data-ui-link="action">등록 사진</Link></div>}
  </>}
 </section>;
}

