'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {supabase} from '../../../lib/supabase';
import OperationsMonitor from '../OperationsMonitor';
import styles from './workers.module.css';
const date=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'기록 없음';
const kindName={employee:'업체 직원',freelancer:'협력·프리랜서',unspecified:'관계 미지정'};
async function request(path,body,signal){
 const {data}=await supabase.auth.getSession();if(!data.session)throw Error('슈퍼관리자로 로그인해주세요.');
 const response=await fetch(path,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal});
 const result=await response.json();if(!response.ok)throw Error(result.error||'요청 실패');return result;
}
export default function SuperWorkers(){
 const [data,setData]=useState(null),[query,setQuery]=useState(''),[filters,setFilters]=useState({q:'',status:'all',company:'',kind:'account',page:1});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0);
 const lock=useRef(false);
 useEffect(()=>{const p=new URLSearchParams(window.location.search);const kind=['account','unlinked','pending'].includes(p.get('kind'))?p.get('kind'):'account';const company=p.get('company')||'',q=(p.get('q')||'').slice(0,100);if(company||q||kind!=='account'){setQuery(q);setFilters(f=>({...f,kind,company:/^[\da-f]{8}-[\da-f-]{27}$/i.test(company)?company:'',q,page:1}));}},[]);
 useEffect(()=>{const controller=new AbortController();let active=true;setLoading(true);setError('');setData(null);
 request(`/api/super-admin/workers?${new URLSearchParams(filters)}`,null,controller.signal).then(r=>{if(active)setData(r);}).catch(e=>{if(active&&e.name!=='AbortError')setError(e.message);}).finally(()=>{if(active)setLoading(false);});
 return()=>{active=false;controller.abort();};},[filters,reload]);
 function filter(key,value){setFilters(f=>({...f,[key]:value,page:1}));}
 async function unpublish(row){
  if(lock.current||!window.confirm(`${row.name}님의 구직·프로필 공개를 내릴까요? 현재 공개만 해제하며 본인이 나중에 다시 공개할 수 있습니다. 계정과 기존 현장 배정은 유지됩니다.`))return;
  lock.current=true;setBusy(true);setError('');setNotice('');
  try{await request('/api/super-admin/workers',{action:'unpublish',userId:row.id,revision:row.profileRevision});setNotice('구직·프로필 공개를 해제했습니다.');setReload(v=>v+1);}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
 }
 return <main className={styles.page}>
  <Link href='/super-admin' data-ui-link="action">← 슈퍼관리자 홈</Link>
  <header><h1>시공자 관리</h1><button disabled={loading||busy} onClick={()=>setReload(v=>v+1)}>새로고침</button></header>
  <p>가입 계정과 업체별 연결 정보를 확인합니다. 여러 업체에 등록된 시공자는 계정 하나로 묶어 표시합니다.</p>
  {data&&<div className={styles.summary}>시공자 계정 {data.summary.accounts}명 · 구직 중 {data.summary.seeking}명 · 미연결 명단 {data.summary.unlinked}건 · 미분류 가입 {data.summary.pending}명</div>}
  <nav className={styles.tabs} aria-label='시공자 분류'>{[['account','가입 시공자'],['unlinked','계정 미연결 명단'],['pending','미분류 가입']].map(([key,label])=><button key={key} disabled={busy} aria-pressed={filters.kind===key} onClick={()=>setFilters(f=>({...f,kind:key,status:'all',company:'',page:1}))}>{label}</button>)}</nav>
  {filters.kind==='unlinked'&&<p>관리자가 등록했지만 로그인 계정이 연결되지 않은 명단입니다. 이름이나 전화번호가 같아도 자동으로 합치지 않습니다.</p>}
  {filters.kind==='pending'&&<p>업체·시공자 프로필과 연결되지 않아 가입 목적을 확정할 수 없는 계정입니다. 시공자로 자동 분류하거나 연결하지 않습니다.</p>}
  <form onSubmit={e=>{e.preventDefault();filter('q',query);}} className={styles.filters}>
   <label>이름·이메일·전화번호·업체 검색<input value={query} maxLength={100} onChange={e=>setQuery(e.target.value)}/></label>
   <label>표시 상태<select value={filters.status} onChange={e=>filter('status',e.target.value)}><option value='all'>전체</option>{filters.kind==='account'&&<><option value='seeking'>구직 중</option><option value='published'>프로필 공개</option><option value='private'>프로필 비공개</option><option value='incomplete'>프로필·인증 미완료</option></>}<option value='inactive'>계정/명단 비활성</option></select></label>
   {filters.kind!=='pending'&&<label>연결 업체<select value={filters.company} onChange={e=>filter('company',e.target.value)}><option value=''>전체 업체</option>{data?.companies.map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}</select></label>}
   <button disabled={loading||busy}>검색</button>
  </form>
  {error&&<p role='alert' className={styles.error}>{error}</p>}{notice&&<p role='status'>{notice}</p>}
  {loading&&<p role='status'>시공자 정보를 불러오는 중입니다…</p>}
  {data?.directoryUpgradeRequired&&<p>목록 조회 최적화 SQL 적용 전입니다. 현재는 기존 조회 방식을 사용합니다.</p>}
  {data&&!data.relationshipsAvailable&&<p>직원·협력 관계 DB가 아직 적용되지 않아 업체 연결만 표시합니다.</p>}
  {data&&<><p>검색 결과 {data.total}건</p>{!data.items.length&&<p>조건에 맞는 시공자가 없습니다.</p>}
   {data.items.map(row=><article key={row.id} className={styles.card}>
    <h2>{row.name}</h2><p>{row.kind==='unlinked'?'로그인 계정 미연결':row.email||'이메일 없음'} · {row.active?'활성':'비활성'}</p>
    <p>연락처 {row.phones.join(' · ')||'미등록'}</p>
    {row.kind==='account'&&<p>최근 로그인 {date(row.lastSignIn)}{row.lastSignIn&&Date.parse(row.lastSignIn)<Date.now()-30*86400000?' · 30일 이상 로그인 기록 없음':''}</p>}
    <p>{row.kind==='unlinked'?'명단 등록':'가입'} {date(row.createdAt)}{row.kind!=='unlinked'&&<> · 이메일 {row.emailConfirmed?'인증 완료':'미인증'}</>}</p>
    {row.kind==='account'&&<><p>등록 일당 {row.dailyWage==null?'미등록':`${Number(row.dailyWage).toLocaleString('ko-KR')}원`} · {row.seeking?'구직 중':row.published?'프로필 공개':'비공개'}</p><p>{row.region||'지역 미등록'} · 경력 {row.experience??'미등록'}{row.experience!=null?'년':''}</p></>}
    <details><summary>프로필·업체 연결 상세</summary>
     <p>{row.skills?.join(' · ')||'전문 분야 미등록'}</p><p className={styles.text}>{row.introduction||'자기소개 미등록'}</p>
     <p>최근 로그인 {date(row.lastSignIn)}</p>
     {row.memberships.length?row.memberships.map(m=><p key={m.workerId}><Link href={`/super-admin/company/${m.companyId}`} data-ui-link="inline">{m.companyName}</Link> · {kindName[m.relationship]} · {m.active?'연결 명단 활성':'명단 비활성'}{!m.companyActive?' · 업체 중지':''}</p>):<p>연결된 업체가 없습니다.</p>}
     <small>계정/명단 ID: {row.id}</small>
    </details>
    {['account','unlinked'].includes(row.kind)&&<OperationsMonitor type={row.kind} id={row.id} lazy/>}
    {row.kind==='account'&&(row.published||row.seeking)&&<button disabled={busy||loading} onClick={()=>unpublish(row)}>구직·프로필 공개 내리기</button>}
   </article>)}
   <nav className={styles.tabs} aria-label='페이지'><button disabled={loading||busy||data.page<=1} onClick={()=>setFilters(f=>({...f,page:data.page-1}))}>이전</button><span>{data.page} / {Math.max(1,Math.ceil(data.total/data.pageSize))}</span><button disabled={loading||busy||data.page*data.pageSize>=data.total} onClick={()=>setFilters(f=>({...f,page:data.page+1}))}>다음</button></nav>
  </>}
 </main>;
}

