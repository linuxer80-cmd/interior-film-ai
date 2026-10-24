'use client';
import {useMemo,useState} from 'react';
import styles from './sales.module.css';
const num=v=>v==null?'미제공':typeof v==='string'?v.replace(/<\s*(\d+)/,'$1 미만'):Number(v).toLocaleString('ko-KR',{maximumFractionDigits:2});
const pct=v=>v==null?'미제공':`${Number(v).toFixed(2)}%`;
const key=v=>v.normalize('NFKC').replace(/\s/g,'').toLowerCase();
export default function NaverKeywordFinder({groupId,api,selected,onSelect,busy:parentBusy}){
 const [query,setQuery]=useState('인천인테리어필름'),[data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[filter,setFilter]=useState('all'),[sort,setSort]=useState('mobileSearches'),[page,setPage]=useState(0);
 const disabled=busy||parentBusy;
 const selectedKeys=new Set(selected.map(key));
 const rows=useMemo(()=>{
  const values=(data?.rows||[]).filter(r=>filter==='all'||filter==='new'&&!r.registered&&!r.registrationReason||filter==='registered'&&r.registered);
  const score=r=>typeof r[sort]==='number'?r[sort]:-1;
  return values.sort((a,b)=>score(b)-score(a)||a.keyword.localeCompare(b.keyword,'ko'));
 },[data,filter,sort]);
 async function search(e){e.preventDefault();setBusy(true);setError('');setData(null);setPage(0);
  try{setData(await api({action:'relatedKeywords',groupId,query}));}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 function toggle(keyword){if(selectedKeys.has(key(keyword)))onSelect(selected.filter(v=>key(v)!==key(keyword)));else if(selected.length<100)onSelect([...selected,keyword]);}
 return <div>
  <form onSubmit={search} className={styles.searchBar}><label className={styles.grow}>관련 키워드 검색<input value={query} maxLength={160} disabled={disabled} onChange={e=>setQuery(e.target.value)} placeholder='예: 인천인테리어필름, 싱크대필름시공' required/></label><button disabled={disabled||!groupId}>{busy?'검색 중…':'검색'}</button></form>
  <p className={styles.hint}>검색어 최대 5개 · 쉼표로 구분. 필름·시트지 관련 결과를 보여줍니다.</p>
  {error&&<p role='alert' className={styles.error}>{error}</p>}
  {data&&<><p className={styles.hint}>검색수는 최근 30일, 클릭·클릭률은 최근 4주 기준입니다. 평균 클릭률은 키워드 도구의 시장 참고치입니다. 우리 광고 성과나 노출 보장 수치가 아닙니다. ‘10 미만’은 0으로 계산하지 않습니다.</p>
   <div className={styles.filters}><label>표시 대상<select disabled={disabled} value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value='all'>전체 {data.total}개</option><option value='new'>추가 가능한 키워드</option><option value='registered'>선택 그룹에 등록됨</option></select></label><label>높은 순 정렬<select value={sort} onChange={e=>{setSort(e.target.value);setPage(0);}}><option value='mobileSearches'>모바일 검색수</option><option value='pcSearches'>PC 검색수</option><option value='mobileCtr'>모바일 평균 클릭률</option><option value='pcCtr'>PC 평균 클릭률</option></select></label></div>
   <p className={styles.hint}>{data.groupName} 비교 · 우리 광고 {data.period.start} ~ {data.period.end}</p>
   <div className={styles.keywordResults}>{rows.slice(page*15,(page+1)*15).map(row=><article className={styles.keywordResult} key={row.keyword}>
    <label className={styles.keywordChoice}><input type='checkbox' checked={selectedKeys.has(key(row.keyword))} disabled={disabled||row.registered||!!row.registrationReason||selected.length>=100&&!selectedKeys.has(key(row.keyword))} onChange={()=>toggle(row.keyword)}/><strong>{row.keyword}</strong><span className={styles.hint}>{row.registered?'등록됨':row.registrationReason?'참고용':'선택 가능'}</span></label>
    <dl className={styles.keywordNumbers}><div><dt>월 검색수 PC / 모바일</dt><dd>{num(row.pcSearches)} / {num(row.mobileSearches)}</dd></div><div><dt>평균 클릭률 PC / 모바일</dt><dd>{pct(row.pcCtr)} / {pct(row.mobileCtr)}</dd></div><div><dt>평균 광고 클릭 PC / 모바일</dt><dd>{num(row.pcClicks)} / {num(row.mobileClicks)}</dd></div><div><dt>경쟁 정도</dt><dd>{row.competition||'미제공'}</dd></div></dl>
    {row.actual?<p className={styles.actualMetrics}>우리 광고 · 노출 {num(row.actual.impressions)} · 클릭 {num(row.actual.clicks)} · 클릭률 {pct(row.actual.ctr)}</p>:<p className={styles.hint}>{row.registrationReason||'선택 그룹 미등록 · 우리 광고 성과 없음'}</p>}
   </article>)}</div>
   {!rows.length&&<p>조건에 맞는 키워드가 없습니다. 지역명이나 시공 부위를 바꿔 검색해보세요.</p>}
   <div className={styles.actions}><button type='button' className={styles.secondary} disabled={page===0||disabled} onClick={()=>setPage(p=>p-1)}>이전</button><span>{page+1} / {Math.max(1,Math.ceil(rows.length/15))}</span><button type='button' className={styles.secondary} disabled={(page+1)*15>=rows.length||disabled} onClick={()=>setPage(p=>p+1)}>다음</button></div>
  </>}
 </div>;
}
