"use client";
import {useEffect,useRef,useState} from 'react';
import {useDirectory,directoryCard as card,directoryButton as button,directoryInput as input,connectionLabel} from '../../components/WorkerDirectoryClient';
import {pendingConnection} from '../../../lib/workerDirectory.mjs';
import PublicAchievementBadge from '../../components/PublicAchievementBadge';

export default function WorkerDirectoryPage(){
  const {user,ready,api}=useDirectory();
  return <main style={{maxWidth:900,margin:'auto',padding:20}}><a href='/admin' data-ui-link="action">← 관리자 홈</a><h1>공개 시공자 검색</h1><p>프로필 공개에 동의한 시공자를 찾아 업체 연결을 요청하세요. 시공자가 수락해야 연결됩니다.</p>{!ready?<p>불러오는 중…</p>:!user?<p>관리자 계정으로 로그인해주세요.</p>:<Directory key={user} api={api}/>}</main>;
}
function Directory({api}) {
  const [filters,setFilters]=useState({query:'',region:'',skill:'',experience:'0'}),[applied,setApplied]=useState({query:'',region:'',skill:'',experience:'0'});
  const [page,setPage]=useState(0),[profiles,setProfiles]=useState([]),[sent,setSent]=useState([]),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[version,setVersion]=useState(0);
  const live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  useEffect(()=>{let current=true;setBusy(true);setError('');Promise.all([api('?'+new URLSearchParams({...applied,mode:'search',page:String(page)})),api('?mode=sent')]).then(([a,b])=>{if(current){setProfiles(a.profiles);setMore(a.hasMore);setSent(b.requests);}}).catch(e=>{if(current){setError(e.message);setProfiles([]);setSent([]);}}).finally(()=>{if(current)setBusy(false);});return()=>{current=false;};},[api,applied,page,version]);
  const act=async body=>{setBusy(true);setError('');setNotice('');try{await api('',body);if(live.current){setNotice(body.action==='request'?'연결 요청을 보냈습니다. 시공자 수락을 기다려주세요.':'요청을 취소했습니다.');setVersion(v=>v+1);}}catch(e){if(live.current)setError(e.message);}finally{if(live.current)setBusy(false);}};
  return <>
    <form style={card} onSubmit={e=>{e.preventDefault();setPage(0);setApplied({...filters});}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
      {[['query','이름',60],['region','활동 지역',100],['skill','전문 분야',40]].map(([key,label,max])=><label key={key}>{label}<input style={input} maxLength={max} value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value})}/></label>)}
      <label>최소 경력 (년)<input style={input} type='number' min='0' max='70' step='1' value={filters.experience} onChange={e=>setFilters({...filters,experience:e.target.value})}/></label></div>
      <button style={{...button,marginTop:12}} disabled={busy}>검색</button>
    </form>
    {error&&<p role='alert'>{error}</p>}{notice&&<p role='status'>{notice}</p>}{busy&&<p role='status'>처리 중…</p>}
    {!busy&&!error&&!profiles.length&&<p>조건에 맞는 공개 시공자가 없습니다.</p>}
    {profiles.map(row=><Candidate key={row.user_id} row={row} busy={busy} act={act}/>)}
    <div style={{display:'flex',gap:12,alignItems:'center'}}><button style={button} disabled={busy||page===0} onClick={()=>setPage(p=>p-1)}>이전</button><span>{page+1}페이지</span><button style={button} disabled={busy||!more||page>=1000} onClick={()=>setPage(p=>p+1)}>다음</button></div>
    <h2>보낸 연결 요청</h2><p>요청은 7일 동안 유효합니다. 거절된 요청은 7일 뒤 다시 보낼 수 있습니다.</p>
    {!sent.length&&<p>보낸 요청이 없습니다.</p>}
    {sent.map(row=><article style={card} key={row.id}><strong>{row.name}</strong><p>{row.relationship_type==='employee'?'직원':'프리랜서'} · {connectionLabel(row)}</p>{pendingConnection(row)&&<button style={button} disabled={busy} onClick={()=>act({action:'cancel',id:row.id,revision:row.revision})}>요청 취소</button>}</article>)}
  </>;
}
function Candidate({row,busy,act}) {
  const [type,setType]=useState('freelancer'),[message,setMessage]=useState(''),[imageError,setImageError]=useState(false);
  useEffect(()=>setImageError(false),[row.photo_url]);
  return <article style={card}>
    <div style={{display:'flex',gap:16,alignItems:'center'}}>{row.photo_url&&!imageError?<img src={row.photo_url} alt={`${row.name} 프로필`} width={72} height={72} style={{borderRadius:'50%',objectFit:'cover'}} onError={()=>setImageError(true)}/>:<span aria-hidden='true' style={{fontSize:40}}>👷</span>}<div><h2>{row.name}</h2><p>{row.region||'지역 미등록'} · 경력 {row.experience_years??0}년</p></div></div>
    <p>{(row.skills||[]).join(' · ')||'전문 분야 미등록'}</p><p>희망 일당 {Number(row.daily_wage||0).toLocaleString('ko-KR')}원</p>{row.introduction&&<p style={{whiteSpace:'pre-wrap'}}>{row.introduction}</p>}
    <PublicAchievementBadge badge={row.featured_badge}/>
    {row.connected?<strong>이미 연결된 시공자</strong>:row.request_status==='pending'?<strong>연결 요청 수락 대기 중</strong>:<form onSubmit={e=>{e.preventDefault();act({action:'request',target:row.user_id,relationshipType:type,message});}}>
      <label>연결 유형<select style={input} value={type} onChange={e=>setType(e.target.value)}><option value='freelancer'>프리랜서</option><option value='employee'>직원</option></select></label>
      <label>요청 메시지 (선택)<textarea style={input} maxLength={300} rows={2} value={message} onChange={e=>setMessage(e.target.value)} placeholder='업체 소개와 함께 연결을 요청하세요.'/></label>
      <button style={button} disabled={busy}>업체 연결 요청 보내기</button>
    </form>}
  </article>;
}


