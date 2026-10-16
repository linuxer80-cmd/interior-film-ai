"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '../../lib/supabase';
import PublicAchievementBadge from '../components/PublicAchievementBadge';
import LaborNotifications from '../components/LaborNotifications';
import HomeReturnButton from '../components/HomeReturnButton';
import WorkDatePicker from '../admin/WorkDatePicker';
import '../components/laborMarket.css';

const blank={site_id:'',title:'인테리어필름 시공자 구인',region:'',work_content:'',work_dates:[],daily_wage:'',headcount:1,skills:[],min_experience:'',min_age:'',max_age:'',worker_region:''};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const money=n=>Number(n).toLocaleString('ko-KR');
const status={applied:'지원 완료',accepted:'구인 확정',invited:'현장 제안',expired:'지원 만료',rejected:'지원 만료',withdrawn:'지원 취소',unassigned:'배정 해제'};

function matches(j,p){
 if(!p)return false;
 return (!j.daily_wage||j.daily_wage>=p.daily_wage)&&(!j.min_experience||p.experience_years>=j.min_experience)
 &&(j.min_age==null||(p.age!=null&&p.age>=j.min_age))&&(j.max_age==null||(p.age!=null&&p.age<=j.max_age))
 &&(!j.worker_region||p.region?.includes(j.worker_region))
 &&(!p.available_dates?.length||j.work_dates?.every(d=>p.available_dates.includes(d)));
}

const canRecruit=p=>p?.seeking===true && p.available_dates?.some(d=>d>=today());

function Profile({p,detail=false}){
 const days=(p.available_dates||[]).filter(d=>d>=today());
 return <>
  <div className='person'>{p.photo_url?<img src={p.photo_url} alt='' width={64} height={64}/>:<div className='avatar-placeholder'>{p.name?.slice(0,1)||'?'}</div>}<div><h3>{p.name||'이름 미등록'}{p.age?` · ${p.age}세`:''}</h3><p>{p.region||'활동 지역 미등록'} · {p.experience_years==null?'경력 미등록':`경력 ${p.experience_years}년`}</p></div></div>
  <PublicAchievementBadge badge={p.featured_badge}/>
  {detail?<><dl className='profile-facts'>
   <div><dt>등록 일당</dt><dd>{p.daily_wage==null?'미등록':`${money(p.daily_wage)}원`}</dd></div>
   
   <div><dt>활동 지역</dt><dd>{p.region||'미등록'}</dd></div>
   <div><dt>경력</dt><dd>{p.experience_years==null?'미등록':`${p.experience_years}년`}</dd></div>
  </dl><h4>자기소개</h4><p className='multiline'>{p.introduction||'등록된 자기소개가 없습니다.'}</p><h4>일할 수 있는 날짜</h4>{!days.length&&<p>공개된 가능 일정이 없습니다. 지원 현장의 날짜를 확인해주세요.</p>}</>:<><p>등록 일당 <strong>{p.daily_wage==null?'미등록':`${money(p.daily_wage)}원`}</strong></p></>}
  <div className='chips'>{days.map(d=><span className='badge' key={d}>{d}</span>)}</div>
 </>;
}

