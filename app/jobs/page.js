"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '../../lib/supabase';
import LaborNotifications from '../components/LaborNotifications';
import WorkDatePicker from '../admin/WorkDatePicker';
import '../components/laborMarket.css';

const blank={site_id:'',title:'인테리어필름 시공자 구인',region:'',work_content:'',work_dates:[],daily_wage:'',headcount:1,skills:[],min_experience:'',min_age:'',max_age:'',worker_region:''};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const money=n=>Number(n).toLocaleString('ko-KR');
const status={applied:'지원 완료',accepted:'구인 확정',invited:'현장 제안',expired:'지원 만료',rejected:'지원 만료',withdrawn:'지원 취소'};

function matches(j,p){
 if(!p)return false;
 return (!j.daily_wage||j.daily_wage>=p.daily_wage)&&(!j.min_experience||p.experience_years>=j.min_experience)
 &&(j.min_age==null||(p.age!=null&&p.age>=j.min_age))&&(j.max_age==null||(p.age!=null&&p.age<=j.max_age))
 &&(!j.worker_region||p.region?.includes(j.worker_region))&&(!j.skills?.length||j.skills.every(s=>p.skills?.includes(s)))
 &&(!p.available_dates?.length||j.work_dates?.every(d=>p.available_dates.includes(d)));
}

function Profile({p,detail=false}){
 return <><div className='person'>{p.photo_url?<img src={p.photo_url} alt='' width={64} height={64}/>:<div className='avatar-placeholder'>{p.name?.slice(0,1)}</div>}<div><h3>{p.name}{p.age?` · ${p.age}세`:''}</h3><p>{p.region} · 경력 {p.experience_years}년</p></div></div><p>희망 일당 <strong>{money(p.daily_wage)}원</strong></p><p>{p.skills?.join(' · ')}</p><div className='chips'>{p.available_dates?.filter(d=>d>=today()).map(d=><span className='badge' key={d}>{d}</span>)}</div>{detail&&p.introduction&&<p className='multiline'>{p.introduction}</p>}</>;
}

function Job({j,detail=false}){
 return <><h3>{j.title}</h3><p>{j.company_name} · {j.region}</p>{detail&&<><p>관리자 {j.manager_name||'업체 관리자'}</p><p className='multiline'>{j.work_content}</p></>}<div className='chips'>{j.work_dates?.map(d=><span className='badge' key={d}>{d}</span>)}</div><p>{j.daily_wage?`일당 ${money(j.daily_wage)}원`:'일당 협의'} · 모집 {j.headcount}명</p>{detail&&<>{j.min_experience!=null&&<p>경력 {j.min_experience}년 이상</p>}{(j.min_age!=null||j.max_age!=null)&&<p>나이 {j.min_age!=null?`${j.min_age}세 이상`:''} {j.max_age!=null?`${j.max_age}세 이하`:''}</p>}{j.worker_region&&<p>활동 지역 {j.worker_region}</p>}{j.skills?.length>0&&<p>전문 분야 {j.skills.join(' · ')}</p>}</>}</>;
}

function SiteOption({site,selected,onSelect,target}){
 const region=String(site.region||'').trim();
 const title=region&&!['null','undefined'].includes(region.toLowerCase())
   ?region:'지역 미등록 현장';

 const days=site.work_dates
   .filter(d=>!target||target.available_dates?.includes(d))
   .sort();

 const dateLabel=days.length
   ?new Intl.DateTimeFormat('ko-KR',{
     timeZone:'Asia/Seoul',month:'long',day:'numeric'
   }).format(new Date(`${days[0]}T00:00:00+09:00`))
     +(days.length>1?` 외 ${days.length-1}일`:'')
   :'시공일 미등록';

 const work=[...new Set(
   String(site.work_content||'')
     .split('\n')
     .map(t=>t.trim())
     .filter(t=>t&&!['null','undefined'].includes(t.toLowerCase()))
 )].join(' · ');

 return <button
   type='button'
   className='site-choice'
   aria-pressed={selected}
   onClick={onSelect}
 >
   <span className='site-choice-copy'>
     <strong className='site-choice-title'>{title}</strong>
     <span className='site-choice-work'>{work||'작업 내용 미등록'}</span>
     <span className='site-choice-date'>시공일 · {dateLabel}</span>
   </span>
   <span className='site-choice-mark' aria-hidden='true'>
     {selected?'✓':'›'}
   </span>
 </button>;
}

