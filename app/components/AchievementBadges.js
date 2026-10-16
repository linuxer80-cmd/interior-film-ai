"use client";
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabase';
import {badgeProgress,nextBadge,badgeUnit} from '../../lib/achievements.mjs';
import './achievementBadges.css';

export function BadgeArt({badge,locked=false,size=100}){
 const [broken,setBroken]=useState(false);
 useEffect(()=>setBroken(false),[badge.image_url]);
 const index=Number.isInteger(badge.art_key)?badge.art_key:0;
 const x=index%2?530:145,y=[120,455,805,1140][Math.floor(index/2)]||120;
 return <span className={`achievement-art ${locked?'is-locked':''}`} style={{width:size,height:size}}>
  {badge.image_url&&!broken?<img src={badge.image_url} alt='' onError={()=>setBroken(true)}/>:<svg viewBox={`${x} ${y} 360 300`} aria-hidden='true'><image href='/badges/launch-sheet.png' width='1024' height='1536'/></svg>}
 </span>;
}
export function useAchievementApi(){
 const [user,setUser]=useState(null),[ready,setReady]=useState(false);const actor=useRef(null);
 useEffect(()=>{let live=true;let authChanged=false;
  const set=s=>{if(live){actor.current=s?.user?.id||null;setUser(actor.current);setReady(true);}};
  supabase.auth.getSession().then(({data})=>{if(!authChanged)set(data.session);});
  const {data}=supabase.auth.onAuthStateChange((_e,s)=>{authChanged=true;set(s);});
  return()=>{live=false;actor.current=null;data.subscription.unsubscribe();};
 },[]);
 async function api(path,body){
  const expected=actor.current;const {data}=await supabase.auth.getSession();
  if(!expected||data.session?.user?.id!==expected)throw Error('로그인 후 이용해주세요.');
  const multipart=body instanceof FormData;
  const response=await fetch(path,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${data.session.access_token}`,...(body&&!multipart?{'Content-Type':'application/json'}:{})},...(body?{body:multipart?body:JSON.stringify(body)}:{})});
  const result=await response.json();
  if(actor.current!==expected)throw Error('계정이 변경되었습니다. 새로고침해주세요.');
  if(!response.ok)throw Error(result.error||'처리하지 못했습니다.');return result;
 }
 return {user,ready,api};
}
export default function AchievementBadges({scope='worker',compact=false}){
 const {user,ready,api}=useAchievementApi();
 if(!ready)return compact?null:<p>로그인 확인 중…</p>;
 if(!user)return compact?null:<p>로그인 후 내 업적을 볼 수 있습니다.</p>;
 return <BadgeCollection key={`${user}:${scope}`} scope={scope} compact={compact} api={api}/>;
}
function BadgeCollection({scope,compact,api}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[filter,setFilter]=useState('all'),[distanceMessage,setDistanceMessage]=useState('');
 const alive=useRef(true),apiRef=useRef(api);apiRef.current=api;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{let live=true;setError('');apiRef.current('/api/achievements?scope='+scope).then(r=>{if(live)setData(r);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[scope,reload]);
 const calculateDistance=async()=>{setBusy(true);setError('');setDistanceMessage('');try{const r=await apiRef.current('/api/achievements/commute',{});if(alive.current){setDistanceMessage(r.message);setReload(v=>v+1);}}catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(false);}};
 const act=async body=>{setBusy(true);setError('');try{await apiRef.current('/api/achievements',{...body,scope});if(alive.current){setData(d=>body.action==='seen'?{...d,badges:d.badges.map(b=>body.badge_ids.includes(b.id)?{...b,unseen:false}:b)}:{...d,featured:body.badge_id});}}catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(false);}};
 if(!data){if(compact)return null;return <div className='achievement-panel'>{error?<><p role='alert'>{error}</p><button onClick={()=>setReload(v=>v+1)}>다시 확인</button></>:<p>업적을 확인하는 중…</p>}</div>;}
 const earned=data.badges.filter(b=>b.earned_at),next=nextBadge(data.badges),featured=earned.find(b=>b.id===data.featured),unseen=data.badges.filter(b=>b.unseen);
 const celebration=unseen.length>0&&<aside className='achievement-celebration' aria-label='새 업적 획득'>
  <BadgeArt badge={unseen[0]} size={100}/><div><small>새 업적을 달성했어요!</small><strong>{unseen[0].title}{unseen.length>1?` 외 ${unseen.length-1}개`:''}</strong><p>현장의 기록이 나의 성취로 쌓입니다.</p><button disabled={busy} onClick={()=>act({action:'seen',badge_ids:unseen.map(b=>b.id)})}>확인 · 배지 보관함에 간직하기</button></div>
 </aside>;
 if(compact)return <section className='achievement-shell'>
  <a className='achievement-home' href={`/achievements?scope=${scope}`}>
   {(featured||next||earned[0])&&<BadgeArt badge={featured||next||earned[0]} locked={!featured&&Boolean(next)} size={82}/>}
   <span><strong>{scope==='owner'?'우리 업체 업적':'내 업적'} · 배지 {earned.length}개</strong><small>{next?`${next.title}까지 ${Math.max(0,next.target-next.progress).toLocaleString()}${badgeUnit(next.metric)} 남았어요`:'새로운 성취를 배지 보관함에서 확인하세요'}</small>{next&&<progress aria-label={`${next.title} 진행률`} value={badgeProgress(next)} max='100'/>}</span><span aria-hidden='true'>›</span>
  </a>{celebration}{error&&<p role='alert'>{error}</p>}
 </section>;
 return <section className='achievement-shell'>
  <div className='achievement-panel achievement-summary'><span className='achievement-kicker'>현장의 기록이 나의 성취로</span><h1>{scope==='owner'?'우리 업체 업적':'내 업적'}</h1><p>획득한 배지 <b>{earned.length}개</b> · 도전 중 {data.badges.filter(b=>b.active&&!b.earned_at).length}개</p><p>앱 활동 기록에 따른 배지이며 시공 실력이나 자격을 인증하지 않습니다.</p>{featured&&<div className='achievement-featured'><BadgeArt badge={featured} size={90}/><span>대표 배지<br/><strong>{featured.title}</strong></span><button disabled={busy} onClick={()=>act({action:'feature',badge_id:null})}>해제</button></div>}
  <button disabled={busy} onClick={()=>setReload(v=>v+1)}>진행 상황 새로고침</button></div>
  <p className='achievement-help'>{scope==='worker'?'선택한 대표 배지는 공개에 동의한 시공자 검색·구직 프로필과 지원한 업체의 지원자 화면에 표시됩니다.':'선택한 업체 대표 배지는 시공자가 보는 구인 공고와 지원 현황에 표시됩니다.'} 대표 배지를 해제하면 해당 선택의 공개 표시도 사라집니다.</p>
  {scope==='worker'&&<div className='achievement-panel'><h2>누적 현장 출근 거리 · 왕복 기준</h2><p><strong>{Number(data.badges.find(b=>b.metric==='commute_km')?.progress||0).toLocaleString()}km</strong></p><p>출발지에서 현장까지 편도 도로거리 × 2로 계산합니다. 실제 이동 추적 거리가 아닙니다. 출근 위치 확인 또는 관리자 승인 후 같은 현장은 하루 한 번 인정됩니다.</p><p>거리 기록은 기능 설치 후 출근부터 시작합니다. 출근 당시 주소를 보관하여 주소 변경 후에도 이전 거리를 유지합니다. 출발지 주소와 정확한 누적거리는 공개 프로필에 표시하지 않습니다.</p><a href='/worker/account'>출발지 주소 등록 · 수정</a><p>새 경로는 기존 지도 조회 한도 안에서 계산하며, 같은 출발지·현장 경로는 저장된 거리를 재사용합니다. 계산 실패 시 30분 후 재시도하며 한 기록은 최대 5회 시도합니다.</p><button disabled={busy} onClick={calculateDistance}>{busy?'처리 중…':'미계산 출근 거리 계산'}</button>{distanceMessage&&<p role='status'>{distanceMessage}</p>}</div>}
  {celebration}{error&&<p role='alert'>{error}</p>}
  <div className='achievement-filters' aria-label='배지 필터'>{[['all','전체'],['earned','획득'],['pending','도전 중']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div>
  <div className='achievement-grid'>{data.badges.filter(b=>filter==='all'||(filter==='earned'?b.earned_at:b.active&&!b.earned_at)).map(b=><article key={b.id} className={`achievement-panel achievement-badge tier-${b.tier} ${b.earned_at?'earned':''}`}>
   <BadgeArt badge={b} locked={!b.earned_at} size={160}/><h2>{b.title}</h2><p>{b.description}</p>
   {b.earned_at?<><strong className='achievement-earned'>획득 완료{!b.active?' · 보관 배지':''}</strong><small>획득일 {new Date(b.earned_at).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</small><button disabled={busy||data.featured===b.id} onClick={()=>act({action:'feature',badge_id:b.id})}>{data.featured===b.id?'대표 배지':'대표 배지로 선택'}</button></>:<><span>{Number(b.progress).toLocaleString()} / {b.target.toLocaleString()} {badgeUnit(b.metric)}</span><progress aria-label={`${b.title} 진행률`} max='100' value={badgeProgress(b)}/><small>아직 획득하지 않았어요</small></>}
  </article>)}</div>
  <p className='achievement-help'>기존 기록도 조건에 맞으면 인정됩니다. 획득일은 앱이 달성을 처음 확인한 날짜입니다. 같은 현장을 여러 번 저장해도 중복 집계하지 않습니다. 획득한 배지는 이후 기록이 바뀌어도 보관됩니다.</p>
 </section>;
}


