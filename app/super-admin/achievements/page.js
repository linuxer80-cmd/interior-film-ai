"use client";
import {useEffect,useRef,useState} from 'react';
import {BadgeArt,useAchievementApi} from '../../components/AchievementBadges';
import {achievementMetrics,cleanBadge} from '../../../lib/achievements.mjs';
const blank={id:'',title:'',description:'',audience:'owner',metric:'approved_sites',target:10,art_key:1,image_path:'',image_url:null,tier:'gold',sort_order:50,active:true,revision:0};
export default function AchievementManagerPage(){const {user,ready,api}=useAchievementApi();return <main className='achievement-shell' style={{maxWidth:850,margin:'auto',padding:'24px 18px 100px'}}><a href='/super-admin' data-ui-link="action">‹ 슈퍼관리자 홈</a><h1>업적 배지 관리</h1>{!ready?<p>로그인 확인 중…</p>:user?<Manager key={user} api={api}/>:<p>슈퍼관리자 계정으로 로그인해주세요.</p>}</main>;}
function Manager({api}){
 const [badges,setBadges]=useState([]),[draft,setDraft]=useState({...blank}),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[authorized,setAuthorized]=useState(false),[reload,setReload]=useState(0);
 const live=useRef(true),apiRef=useRef(api);apiRef.current=api;
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{let active=true;apiRef.current('/api/super-admin/achievements').then(r=>{if(active){setBadges(r.badges);setAuthorized(true);setError('');}}).catch(e=>{if(active){setAuthorized(false);setError(e.message);}});return()=>{active=false;};},[reload]);
 const field=(key,value)=>setDraft(d=>({...d,[key]:value}));
 async function upload(file){if(!file)return;setBusy(true);setError('');try{const form=new FormData();form.set('file',file);const r=await apiRef.current('/api/super-admin/achievements',form);if(live.current)setDraft(d=>({...d,...r}));}catch(e){if(live.current)setError(e.message);}finally{if(live.current)setBusy(false);}}
 async function save(e){e.preventDefault();setBusy(true);setError('');setMessage('');try{const r=await apiRef.current('/api/super-admin/achievements',cleanBadge(draft));if(live.current){setBadges(r.badges);setDraft(r.badges.find(b=>b.id===draft.id));setMessage('배지를 저장했습니다. 다음 업적 조회부터 반영됩니다.');}}catch(e){if(live.current)setError(e.message);}finally{if(live.current)setBusy(false);}}
 return <><p>기존 달성 조건을 선택하고 목표 횟수만 바꾸면 새 배지를 추가할 수 있습니다. 새로운 종류의 활동 조건은 개발을 통해 추가합니다. 배지 획득에는 AI 사용 횟수가 소모되지 않습니다.</p>
 {error&&<p role='alert'>{error}</p>}{message&&<p role='status'>{message}</p>}
 {!authorized?<button onClick={()=>setReload(v=>v+1)}>권한·설정 다시 확인</button>:<>
 <div className='achievement-manager-list'><button disabled={busy} onClick={()=>{setDraft({...blank});setMessage('');}}>＋ 새 배지</button>{badges.map(b=><button disabled={busy} key={b.id} onClick={()=>{setDraft({...b});setMessage('');}}>{b.active?'':'[숨김] '}{b.title}</button>)}</div>
 <form onSubmit={save} className='achievement-panel achievement-editor'>
 <BadgeArt badge={draft} size={160}/>
 <label>배지 ID (저장 후 변경 불가)<input required disabled={busy||draft.revision>0} value={draft.id} maxLength={64} placeholder='예: site_expert_50' onChange={e=>field('id',e.target.value)}/></label>
 <label>배지 이름<input required disabled={busy} value={draft.title} maxLength={60} onChange={e=>field('title',e.target.value)}/></label>
 <label>달성 안내 문구<textarea required disabled={busy} value={draft.description} maxLength={500} rows={3} onChange={e=>field('description',e.target.value)}/></label>
 <label>대상<select disabled={busy} value={draft.audience} onChange={e=>setDraft(d=>({...d,audience:e.target.value,metric:e.target.value==='owner'?'approved_sites':'approved_reports'}))}><option value='owner'>업체 관리자 · 업체 실적</option><option value='worker'>시공자 · 개인 실적</option></select></label>
 <label>달성 조건<select disabled={busy} value={draft.metric} onChange={e=>setDraft(d=>({...d,metric:e.target.value,...(e.target.value==='complete_profile'?{target:1}:{})}))}>{Object.entries(achievementMetrics).filter(([,m])=>m.audience===draft.audience).map(([key,m])=><option key={key} value={key}>{m.label}</option>)}</select></label>
 <label>목표 횟수<input required disabled={busy} type='number' min='1' max='100000' step='1' value={draft.target} onChange={e=>field('target',e.target.value===''?'':Number(e.target.value))}/></label>
 <p className='achievement-help'>획득자가 있는 배지의 대상·조건·목표는 바꿀 수 없습니다. 50건·100건 업적은 새 배지로 추가해주세요.</p>
 <label>기본 배지 이미지<select disabled={busy} value={draft.art_key} onChange={e=>setDraft(d=>({...d,art_key:Number(e.target.value),image_path:'',image_url:null}))}>{['첫 현장 시작','현장 관리 전문가','꼼꼼한 자재 관리','우리 팀 완성','준비된 시공자','첫 마무리','믿음직한 마무리','자재 정리 달인'].map((name,i)=><option value={i} key={name}>{name}</option>)}</select></label>
 <label>새 이미지 업로드 (공개 이미지 · PNG/JPG/WebP · 2MB 이하)<input type='file' accept='image/png,image/jpeg,image/webp' disabled={busy} onChange={e=>{upload(e.target.files?.[0]);e.target.value='';}}/></label>
 <label>배지 색상<select disabled={busy} value={draft.tier} onChange={e=>field('tier',e.target.value)}>{[['bronze','브론즈'],['silver','실버'],['gold','골드'],['teal','청록']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
 <label>표시 순서<input required disabled={busy} type='number' min='0' max='100000' step='1' value={draft.sort_order} onChange={e=>field('sort_order',e.target.value===''?'':Number(e.target.value))}/></label>
 <label className='achievement-checkbox'><input type='checkbox' disabled={busy} checked={draft.active} onChange={e=>field('active',e.target.checked)}/> 공개 및 신규 획득 허용</label><p className='achievement-help'>숨기면 신규 획득이 중지됩니다. 이미 획득한 사람의 보관함에는 계속 남습니다.</p>
 <button disabled={busy}>{busy?'처리 중…':'배지 저장'}</button>
 </form></>}
 </>;
}