function ApplicantDecision({application:a,job,selected=0,busy=false,onAccept}){
 const canAccept=a.status==='applied'&&job?.status==='open'&&selected<job.headcount;
 const message=a.status==='applied'?(job?.status!=='open'?'모집이 종료되어 확정할 수 없습니다.':selected>=job.headcount?'필요 인원이 모두 선택되었습니다. 구인 완료를 눌러주세요.':'프로필과 지원 일정을 확인한 뒤 확정해주세요.')
  :a.status==='accepted'?(a.assignment_status==='unassigned'?'확정 이력은 있지만 현재 배정된 날짜가 없습니다. 현장 배정을 확인해주세요.':a.assignment_status==='changed'?'확정 후 배정 일정이 변경되었습니다.':'이미 확정된 지원자입니다.')
  :a.status==='unassigned'?'배정이 해제되었습니다. 다시 모집하려면 시공자가 재지원해야 합니다.'
  :a.status==='invited'?'시공자가 제안을 확인하고 지원하면 확정할 수 있습니다.':'종료되거나 취소된 지원입니다. 다시 모집하려면 재지원이 필요합니다.';
 return <section className='applicant-decision'>
  <h4>지원 현장 · {job?.region||'지역 미등록'}</h4>
  <p>{job?.title||'공고 정보 없음'}</p>
  <div className='chips'>{job?.work_dates?.map(d=><span className='badge' key={d}>{d}</span>)}</div>
  <p>모집 기준 일당 {job?.daily_wage==null?'협의':`${money(job.daily_wage)}원`}</p>
  <p>적용 일당 {a.accepted_daily_wage!=null?`${money(a.accepted_daily_wage)}원 (확정)`:a.profile?.daily_wage?`${money(a.profile.daily_wage)}원`:'등록 필요'}</p><p role='status'>{message}</p>
  <div className='applicant-actions'>
   <button className='primary' disabled={busy||!canAccept} onClick={onAccept}>{a.status==='accepted'&&a.assignment_status!=='unassigned'?'확정 완료':'지원자 확정'}</button>
   {['accepted','unassigned'].includes(a.status)&&job?.site_id&&<Link className='site-link' href={`/admin?tab=sites&site=${job.site_id}`}>현장 배정 확인 ›</Link>}
  </div>
 </section>;
}

function Job({j,detail=false}){
 return <><h3>{j.title}</h3><p>{j.company_name} · {j.region}</p><PublicAchievementBadge badge={j.company_badge} company/>{detail&&<><p>관리자 {j.manager_name||'업체 관리자'}</p><p className='multiline'>{j.work_content}</p></>}<div className='chips'>{j.work_dates?.map(d=><span className='badge' key={d}>{d}</span>)}</div><p>{j.daily_wage?`모집 기준 일당 ${money(j.daily_wage)}원`:'모집 기준 일당 미지정'} · 모집 {j.headcount}명</p><small>실제 일당은 채용 시 시공자가 등록한 금액으로 적용됩니다.</small>{detail&&<>{j.min_experience!=null&&<p>경력 {j.min_experience}년 이상</p>}{(j.min_age!=null||j.max_age!=null)&&<p>나이 {j.min_age!=null?`${j.min_age}세 이상`:''} {j.max_age!=null?`${j.max_age}세 이하`:''}</p>}{j.worker_region&&<p>활동 지역 {j.worker_region}</p>}</>}</>;
}

