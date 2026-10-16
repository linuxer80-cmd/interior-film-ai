"use client";
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabase';
import {badgeProgress,nextBadge,badgeUnit} from '../../lib/achievements.mjs';
import './achievementBadges.css';
import ReferralPanel from './ReferralPanel';
import {rewardText,rewardLabels} from '../../lib/badgeRewards.mjs';

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
 const [view,setView]=useState('badges'),[page,setPage]=useState(0);
 const listTop=useRef(null);
 useEffect(()=>{if(!compact&&new URLSearchParams(window.location.search).get('tab')==='invite')setView('invite');},[compact]);
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
  </a><a href={`/achievements?scope=${scope}&tab=invite`} style={{display:'block',padding:12,color:'#2563eb'}} data-ui-link="action">친구 초대 · AI 보상 받기 →</a>{celebration}{error&&<p role='alert'>{error}</p>}
 </section>;
 const filtered=data.badges.filter(b=>filter==='all'||(filter==='earned'?b.earned_at:b.active&&!b.earned_at));
 const current=Math.min(page,Math.max(0,Math.ceil(filtered.length/4)-1));
 function turnPage(value){setPage(value);requestAnimationFrame(()=>{listTop.current?.focus({preventScroll:true});listTop.current?.scrollIntoView({behavior:'smooth',block:'start'});});}
 return <section className='achievement-shell compact-achievements'>
  <div className='achievement-panel short-summary'>
   <div className='summary-heading'><div><h1>{scope==='owner'?'우리 업체 업적':'내 업적'}</h1><small>획득 {earned.length}개 · 도전 중 {data.badges.filter(b=>b.active&&!b.earned_at).length}개</small></div><button disabled={busy} onClick={()=>setReload(v=>v+1)}>새로고침</button></div>
   {featured&&<details className='featured-fold'><summary>대표 배지 · {featured.title}</summary><div className='achievement-featured'><BadgeArt badge={featured} size={60}/><strong>{featured.title}</strong><button disabled={busy} onClick={()=>act({action:'feature',badge_id:null})}>해제</button></div></details>}
  </div>
  <nav className='section-switch' aria-label='업적 메뉴'>{[['badges','배지'],['invite','친구 초대'],['rewards','AI 보상']].map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>setView(id)}>{label}</button>)}</nav>
  {error&&<p role='alert'>{error}</p>}
  <div hidden={view!=='invite'}>
  <ReferralPanel scope={scope} onChanged={()=>setReload(v=>v+1)}/>
  </div>
  <div hidden={view!=='rewards'} className='achievement-panel'><h2>배지로 받은 AI 횟수</h2><p>트라이얼 기본 횟수 소진 후 사용합니다. 배지당 최초 한 번 적립되며 월마다 초기화되지 않습니다. 기존 이용 권한과 체험 기간은 그대로 적용됩니다.</p>
   {data.reward_error?<p role='alert'>{data.reward_error}</p>:<ul>{Object.entries((data.reward_credits||[]).reduce((all,c)=>({...all,[c.feature]:(all[c.feature]||0)+c.granted-c.used}),{})).map(([key,n])=><li key={key}>{rewardLabels[key]||key} · 남은 {n}회</li>)}</ul>}
   {scope==='worker'&&<small>본인 보상은 연결된 트라이얼 업체의 허용된 AI 기능을 본인이 사용할 때 적용됩니다.</small>}
  </div>
  <div hidden={view!=='badges'}>
  <details className='achievement-guide'><summary>대표 배지·활동 집계 안내</summary><p className='achievement-help'>앱 활동 기록에 따른 배지이며 시공 실력이나 자격을 인증하지 않습니다.</p><p className='achievement-help'>{scope==='worker'?'선택한 대표 배지는 공개에 동의한 시공자 검색·구직 프로필과 지원한 업체의 지원자 화면에 표시됩니다.':'선택한 업체 대표 배지는 시공자가 보는 구인 공고와 지원 현황에 표시됩니다.'} 대표 배지를 해제하면 해당 선택의 공개 표시도 사라집니다.</p>
  {scope==='worker'&&<div><h2>누적 현장 출근 거리 · 왕복 기준</h2><p><strong>{Number(data.badges.find(b=>b.metric==='commute_km')?.progress||0).toLocaleString()}km</strong></p><p>출발지에서 현장까지 편도 도로거리 × 2로 계산합니다. 실제 이동 추적 거리가 아닙니다. 출근 위치 확인 또는 관리자 승인 후 같은 현장은 하루 한 번 인정됩니다.</p><p>거리 기록은 기능 설치 후 출근부터 시작합니다. 출근 당시 주소를 보관하여 주소 변경 후에도 이전 거리를 유지합니다. 출발지 주소와 정확한 누적거리는 공개 프로필에 표시하지 않습니다.</p><a href='/worker/account' data-ui-link="action">출발지 주소 등록 · 수정</a><p>새 경로는 기존 지도 조회 한도 안에서 계산하며, 같은 출발지·현장 경로는 저장된 거리를 재사용합니다. 계산 실패 시 30분 후 재시도하며 한 기록은 최대 5회 시도합니다.</p><button disabled={busy} onClick={calculateDistance}>{busy?'처리 중…':'미계산 출근 거리 계산'}</button>{distanceMessage&&<p role='status'>{distanceMessage}</p>}</div>}
  {scope==='worker'&&<p className='achievement-help'>재단·주변 검색 배지는 설정 후 사용일부터 쌓이며, 기능별로 한국시간 하루 한 번 인정됩니다. 재단 계산 완료 또는 음식점·필름가게 검색 결과 확인 시 기록됩니다. 저장된 검색 결과도 인정되며, 검색 실패·빈 결과는 제외합니다.</p>}
  </details>
  {celebration}
  <div ref={listTop} tabIndex={-1} className='achievement-filters' aria-label='배지 필터'>{[['all','전체'],['earned','획득'],['pending','도전 중']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>{setFilter(id);setPage(0);}}>{label}</button>)}</div>
  <div className='achievement-grid'>{filtered.slice(current*4,current*4+4).map(b=><article key={b.id} className={`achievement-panel achievement-badge tier-${b.tier} ${b.earned_at?'earned':''}`}>
   <BadgeArt badge={b} locked={!b.earned_at} size={76}/><h2>{b.title}</h2><details className='badge-condition'><summary>달성 조건 보기</summary><p>{b.description}</p></details><p style={{color:"#1d4ed8",fontWeight:700}}>AI 보상 · {rewardText(b.reward)||"보상 설정 확인 중"}</p>{b.reward_granted&&<small>보상 적립 완료</small>}
   {b.earned_at?<><strong className='achievement-earned'>획득 완료{!b.active?' · 보관 배지':''}</strong><small>획득일 {new Date(b.earned_at).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</small><button disabled={busy||data.featured===b.id} onClick={()=>act({action:'feature',badge_id:b.id})}>{data.featured===b.id?'대표 배지':'대표 배지로 선택'}</button></>:<><span>{Number(b.progress).toLocaleString()} / {b.target.toLocaleString()} {badgeUnit(b.metric)}</span><progress aria-label={`${b.title} 진행률`} max='100' value={badgeProgress(b)}/><small>아직 획득하지 않았어요</small></>}
  </article>)}</div>
  {!filtered.length&&<p>표시할 배지가 없습니다.</p>}
  {filtered.length>4&&<nav className='badge-pages' aria-label='배지 목록 페이지'><button disabled={current===0} onClick={()=>turnPage(current-1)}>이전</button><span>{current+1} / {Math.ceil(filtered.length/4)}</span><button disabled={(current+1)*4>=filtered.length} onClick={()=>turnPage(current+1)}>다음</button></nav>}
  <details className='achievement-guide'><summary>기존 기록·획득일 안내</summary><p className='achievement-help'>기존 기록도 조건에 맞으면 인정됩니다. 획득일은 앱이 달성을 처음 확인한 날짜입니다. 같은 현장을 여러 번 저장해도 중복 집계하지 않습니다. 획득한 배지는 이후 기록이 바뀌어도 보관됩니다.</p></details>
  </div>
  <style jsx>{`
   [hidden]{display:none!important;}
   .summary-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;}
   .summary-heading h1{font-size:23px;margin:0 0 5px;}
   .summary-heading small{font-size:13px;color:#6b7877;}
   .short-summary{padding:18px;}
   .summary-heading button{padding:9px 12px;font-size:12px;min-height:44px;}
   .featured-fold{border-top:1px solid #e1e5dd;margin-top:12px;}
   summary{cursor:pointer;font-size:13px;padding:10px 0;color:#526763;}
   .section-switch{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:5px;background:#e9ede7;border-radius:14px;margin:14px 0;}
   .section-switch button{padding:10px 3px;border:0;background:transparent;font-size:14px;min-height:44px;}
   .section-switch button[aria-pressed=true]{background:#203f4b;color:white;}
   .achievement-guide{margin:8px 0;}
   .achievement-filters{margin:12px 0;scroll-margin-top:90px;}
   .achievement-filters button{font-size:13px;padding:9px 13px;min-height:44px;}
   .achievement-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
   .achievement-badge{padding:12px;min-width:0;}
   .achievement-badge h2{font-size:15px;margin:8px 0 4px;}
   .achievement-badge p{font-size:12px;min-height:0;margin:6px 0;overflow-wrap:anywhere;}
   .achievement-badge small,.achievement-badge>span,.achievement-earned{font-size:11px;}
   .achievement-badge button{font-size:12px;padding:8px;min-height:44px;width:100%;}
   .badge-condition summary{font-size:11px;padding:4px 0;}
   .badge-pages{display:flex;align-items:center;justify-content:center;gap:14px;margin:16px 0;font-size:13px;}
   .badge-pages button{min-height:44px;font-size:13px;}
   @media(max-width:340px){.achievement-grid{grid-template-columns:1fr;}}
  `}</style>
 </section>;
}