export default function JobsPage(){
 const [data,setData]=useState(null),[tab,setTab]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const [filters,setFilters]=useState({region:'',date:'',wage:'',experience:'',skill:''}),[search,setSearch]=useState({}),[page,setPage]=useState(0);
 const [sites,setSites]=useState([]),[sitesReady,setSitesReady]=useState(false),[job,setJob]=useState(null),[allowed,setAllowed]=useState([]),[target,setTarget]=useState(null);
 const [person,setPerson]=useState(null),[detail,setDetail]=useState(null),[consent,setConsent]=useState(false),[dates,setDates]=useState([]),[seekConsent,setSeekConsent]=useState(false),[confirm,setConfirm]=useState(null),[jobFilter,setJobFilter]=useState('');

 async function api(path,body,signal){
  const {data:s}=await supabase.auth.getSession();if(!s.session)throw Error('관리자 또는 시공자 계정으로 로그인해주세요.');
  const worker=new URLSearchParams(window.location.search).get('view')==='worker';
  const response=await fetch(path,{method:body?'POST':'GET',cache:'no-store',signal,headers:{Authorization:`Bearer ${s.session.access_token}`,'X-Labor-View':worker?'worker':'manager',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json().catch(()=>({error:'구인·구직 API가 배포되지 않았습니다. 배포 파일을 확인해주세요.'}));if(!response.ok)throw Error(result.error||'처리하지 못했습니다.');return result;
 }

 useEffect(()=>{const {data:s}=supabase.auth.onAuthStateChange(event=>{if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event)){setData(null);setSites([]);setSitesReady(false);setPerson(null);setDetail(null);setJob(null);setTarget(null);setReload(n=>n+1);}});return()=>s.subscription.unsubscribe();},[]);

 useEffect(()=>{
  const c=new AbortController();setError('');
  const params=new URLSearchParams(window.location.search),q={...search,page:String(page)};if(params.get('job'))q.job=params.get('job');
  api(`/api/labor-market?${new URLSearchParams(q)}`,null,c.signal).then(r=>{
   if(c.signal.aborted)return;setData(r);setTab(t=>{const tabs=r.manager?['candidates','mine','applications']:['jobs','matching','seeking','applications'];const requested=t||params.get('tab')||(params.get('site')?'mine':params.get('job')?'applications':'');return tabs.includes(requested)?requested:tabs[0];});setDates(r.profile?.available_dates?.filter(d=>d>=today())||[]);
  }).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();
 },[reload,search,page]);

 useEffect(()=>{
  if(!data?.manager||sitesReady)return;const c=new AbortController();
  api('/api/labor-market?mode=sites',null,c.signal).then(r=>{if(c.signal.aborted)return;setSites(r.sites);setSitesReady(true);const siteId=new URLSearchParams(window.location.search).get('site');if(siteId){const s=r.sites.find(s=>s.id===siteId);if(s)selectSite(s,null);else setError('진행할 현장과 오늘 이후의 시공일을 등록해주세요.');}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();
 },[data?.manager,sitesReady]);

 useEffect(()=>{
  if(!person&&!detail&&!confirm)return;
  const previous=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const dialog=document.querySelector('.labor-dialog');dialog?.querySelector('button,input,select,a[href]')?.focus();
  const key=e=>{if(e.key==='Escape'&&!busy){setPerson(null);setDetail(null);setConfirm(null);}if(e.key==='Tab'){const nodes=[...(dialog?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')||[])];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  document.addEventListener('keydown',key);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);previous?.focus?.();};
 },[person,detail,confirm,busy]);

 function selectSite(s,p=target){
  const ds=s.work_dates.filter(d=>!p||p.available_dates?.includes(d));
  setAllowed(ds);setJob({...blank,site_id:s.id,region:s.region,work_content:s.work_content,work_dates:ds,daily_wage:p?.daily_wage||''});setTab('mine');setDetail(null);setConsent(false);
 }

 async function act(body){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{await api('/api/labor-market',body);setNotice(body.recruitUserId?'현장 정보를 보내고 시공자를 배정했습니다. 구직 공고는 내려갔습니다.':body.action==='finish'?'구인 완료했습니다. 미선택 지원자에게 만료 알림을 보냈습니다.':body.action==='accept'?'시공자를 내 현장에 배정했습니다. 필요한 인원을 선택한 뒤 구인 완료를 눌러주세요.':body.action==='seeking'?'선택한 날짜의 구직 공고가 관리자들에게 공개되었습니다.':'처리했습니다.');if(body.action==='job'){setJob(null);setTarget(null);}setConfirm(null);setDetail(null);setPerson(null);setConsent(false);setReload(n=>n+1);}catch(e){setError(e.message);}finally{setBusy(false);}
 }

 const field=(label,key,type='text')=><label>{label}<input type={type} value={job?.[key]??''} min={type==='number'?0:undefined} onChange={e=>setJob(j=>({...j,[key]:e.target.value}))}/></label>;
 const allJobs=[...(data?.jobs||[]),...(data?.applicationJobs||[])];
 const selectedCount=id=>data?.applications.filter(a=>a.job_id===id&&a.status==='accepted').length||0;
 const candidateSites=target?sites.filter(s=>s.work_dates.some(d=>target.available_dates?.includes(d))):sites;
 const jobs=data?.jobs.filter(j=>j.status==='open'&&(tab!=='matching'||matches(j,data.profile)))||[];

 return <main className='labor-shell'>
  <nav className='labor-navigation' aria-label='구인·구직 화면 이동'>
   <Link className='labor-nav-button' href={data?.manager?'/admin':'/worker'}><span className='labor-nav-icon' aria-hidden='true'>⌂</span><span>{data?.manager?'관리자 홈':'시공자 홈'}</span><span className='labor-nav-arrow' aria-hidden='true'>›</span></Link>
   <Link className='labor-nav-button' href='/worker/account'><span className='labor-nav-icon' aria-hidden='true'>⚙</span><span>개인설정</span><span className='labor-nav-arrow' aria-hidden='true'>›</span></Link>
  </nav><h1>{data?.manager?'구인·구직 관리':'구인·구직'}</h1><LaborNotifications refreshKey={reload}/>
  {error&&<p className='error' role='alert'>{error}</p>}{notice&&<aside role='status'>{notice}</aside>}
  {!data?<p>{error?'계정 확인을 완료하지 못했습니다.':'계정을 확인하는 중입니다.'} <Link href='/worker/account'>로그인 · 계정 확인</Link></p>:<>
   <div className='tabs'>{(data.manager?[['candidates','구직 시공자 찾기'],['mine','내 현장 구인하기'],['applications','내 현장 지원자 보기']]:[['jobs','구인하는 현장'],['matching','내 조건에 맞는 현장'],['seeking','구직하기'],['applications','지원·알림 현황']]).map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>{setTab(id);setPerson(null);setDetail(null);setTarget(null);setJob(null);setConsent(false);}}>{label}</button>)}</div>
   {(tab==='candidates'||tab==='jobs'||tab==='matching')&&<form onSubmit={e=>{e.preventDefault();setSearch(filters);setPage(0);}}><div className='pair'><label>지역<input placeholder='인천 서구' value={filters.region} onChange={e=>setFilters(f=>({...f,region:e.target.value}))}/></label><label>일할 날짜<input type='date' value={filters.date} onChange={e=>setFilters(f=>({...f,date:e.target.value}))}/></label></div>{data.manager&&<details><summary>일당·경력·전문 분야로 검색</summary>{[['wage','희망 일당 상한 (원)','number'],['experience','최소 경력 (년)','number'],['skill','전문 분야','text']].map(([key,label,type])=><label key={key}>{label}<input type={type} value={filters[key]} onChange={e=>setFilters(f=>({...f,[key]:e.target.value}))}/></label>)}</details>}<button className='primary'>검색</button><button type='button' onClick={()=>{setSearch({});setFilters({region:'',date:'',wage:'',experience:'',skill:''});setPage(0);}}>초기화</button></form>}
   {data.manager&&tab==='candidates'&&<><h2>구직 중인 시공자</h2><p>프로필을 확인하고 날짜가 맞는 내 현장을 보내주세요.</p>{!data.candidates.length&&<p>현재 조건에 맞는 구직 시공자가 없습니다.</p>}{data.candidates.map(p=><article key={p.user_id}><Profile p={p}/><button onClick={()=>setPerson(p)}>프로필 자세히 보기</button><button className='primary' onClick={()=>{setTarget(p);setPerson(null);setJob(null);setTab('mine');}}>구인하기</button></article>)}</>}
   {data.manager&&tab==='mine'&&<>
    <h2>{target?`${target.name}님에게 현장 보내기`:'내 현장 선택'}</h2><p>{target?'일할 수 있는 날짜와 일치하는 현장만 표시합니다.':'현장을 선택하면 지역·작업 내용·시공일을 자동으로 가져옵니다.'}</p>
    {target&&<button onClick={()=>{setTarget(null);setJob(null);}}>일반 구인 공고로 돌아가기</button>}
    {!sitesReady&&<p>내 현장을 불러오는 중…</p>}{sitesReady&&!candidateSites.length&&<p>{target?'시공자가 원하는 날짜와 맞는 현장이 없습니다.':'진행할 현장에 오늘 이후의 시공 날짜를 먼저 등록해주세요.'}</p>}

    <div className='site-choice-list' aria-label='구인할 내 현장 선택'>
      {candidateSites.map(s=>
        <SiteOption
          key={s.id}
          site={s}
          selected={job?.site_id===s.id}
          onSelect={()=>selectSite(s)}
          target={target}
        />
      )}
    </div>

    {job&&<form onSubmit={e=>{e.preventDefault();if(!job.work_dates.length){setError('시공 날짜를 선택해주세요.');return;}setConfirm({action:'job',job,recruitUserId:target?.user_id,title:target?`${target.name}님에게 현장 정보를 보내고 선택한 날짜에 배정할까요?`:'이 현장으로 구인 공고를 등록할까요?'});}}><fieldset disabled={busy}>
     <h2>{target?'보낼 현장 정보':'구인 공고 작성'}</h2>{field('현장 지역','region')}<label>작업 내용<textarea required value={job.work_content} onChange={e=>setJob(j=>({...j,work_content:e.target.value}))}/></label><h3>구인할 시공 날짜</h3><div className='date-options'>{allowed.map(d=><button key={d} type='button' aria-pressed={job.work_dates.includes(d)} onClick={()=>setJob(j=>({...j,work_dates:j.work_dates.includes(d)?j.work_dates.filter(x=>x!==d):[...j.work_dates,d].sort()}))}>{d}</button>)}</div><p>선택 {job.work_dates.length}일</p>
     {!target&&<label>필요 인원<div className='stepper'><button type='button' disabled={job.headcount<=1} onClick={()=>setJob(j=>({...j,headcount:Math.max(1,Number(j.headcount)-1)}))}>−</button><input aria-label='필요 인원' type='number' required min='1' max='100' value={job.headcount} onChange={e=>setJob(j=>({...j,headcount:e.target.value}))}/><span>명</span><button type='button' disabled={job.headcount>=100} onClick={()=>setJob(j=>({...j,headcount:Math.min(100,Number(j.headcount)+1)}))}>＋</button></div></label>}
     {field('일당 (원, 공란이면 협의)','daily_wage','number')}<div className='chips'>{[200000,250000,300000].map(n=><button type='button' key={n} onClick={()=>setJob(j=>({...j,daily_wage:n}))}>{n/10000}만원</button>)}</div>
     {!target&&<details><summary>추가 조건 · 공란은 생략</summary>{field('공고 제목','title')}<div className='pair'>{field('최소 나이','min_age','number')}{field('최대 나이','max_age','number')}</div>{field('시공자 활동 지역','worker_region')}{field('최소 경력 (년)','min_experience','number')}<label>전문 분야<input value={job.skills.join(', ')} onChange={e=>setJob(j=>({...j,skills:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)}))}/></label></details>}
     <small>공개 공고에는 상세 주소·고객 연락처·출입 정보를 입력하지 마세요.</small><button className='primary'>{target?'현장 정보 보내기':'구인하기'}</button>
    </fieldset></form>}
    {!target&&<><h2>내 현장 구인 공고</h2>{data.jobs.map(j=><article key={j.id}><Job j={j}/><p>{j.status==='open'?'모집 중':'구인 종료'} · 선택 {selectedCount(j.id)}/{j.headcount}명</p><button onClick={()=>{setJobFilter(j.id);setTab('applications');}}>지원자 보기</button>{j.status==='open'&&<><button className='primary' disabled={busy||selectedCount(j.id)<j.headcount} onClick={()=>setConfirm({action:'finish',jobId:j.id,title:'구인 완료하고 미선택 지원자에게 만료 알림을 보낼까요?'})}>구인 완료</button><button onClick={()=>setConfirm({action:'close',jobId:j.id,title:'필요 인원이 채워지기 전에 모집을 취소할까요?'})}>모집 취소</button></>}</article>)}</>}
   </>}
   {!data.manager&&(tab==='jobs'||tab==='matching')&&<><h2>{tab==='matching'?'내 프로필 조건에 맞는 현장':'구인하는 현장'}</h2>{tab==='matching'&&!data.profile&&<p><Link href='/worker/account'>내 프로필을 먼저 저장해주세요.</Link></p>}{!jobs.length&&<p>현재 조건에 맞는 구인 공고가 없습니다.</p>}{jobs.map(j=><article key={j.id}><Job j={j}/><button className='primary' onClick={()=>{setDetail(j);setConsent(false);}}>현장 자세히 보기</button></article>)}</>}
   {!data.manager&&tab==='seeking'&&<form onSubmit={e=>{e.preventDefault();act({action:'seeking',dates,consent:seekConsent});}}><fieldset disabled={busy}><h2>일할 수 있는 날을 선택하세요</h2>{data.profile?<Profile p={data.profile}/>:<p><Link href='/worker/account'>기본 프로필을 먼저 등록해주세요.</Link></p>}<WorkDatePicker value={dates} onChange={ds=>setDates(ds.filter(d=>d>=today()))} disabled={busy}/><label className='check toggle-row'><input type='checkbox' checked={seekConsent} onChange={e=>setSeekConsent(e.target.checked)}/>공개한 날짜와 희망 일당에 맞는 현장의 배정·연락처 공유에 동의합니다.</label><small>관리자가 현장 정보를 보내면 내 현장에 배정되고 구직 공고가 내려갑니다.</small><button className='primary' disabled={!data.profile||!dates.length||!seekConsent}>구직하기</button>{data.profile?.seeking&&<button type='button' onClick={()=>act({action:'stop_seeking'})}>구직 공고 내리기</button>}</fieldset></form>}
   {tab==='applications'&&<><h2>{data.manager?'내 현장 지원자':'내 지원·배정 현황'}</h2>{data.manager&&<label>현장별 보기<select value={jobFilter} onChange={e=>setJobFilter(e.target.value)}><option value=''>전체 현장</option>{data.jobs.map(j=><option key={j.id} value={j.id}>{j.region} · {j.title}</option>)}</select></label>}{!data.applications.filter(a=>!jobFilter||a.job_id===jobFilter).length&&<p>지원 내역이 없습니다.</p>}{data.applications.filter(a=>!jobFilter||a.job_id===jobFilter).map(a=>{const j=allJobs.find(j=>j.id===a.job_id);return <article key={a.id}><h3>{j?.region} · {status[a.status]}</h3>{data.manager?<>{a.profile&&<Profile p={a.profile}/>}<button onClick={()=>setPerson({...a.profile,application:a})}>프로필 자세히 보기</button>{a.status==='applied'&&<button className='primary' disabled={busy||selectedCount(a.job_id)>=j?.headcount} onClick={()=>setConfirm({action:'accept',jobId:a.job_id,userId:a.user_id,title:`${a.profile?.name||'이 시공자'}님을 내 현장에 구인할까요?`})}>구인하기</button>}</>:<>{j&&<Job j={j}/>} {a.status==='invited'&&<button onClick={()=>{setDetail(j);setConsent(false);}}>제안 확인 · 지원하기</button>}{a.status==='applied'&&<button onClick={()=>act({action:'withdraw',jobId:a.job_id})}>지원 취소</button>}{a.status==='accepted'&&j?.site_id&&<Link className='site-link' href={`/worker/site/${j.site_id}`}>내 현장 보기 ›</Link>}</>}</article>;})}
    {data.manager&&data.jobs.filter(j=>j.status==='open'&&(!jobFilter||j.id===jobFilter)).map(j=><aside key={j.id}><strong>{j.region} · 선택 {selectedCount(j.id)}/{j.headcount}명</strong><button className='primary' disabled={busy||selectedCount(j.id)<j.headcount} onClick={()=>setConfirm({action:'finish',jobId:j.id,title:'구인 완료하고 공고를 내릴까요? 미선택 지원자에게 만료 알림이 갑니다.'})}>구인 완료</button></aside>)}
   </>}
   {(person||detail)&&<div className='labor-overlay'><section className='labor-dialog' role='dialog' aria-modal='true' aria-label={person?'시공자 공개 프로필':'구인 현장 정보'}><button className='dialog-close' onClick={()=>{setPerson(null);setDetail(null);setConsent(false);}}>닫기 ×</button>{person?<><Profile p={person} detail/>{person.application?.phone&&<p><a href={`tel:${person.application.phone}`}>전화 {person.application.phone}</a></p>}{person.application?person.application.status==='applied'&&<button className='primary' onClick={()=>{setConfirm({action:'accept',jobId:person.application.job_id,userId:person.user_id,title:`${person.name}님을 구인할까요?`});setPerson(null);}}>구인하기</button>:<button className='primary' onClick={()=>{setTarget(person);setPerson(null);setJob(null);setTab('mine');}}>구인하기 · 현장 선택</button>}</>:<><Job j={detail} detail/>{data.applications.some(a=>a.job_id===detail.id&&!['invited','withdrawn'].includes(a.status))?<p>지원·알림 현황에서 확인해주세요.</p>:detail.status==='open'&&<><label className='check'><input type='checkbox' checked={consent} onChange={e=>setConsent(e.target.checked)}/>이 업체에 내 프로필·연락처를 공유합니다.</label><button className='primary' disabled={busy||!consent} onClick={()=>act({action:'apply',jobId:detail.id,share_phone:true})}>구직하기 · 지원하기</button></>}</>}</section></div>}
   {confirm&&<div className='labor-overlay'><section className='labor-dialog' role='dialog' aria-modal='true' aria-label='처리 확인'><h2>확인해주세요</h2><p>{confirm.title}</p>{error&&<p className='error'>{error}</p>}<button className='primary' disabled={busy} onClick={()=>act(confirm)}>{busy?'처리 중…':'확인'}</button><button disabled={busy} onClick={()=>setConfirm(null)}>취소</button></section></div>}
   {['candidates','jobs','matching'].includes(tab)&&<div className='pages'><button disabled={!page} onClick={()=>setPage(p=>p-1)}>이전</button><span>{page+1}페이지</span><button disabled={(data.manager?data.candidates:data.jobs).length<30} onClick={()=>setPage(p=>p+1)}>다음</button></div>}
  </>}
 </main>;
      }