function SiteOption({site,selected,onSelect,target}){
 const region=String(site.region||'').trim();
 const title=site.site_name|| (region&&!['null','undefined'].includes(region.toLowerCase())
   ?region:'지역 미등록 현장');

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
 const [filters,setFilters]=useState({name:'',region:'',date:'',wage:'',experience:'',skill:''}),[search,setSearch]=useState({}),[page,setPage]=useState(0);
 const [siteQuery,setSiteQuery]=useState(''),[siteFilter,setSiteFilter]=useState('scheduled'),[sitePage,setSitePage]=useState(0);
 const [sites,setSites]=useState([]),[sitesReady,setSitesReady]=useState(false),[job,setJob]=useState(null),[allowed,setAllowed]=useState([]),[target,setTarget]=useState(null);
 const [matchingOnly,setMatchingOnly]=useState(false);
 const [collaborationInvite,setCollaborationInvite]=useState('');
 const [person,setPerson]=useState(null),[detail,setDetail]=useState(null),[consent,setConsent]=useState(false),[dates,setDates]=useState([]),[seekConsent,setSeekConsent]=useState(false),[confirm,setConfirm]=useState(null),[jobFilter,setJobFilter]=useState('');

 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(timer);},[notice]);

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
   if(c.signal.aborted)return;setData(r);setTab(t=>{const tabs=r.manager?['candidates','mine','applications']:['jobs','seeking','applications'];const requested=t||params.get('tab')||(params.get('site')?'mine':params.get('job')?'applications':'');if(!r.manager&&requested==='matching'){setMatchingOnly(true);return 'jobs';}return tabs.includes(requested)?requested:tabs[0];});setDates(r.profile?.available_dates?.filter(d=>d>=today())||[]);
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
  setAllowed(ds);setJob({...blank,site_id:s.id,region:s.region,work_content:s.work_content,work_dates:ds,daily_wage:p?.daily_wage||''});setTab('mine');setDetail(null);setConsent(false);window.scrollTo({top:0,behavior:'smooth'});
 }

 async function act(body){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{await api('/api/labor-market',body);
   if(data?.manager && body.action==='accept'){
     // Hiring a worker for one site does not imply consent to a permanent company relationship.
     // Prepare an optional freelancer invitation for the manager to share.
     try{
       const invitation=await api('/api/direct-worker-invites',{action:'create',relationshipType:'freelancer'});
       if(invitation.code)setCollaborationInvite(window.location.origin+'/worker/direct-invite/'+invitation.code);
     }catch(error){console.warn('선택적 협력 초대 생성 실패:',error.message);}
   }
   setNotice(body.recruitUserId?'현장 정보를 보내고 시공자를 배정했습니다. 구직 공고는 내려갔습니다.':body.action==='finish'?'구인 완료했습니다. 미선택 지원자에게 종료 알림을 처리했습니다.':body.action==='close'?'모집을 종료했습니다. 이미 확정된 현장 배정은 유지됩니다.':body.action==='accept'?'시공자를 내 현장에 배정했습니다. 필요한 인원을 선택한 뒤 구인 완료를 눌러주세요.':body.action==='seeking'?'선택한 날짜의 구직 공고가 관리자들에게 공개되었습니다.':'처리했습니다.');if(body.action==='job'){setJob(null);setTarget(null);}setConfirm(null);setDetail(null);setPerson(null);setConsent(false);setReload(n=>n+1);}catch(e){setError(e.message);}finally{setBusy(false);}
 }

 const field=(label,key,type='text')=><label>{label}<input type={type} value={job?.[key]??''} min={type==='number'?0:undefined} onChange={e=>setJob(j=>({...j,[key]:e.target.value}))}/></label>;
 const allJobs=[...(data?.jobs||[]),...(data?.applicationJobs||[])];
 const selectedCount=id=>data?.applications.filter(a=>a.job_id===id&&a.status==='accepted'&&a.assignment_status!=='unassigned').length||0;
 const applicationLabel=a=>a.status==='accepted'?(a.assignment_status==='unassigned'?'배정 해제':a.assignment_status==='changed'?'배정 일정 변경':'구인 확정'):status[a.status];
 const candidateSites=target?sites.filter(s=>s.work_dates.some(d=>target.available_dates?.includes(d))):sites;
 const filteredSites=candidateSites.filter(s=>(siteFilter==='all'||s.status===siteFilter)&&`${s.site_name||''} ${s.region||''} ${s.work_content||''}`.toLowerCase().includes(siteQuery.trim().toLowerCase())).sort((a,b)=>(a.work_dates[0]||'').localeCompare(b.work_dates[0]||''));
 const sitePages=Math.max(1,Math.ceil(filteredSites.length/5));
 const currentSitePage=Math.min(sitePage,sitePages-1);
 const chosenSite=sites.find(s=>s.id===job?.site_id);
 const jobs=data?.jobs.filter(j=>j.status==='open'&&(tab!=='matching'||matches(j,data.profile)))||[];

 return <main className='labor-shell jobs-compact'>
  <nav className='labor-navigation' aria-label='구인·구직 화면 이동'>
   <HomeReturnButton role={data?.manager?'admin':'worker'} />
  </nav><h1>{data?.manager?'구인·구직 관리':'구인·구직'}</h1><LaborNotifications refreshKey={reload}/>
  {error&&<p className='error' role='alert'>{error}</p>}{notice&&<aside role='status'>{notice}</aside>}
  {data?.manager && collaborationInvite && <aside role='status' style={{padding:12,border:'1px solid #cbd5e1',borderRadius:12,marginBottom:12}}>
    <strong>현장 배정 완료 · 협력 관계 연결 (선택)</strong>
    <p>현장 채용과 업체 소속 연결은 별개입니다. 아래 초대링크를 전달하면 시공자가 수락한 뒤 협력 프리랜서로 연결됩니다.</p>
    <input aria-label='협력 초대링크' readOnly value={collaborationInvite} onFocus={e=>e.target.select()} style={{width:'100%',padding:10,boxSizing:'border-box'}}/>
    <button type='button' onClick={async()=>{try{await navigator.clipboard.writeText(collaborationInvite);setNotice('협력 초대링크를 복사했습니다.');}catch{setNotice('링크를 길게 눌러 복사해주세요.');}}}>협력 초대링크 복사</button>
    <button type='button' onClick={()=>setCollaborationInvite('')}>닫기</button>
  </aside>}
  {!data?<p>{error?'계정 확인을 완료하지 못했습니다.':'계정을 확인하는 중입니다.'} <Link href='/worker/account'>로그인 · 계정 확인</Link></p>:<>
   <div className='tabs'>{(data.manager?[['candidates','시공자 찾기'],['mine','구인하기'],['applications','지원자']]:[['jobs','일자리 찾기'],['seeking','구직 등록'],['applications','지원 현황']]).map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>{setTab(id);setPage(0);setJobFilter('');setPerson(null);setDetail(null);setTarget(null);setJob(null);setConsent(false);}}>{label}</button>)}</div>
   {(tab==='candidates'||tab==='jobs'||tab==='matching')&&<form onSubmit={e=>{e.preventDefault();setSearch(filters);setPage(0);}}>{data.manager&&<label>시공자 이름<input type='search' placeholder='이름으로 검색' maxLength={100} value={filters.name} onChange={e=>setFilters(f=>({...f,name:e.target.value}))}/></label>}<div className='pair'><label>지역<input placeholder='인천 서구' value={filters.region} onChange={e=>setFilters(f=>({...f,region:e.target.value}))}/></label><label>일할 날짜<input type='date' value={filters.date} onChange={e=>setFilters(f=>({...f,date:e.target.value}))}/></label></div>{data.manager&&<details><summary>일당·경력으로 검색</summary>{[['wage','등록 일당 상한 (원)','number'],['experience','최소 경력 (년)','number']].map(([key,label,type])=><label key={key}>{label}<input type={type} value={filters[key]} onChange={e=>setFilters(f=>({...f,[key]:e.target.value}))}/></label>)}</details>}<button className='primary'>검색</button><button type='button' onClick={()=>{setSearch({});setFilters({name:'',region:'',date:'',wage:'',experience:'',skill:''});setPage(0);}}>초기화</button></form>}
   {data.manager&&tab==='candidates'&&<><h2>공개 프로필 시공자</h2><p>구직 여부와 관계없이 프로필 공개에 동의한 시공자를 검색합니다. 일할 날짜를 선택하면 해당 날짜를 공개한 시공자만 표시됩니다.</p>{!data.candidates.length&&<p>조건에 맞는 공개 프로필이 없습니다. 이름·지역·날짜 조건을 변경해주세요.</p>}{data.candidates.map(p=><article key={p.user_id}><Profile p={p}/><p className='muted'>{canRecruit(p)?'구직 중 · 현장 배정 가능':'프로필 공개 · 현재 구직 일정 없음'}</p><button onClick={()=>setPerson(p)}>프로필 자세히 보기</button><button className='primary' disabled={!canRecruit(p)} onClick={()=>{setTarget(p);setPerson(null);setJob(null);setTab('mine');}}>구인하기</button></article>)}</>}
   {data.manager&&tab==='mine'&&<>
    {!job&&<>
    <h2>{target?`${target.name}님에게 현장 보내기`:'어느 현장에서 구인할까요?'}</h2>
    <p className='muted'>{target?'시공자가 일할 수 있는 날짜와 맞는 현장입니다.':'현장을 선택하면 시공 정보를 자동으로 가져와요.'}</p>
    {target&&<button onClick={()=>{setTarget(null);setJob(null);}}>일반 구인 공고로 돌아가기</button>}
    <label className='site-search'>현장 검색<input type='search' placeholder='현장명 · 지역 검색' value={siteQuery} onChange={e=>{setSiteQuery(e.target.value);setSitePage(0);}}/></label>
    <div className='chips' role='group' aria-label='현장 상태 필터'>{[['scheduled','시공 예정'],['in_progress','진행 중'],['all','전체']].map(([value,label])=><button key={value} aria-pressed={siteFilter===value} onClick={()=>{setSiteFilter(value);setSitePage(0);}}>{label}</button>)}</div>
    <p className='muted'>{filteredSites.length}개 현장 · 가까운 시공일순</p>
    {!sitesReady&&<p>내 현장을 불러오는 중…</p>}
    {sitesReady&&!filteredSites.length&&<p>조건에 맞는 현장이 없습니다. 검색어나 상태 필터를 바꿔주세요. 오늘 이후 시공일이 있는 현장만 구인할 수 있습니다.</p>}
    <div className='site-choice-list' aria-label='구인할 내 현장 선택'>
      {filteredSites.slice(currentSitePage*5,currentSitePage*5+5).map(s=><SiteOption key={s.id} site={s} selected={false} onSelect={()=>selectSite(s)} target={target}/>)}
    </div>
    {sitePages>1&&<div className='pages'><button disabled={currentSitePage===0} onClick={()=>setSitePage(currentSitePage-1)}>이전</button><span>{currentSitePage+1} / {sitePages}</span><button disabled={currentSitePage>=sitePages-1} onClick={()=>setSitePage(currentSitePage+1)}>다음</button></div>}
    </>}
    {job&&<form className='recruit-form' onSubmit={e=>{e.preventDefault();if(!job.work_dates.length){setError('시공 날짜를 선택해주세요.');return;}setConfirm({action:'job',job,recruitUserId:target?.user_id,expectedWage:target?Number(target.daily_wage):undefined,title:target?`${target.name}님에게 현장 정보를 보내고 선택한 날짜에 배정할까요?`:'이 현장으로 구인 공고를 등록할까요?'});}}><fieldset disabled={busy}>
     <div className='recruit-heading'><h2>{target?'보낼 현장 정보':'구인 내용 입력'}</h2><span>2 / 2</span></div><div className='selected-site'><div><strong>{chosenSite?.site_name||job.region}</strong><small>{job.region}</small></div><button type='button' onClick={()=>setJob(null)}>현장 변경</button></div><details><summary>현장 정보 확인 · 수정</summary>{field('현장 지역','region')}<label>작업 내용<textarea required onInvalid={e=>{e.target.closest('details').open=true;}} value={job.work_content} onChange={e=>setJob(j=>({...j,work_content:e.target.value}))}/></label></details><h3>구인할 시공 날짜</h3><div className='date-options'>{allowed.map(d=><button key={d} type='button' aria-pressed={job.work_dates.includes(d)} onClick={()=>setJob(j=>({...j,work_dates:j.work_dates.includes(d)?j.work_dates.filter(x=>x!==d):[...j.work_dates,d].sort()}))}>{d}</button>)}</div><p>선택 {job.work_dates.length}일</p>
     {!target&&<label>필요 인원<div className='stepper'><button type='button' disabled={job.headcount<=1} onClick={()=>setJob(j=>({...j,headcount:Math.max(1,Number(j.headcount)-1)}))}>−</button><input aria-label='필요 인원' type='number' required min='1' max='100' value={job.headcount} onChange={e=>setJob(j=>({...j,headcount:e.target.value}))}/><span>명</span><button type='button' disabled={job.headcount>=100} onClick={()=>setJob(j=>({...j,headcount:Math.min(100,Number(j.headcount)+1)}))}>＋</button></div></label>}
     {field('희망 일당 수준 (원, 선택)','daily_wage','number')}<small>모집 기준 금액입니다. 실제 확정 일당은 시공자가 등록한 금액을 적용합니다.</small><div className='chips'>{[200000,250000,300000].map(n=><button type='button' key={n} onClick={()=>setJob(j=>({...j,daily_wage:n}))}>{n/10000}만원</button>)}</div>
     {!target&&<details><summary>추가 조건 · 공란은 생략</summary>{field('공고 제목','title')}<div className='pair'>{field('최소 나이','min_age','number')}{field('최대 나이','max_age','number')}</div>{field('시공자 활동 지역','worker_region')}{field('최소 경력 (년)','min_experience','number')}</details>}
     <small>공개 공고에는 상세 주소·고객 연락처·출입 정보를 입력하지 마세요.</small><div className='recruit-save'><small>{job.work_dates.length}일 · {target?'1':job.headcount}명 모집</small><button className='primary'>{target?'현장 정보 보내기':'구인 등록'}</button></div>
    </fieldset></form>}
    {!target&&!job&&<details className='my-job-posts'><summary>내 구인 공고 확인</summary>{data.jobs.map(j=><article key={j.id}><Job j={j}/><p>{j.status==='open'?'모집 중':'구인 종료'} · 선택 {selectedCount(j.id)}/{j.headcount}명</p><button onClick={()=>{setJobFilter(j.id);setTab('applications');}}>지원자 보기</button>{j.status==='open'&&<><button className='primary' disabled={busy} onClick={()=>setConfirm({action:selectedCount(j.id)>=j.headcount?'finish':'close',jobId:j.id,title:selectedCount(j.id)>=j.headcount?'구인을 완료하고 미선택 지원자에게 종료 알림을 보낼까요?':'모집 인원이 남아 있습니다. 확정된 시공자는 유지하고 이 공고의 모집을 종료할까요?'})}>구인 완료</button><button onClick={()=>setConfirm({action:'close',jobId:j.id,title:'필요 인원이 채워지기 전에 모집을 취소할까요?'})}>모집 취소</button></>}</article>)}<div className='pages'><button disabled={!page} onClick={()=>setPage(p=>p-1)}>이전 공고</button><span>{page+1}페이지</span><button disabled={data.jobs.length<30} onClick={()=>setPage(p=>p+1)}>다음 공고</button></div></details>}
   </>}
   {!data.manager&&(tab==='jobs'||tab==='matching')&&<><h2>일자리 찾기</h2><div className='chips'><button type='button' aria-pressed={!matchingOnly} onClick={()=>setMatchingOnly(false)}>전체 현장</button><button type='button' aria-pressed={matchingOnly} onClick={()=>setMatchingOnly(true)}>내 조건에 맞는 현장</button></div>{matchingOnly&&!data.profile&&<p><Link href='/worker/account'>내 프로필을 먼저 저장해주세요.</Link></p>}{!(matchingOnly?jobs.filter(j=>matches(j,data.profile)):jobs).length&&<p>현재 조건에 맞는 구인 공고가 없습니다.</p>}{(matchingOnly?jobs.filter(j=>matches(j,data.profile)):jobs).map(j=><article key={j.id}><Job j={j}/><button className='primary' onClick={()=>{setDetail(j);setConsent(false);}}>현장 자세히 보기</button></article>)}</>}
   {!data.manager&&tab==='seeking'&&<form onSubmit={e=>{e.preventDefault();act({action:'seeking',dates,consent:seekConsent});}}><fieldset disabled={busy}><h2>일할 수 있는 날을 선택하세요</h2>{data.profile?<Profile p={data.profile}/>:<p><Link href='/worker/account'>기본 프로필을 먼저 등록해주세요.</Link></p>}<WorkDatePicker value={dates} onChange={ds=>setDates(ds.filter(d=>d>=today()))} disabled={busy}/><label className='check toggle-row'><input type='checkbox' checked={seekConsent} onChange={e=>setSeekConsent(e.target.checked)}/>공개한 날짜와 등록 일당에 맞는 현장의 배정·연락처 공유에 동의합니다.</label><small>관리자가 현장 정보를 보내면 내 현장에 배정되고 구직 공고가 내려갑니다.</small><button className='primary' disabled={!data.profile||!dates.length||!seekConsent}>구직하기</button>{data.profile?.seeking&&<button type='button' onClick={()=>act({action:'stop_seeking'})}>구직 공고 내리기</button>}</fieldset></form>}
   {tab==='applications'&&<><h2>{data.manager?'내 현장 지원자':'내 지원·배정 현황'}</h2>{data.manager&&<label>현장별 보기<select value={jobFilter} onChange={e=>setJobFilter(e.target.value)}><option value=''>전체 현장</option>{data.jobs.map(j=><option key={j.id} value={j.id}>{j.region} · {j.title}</option>)}</select></label>}{!data.applications.filter(a=>!jobFilter||a.job_id===jobFilter).length&&<p>지원 내역이 없습니다.</p>}{data.applications.filter(a=>!jobFilter||a.job_id===jobFilter).map(a=>{const j=allJobs.find(j=>j.id===a.job_id);return <article key={a.id}><h3>{j?.region} · {applicationLabel(a)}</h3>{a.accepted_daily_wage!=null&&<p>확정 일당 <strong>{money(a.accepted_daily_wage)}원</strong></p>}{data.manager?<>{a.profile&&<Profile p={a.profile}/>}<button onClick={()=>setPerson({...a.profile,application:a})}>프로필 자세히 보기</button>{a.status==='applied'&&<button className='primary' disabled={busy||selectedCount(a.job_id)>=j?.headcount} onClick={()=>setConfirm({action:'accept',jobId:a.job_id,userId:a.user_id,expectedWage:Number(a.profile?.daily_wage),title:`${a.profile?.name||'이 시공자'}님을 내 현장에 구인할까요?`})}>지원자 확정</button>}</>:<>{j&&<Job j={j}/>} {a.status==='invited'&&<button onClick={()=>{setDetail(j);setConsent(false);}}>제안 확인 · 지원하기</button>}{a.status==='accepted'&&a.assignment_status!=='assigned'&&<p role='status'>{a.has_site_access?'공고 날짜와 현재 배정이 다릅니다. 내 현장에서 변경된 일정을 확인해주세요.':'현재 배정된 날짜가 없습니다. 업체에 일정을 확인해주세요.'}</p>}{a.status==='applied'&&<button onClick={()=>act({action:'withdraw',jobId:a.job_id})}>지원 취소</button>}{a.status==='accepted'&&a.has_site_access&&j?.site_id&&<Link className='site-link' href={`/worker/site/${j.site_id}`}>내 현장 보기 ›</Link>}</>}</article>;})}
    {data.manager&&data.jobs.filter(j=>j.status==='open'&&(!jobFilter||j.id===jobFilter)).map(j=><aside key={j.id}>
     <details className='recruitment-status'>
       <summary style={{cursor:'pointer',fontWeight:800,padding:'12px 0'}}>
         {j.region} · 확정 {selectedCount(j.id)}/{j.headcount}명 · 지원 {data.applications.filter(a=>a.job_id===j.id&&a.status==='applied').length}명
         <span style={{marginLeft:8,color:'#64748b',fontSize:13}}>구인 상황 보기</span>
       </summary>
       <div style={{padding:'10px 0',display:'grid',gap:10}}>
         <p style={{margin:0}}>모집 {j.headcount}명 · 확정 {selectedCount(j.id)}명 · 남은 인원 {Math.max(0,j.headcount-selectedCount(j.id))}명</p>
         {data.applications.filter(a=>a.job_id===j.id).length===0?<p>아직 지원자가 없습니다.</p>:data.applications.filter(a=>a.job_id===j.id).map(a=><div key={a.id} style={{border:'1px solid #e2e8f0',borderRadius:12,padding:12}}>
           <strong>{a.profile?.name||'지원자'} · {applicationLabel(a)}</strong><PublicAchievementBadge badge={a.profile?.featured_badge}/>
           {a.accepted_daily_wage!=null&&<p>확정 일당 {money(a.accepted_daily_wage)}원</p>}
           <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
             {a.profile&&<button type='button' onClick={()=>setPerson({...a.profile,application:a})}>프로필 보기</button>}
             {a.status==='applied'&&<button type='button' className='primary' disabled={busy||selectedCount(j.id)>=j.headcount||!a.profile?.daily_wage} onClick={()=>setConfirm({action:'accept',jobId:j.id,userId:a.user_id,expectedWage:Number(a.profile?.daily_wage),title:`${a.profile?.name||'지원자'}님을 현장에 확정할까요?`})}>지원자 확정</button>}
           </div>
         </div>)}
       </div>
     </details><button className='primary' disabled={busy} onClick={()=>setConfirm({action:selectedCount(j.id)>=j.headcount?'finish':'close',jobId:j.id,title:selectedCount(j.id)>=j.headcount?'구인 완료하고 공고를 내릴까요? 미선택 지원자에게 종료 알림이 갑니다.':'모집 인원이 남아 있습니다. 확정된 시공자는 유지하고 공고의 모집을 종료할까요?'})}>구인 완료</button></aside>)}
   </>}
   {(person||detail)&&<div className='labor-overlay'><section className='labor-dialog' role='dialog' aria-modal='true' aria-label={person?'시공자 공개 프로필':'구인 현장 정보'}><button className='dialog-close' onClick={()=>{setPerson(null);setDetail(null);setConsent(false);}}>닫기 ×</button>{person?<><Profile p={person} detail/>{person.application?.phone&&<p><a href={`tel:${person.application.phone}`}>전화 {person.application.phone}</a></p>}{person.application?<ApplicantDecision application={person.application} job={allJobs.find(j=>j.id===person.application.job_id)} selected={selectedCount(person.application.job_id)} busy={busy} onAccept={()=>{setConfirm({action:'accept',jobId:person.application.job_id,userId:person.application.user_id,expectedWage:Number(person.daily_wage),title:`${person.name||'이 시공자'}님을 지원 현장에 확정할까요?`});setPerson(null);}}/>:<button className='primary' disabled={!canRecruit(person)} onClick={()=>{setTarget(person);setPerson(null);setJob(null);setTab('mine');}}>구인하기 · 현장 선택</button>}</>:<><Job j={detail} detail/>{error&&<p className='error' role='alert'>{error}</p>}{data.applications.some(a=>a.job_id===detail.id&&!['invited','withdrawn','unassigned'].includes(a.status))?<p>지원·알림 현황에서 확인해주세요.</p>:detail.status==='open'&&(!data.profile?<p><Link className='site-link' href='/worker/account'>지원하려면 기본 프로필을 먼저 저장해주세요 ›</Link></p>:<><label className='check'><input type='checkbox' checked={consent} onChange={e=>setConsent(e.target.checked)}/>지원한 업체에만 프로필·연락처를 공유합니다. 다른 업체의 소속 직원이라도 외부 현장에는 프리랜서로 지원하며, 기존 소속과 일당은 유지됩니다.</label><button className='primary' disabled={busy||!consent||!data.profile} onClick={()=>act({action:'apply',jobId:detail.id,share_phone:true})}>구직하기 · 지원하기</button></>)}</>}</section></div>}
   {confirm&&<div className='labor-overlay'><section className='labor-dialog' role='dialog' aria-modal='true' aria-label='처리 확인'><h2>확인해주세요</h2><p>{confirm.title}</p>{confirm.expectedWage!=null&&<p><strong>적용 일당 {money(confirm.expectedWage)}원</strong><br/>시공자 등록 금액이며, 팀장 수당은 업체 설정에 따라 별도 적용됩니다. 확정 후 등록 일당이 바뀌어도 이 배정 금액은 유지됩니다.</p>}{error&&<p className='error'>{error}</p>}<button className='primary' disabled={busy} onClick={()=>act(confirm)}>{busy?'처리 중…':'확인'}</button><button disabled={busy} onClick={()=>setConfirm(null)}>취소</button></section></div>}
   {(['candidates','jobs','matching'].includes(tab)||(data.manager&&!job&&!target&&['applications'].includes(tab)))&&<div className='pages'><button disabled={!page} onClick={()=>{setPage(p=>p-1);setJobFilter('');}}>이전</button><span>{page+1}페이지</span><button disabled={(data.manager&&tab==='candidates'?data.candidates:data.jobs).length<30} onClick={()=>{setPage(p=>p+1);setJobFilter('');}}>다음</button></div>}
  </>}
 </main>;
      }

