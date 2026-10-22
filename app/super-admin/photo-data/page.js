'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {supabase} from '../../../lib/supabase';
import {SPACES,TARGETS,DAMAGES,STAGES,SHAPES,COMPONENTS,newTarget,validateTargets} from '../../../lib/photoHierarchy.mjs';
import styles from './page.module.css';
const STATUS={unclassified:'미분류',draft:'검토 대기',reviewed:'검토 완료',excluded:'검색 제외',unpriced:'가격 미입력',all:'전체'};
const SQL_URL='https://raw.githubusercontent.com/linuxer80-cmd/interior-film-ai/main/database/photo_hierarchy_management.sql';
const won=n=>n==null?'미입력':`${Number(n).toLocaleString('ko-KR')}원`;
async function api(params,body,signal){
 const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('로그인이 필요합니다.');
 const r=await fetch('/api/super-admin/photo-data'+(body?'':`?${new URLSearchParams(params)}`),{method:body?'POST':'GET',cache:'no-store',signal,headers:{Authorization:`Bearer ${session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const v=await r.json();if(!r.ok)throw Object.assign(Error(v.error||'처리하지 못했습니다.'),{setup:v.setupRequired,status:r.status});return v;
}
function TargetEditor({target:t,onChange,onRemove,index,legacyPrice}){
 const patch=p=>onChange({...t,...p});
 const choices=(key,options)=><div className={styles.chips}>{options.map(x=><button type="button" key={x} aria-pressed={(t[`${key}Input`]??t[key].join(',')).split(',').map(v=>v.trim()).includes(x)} onClick={()=>{
  const old=(t[`${key}Input`]??t[key].join(', ')).split(',').map(v=>v.trim()).filter(Boolean);
  let next=old.includes(x)?old.filter(v=>v!==x):[...old,x];
  if(key==='components'&&x==='문·문틀 세트'&&next.includes(x))next=next.filter(v=>!['문짝','문틀'].includes(v));
  if(key==='components'&&['문짝','문틀'].includes(x)&&next.includes(x))next=next.filter(v=>v!=='문·문틀 세트');
  patch({[key]:next,[`${key}Input`]:next.join(', ')});
 }}>{x}</button>)}</div>;
 return <article className={styles.target}><div className={styles.row}><h3>대상 {index+1} · {t.part}</h3><button type="button" onClick={onRemove}>대상 제거</button></div>
  <div className={styles.fields}>
   <label>1단계 · 공간<select value={t.space} onChange={e=>patch({space:e.target.value})}>{SPACES.map(x=><option key={x}>{x}</option>)}</select></label>
   <label>2단계 · 시공 대상<select value={t.part} onChange={e=>patch({part:e.target.value,kind:'확인 필요',shapes:[],components:[],shapesInput:'',componentsInput:''})}>{Object.keys(TARGETS).map(x=><option key={x}>{x}</option>)}</select></label>
   <label>3단계 · 세부 종류<select value={t.kind} onChange={e=>patch({kind:e.target.value})}>{TARGETS[t.part].map(x=><option key={x}>{x}</option>)}</select></label>
  </div>
  <label>4단계 · 모양·구조<input value={t.shapesInput??t.shapes.join(', ')} onChange={e=>patch({shapesInput:e.target.value})} placeholder="평판형, 여닫이, 일자형 — 쉼표로 구분" /></label>{choices('shapes',SHAPES[t.part]||['평판형','장식형','일자형','ㄱ자형','매입형','곡면형'])}
   <label>5단계 · 파손 정도<select value={t.damage} onChange={e=>patch({damage:e.target.value})}>{DAMAGES.map(x=><option key={x}>{x}</option>)}</select></label>

  <label>6단계 · 구성 부위<input value={t.componentsInput??t.components.join(', ')} onChange={e=>patch({componentsInput:e.target.value})} placeholder="상부장, 하부장, 측판 — 쉼표로 구분" /></label>{choices('components',COMPONENTS[t.part]||['문짝','서랍 전면','상판','측판','주변 프레임','마감판'])}
  <div className={styles.price}><label>이 대상의 시공가격 · 원<input type="number" min="0" step="1" max="1000000000000" value={t.price??''} onChange={e=>patch({price:e.target.value===''?null:Number(e.target.value)})} placeholder="직접 입력 · 미입력 상태로 저장 가능" /></label>
   {legacyPrice!=null&&<button type="button" onClick={()=>patch({price:Number(legacyPrice),priceNote:t.priceNote||'기존 사례 가격 · 이 대상에 적용 확인'})}>기존 사례 가격 {won(legacyPrice)}을 이 대상에 적용</button>}
   <label>가격 기준 · 포함 구성·부가세 등<input value={t.priceNote} maxLength={300} onChange={e=>patch({priceNote:e.target.value})} placeholder="예: 상·하부장 포함 / 부가세 별도" /></label></div>
  <label>판단 근거·미확인 사항<textarea rows={2} value={t.notes} maxLength={1000} onChange={e=>patch({notes:e.target.value})} /></label>
 </article>;
}
export default function PhotoData(){
 const [allowed,setAllowed]=useState(false),[companies,setCompanies]=useState([]),[company,setCompany]=useState(''),[status,setStatus]=useState('all'),[part,setPart]=useState(''),[page,setPage]=useState(1),[data,setData]=useState(null),[loading,setLoading]=useState(false),[refresh,setRefresh]=useState(0),[error,setError]=useState(''),[setup,setSetup]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(null),[draft,setDraft]=useState(null);
 const baseline=useRef(''),dialog=useRef(null),working=useRef(false),stop=useRef(false),alive=useRef(true);
 const dirty=!!draft&&JSON.stringify(draft)!==baseline.current;
 useEffect(()=>{alive.current=true;let active=true;(async()=>{try{
  const {data:a,error:e}=await supabase.auth.getUser();if(e||!a?.user)throw Error('로그인이 필요합니다.');
  const {data:s,error:se}=await supabase.rpc('get_super_admin_status');if(se||!(Array.isArray(s)?s[0]:s)?.is_super_admin)throw Error('슈퍼관리자만 사용할 수 있습니다.');
  const {data:c,error:ce}=await supabase.rpc('super_admin_get_companies');if(ce)throw ce;if(active){setCompanies(c||[]);setAllowed(true);}
 }catch(e){if(active)setError(e.message);}})();return()=>{active=false;alive.current=false;stop.current=true;};},[]);
 useEffect(()=>{if(!allowed)return;const controller=new AbortController();let current=true;setLoading(true);setError('');
 api({company,status,part,page:String(page)},null,controller.signal).then(v=>{if(current){setData(v);setSetup(false);}}).catch(e=>{if(current&&e.name!=='AbortError'){setError(e.message);setSetup(!!e.setup);setData(null);}}).finally(()=>{if(current)setLoading(false);});
 return()=>{current=false;controller.abort();};},[allowed,company,status,part,page,refresh]);
 useEffect(()=>{const d=dialog.current;if(draft&&!d?.open)d?.showModal();if(!draft&&d?.open)d.close();},[draft]);
 useEffect(()=>{if(!dirty&&!busy)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,busy]);
 function openPhoto(p){setSelected(p);const next={photoStage:p.photo_stage,targets:structuredClone(p.targets||[])};baseline.current=JSON.stringify(next);setDraft(next);setError('');setMessage('');}
 function close(){if(working.current)return;if(dirty&&!window.confirm('저장하지 않은 분류·가격이 있습니다. 변경을 버리고 닫을까요?'))return;setDraft(null);setSelected(null);}
 async function save(nextStatus){
  if(working.current)return;let targets;try{targets=validateTargets(draft.targets.map(t=>({...t,shapes:(t.shapesInput??t.shapes.join(',')).split(',').map(x=>x.trim()).filter(Boolean),components:(t.componentsInput??t.components.join(',')).split(',').map(x=>x.trim()).filter(Boolean)})),{reviewed:nextStatus==='reviewed'});}catch(e){setError(e.message);return;}
  working.current=true;setBusy(true);setError('');
  try{const {saved}=await api(null,{action:'save',photoId:selected.id,revision:selected.revision,...draft,targets,status:nextStatus});if(!alive.current)return;
   const next={photoStage:saved.photo_stage,targets:saved.targets};baseline.current=JSON.stringify(next);setDraft(next);setSelected(p=>({...p,...saved,id:p.id,review_status:saved.review_status}));setRefresh(n=>n+1);setMessage(nextStatus==='reviewed'?'분류 검토를 완료했습니다. 입력한 대상별 가격을 저장했습니다.':'저장했습니다. 원본 사진과 기존 시공가격은 유지됩니다.');
  }catch(e){if(alive.current){setError(e.message);setSetup(!!e.setup);}}finally{working.current=false;if(alive.current)setBusy(false);}
 }
 async function analyzePhotos(mode,photo){
  if(working.current||dirty)return;working.current=true;stop.current=false;setBusy(true);setError('');let done=0;
  try{while(!stop.current&&done<(mode==='all'?100:1)){
   const item=photo||(await api({company,status:'unclassified',page:'1'})).photos[0];if(!item)break;
   if(!alive.current||stop.current)break;setMessage(`AI 분류 중 · ${done+1}${mode==='all'?' / 최대 100장':''} · 완료 ${done}장`);
   const {saved}=await api(null,{action:'analyze',photoId:item.id,revision:item.revision});done++;
   if(!alive.current)break;
   setRefresh(n=>n+1);
   if(mode!=='all')openPhoto({...item,targets:saved.targets,photo_stage:saved.photo_stage,revision:saved.revision,review_status:saved.review_status});
  }
  if(alive.current)setMessage(`${done}장 분류 제안을 저장했습니다.${stop.current?' 중단했습니다.':''} ‘검토 대기’에서 대상과 가격을 확인해주세요.`);
  }catch(e){if(alive.current){setError(`${done}장 완료 후 중단: ${e.message}`);setSetup(!!e.setup);}}
  finally{working.current=false;if(alive.current){setBusy(false);setRefresh(n=>n+1);}}
 }
 return <main className={styles.page}>
  <Link href="/super-admin">‹ 슈퍼관리자</Link>
  <header className={styles.header}><div><p className={styles.eyebrow}>사진 견적 · 데이터 관리</p><h1>사진 분류·가격 관리</h1><p>공간 → 시공 대상 → 세부 종류 → 모양·구조 → 파손 정도 → 구성 부위</p></div><span className={styles.badge}>6단계 분류</span></header>
  <p className={styles.notice}>기존 시공 데이터 사진을 개별 검토합니다. 현장 묶기·전후 짝 맞추기는 필수가 아닙니다. 가격은 사진 속 대상별로 입력하며 AI가 가격을 임의로 채우지 않습니다.</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{message&&<p role="status" className={styles.message}>{message}</p>}
  {setup&&<section className={styles.notice}><h2>데이터 관리 설정이 필요합니다</h2><p>아래 SQL을 Supabase SQL 편집기에 실행한 뒤 다시 불러오세요. 기존 사진·가격을 삭제하지 않습니다.</p><a href={SQL_URL} target="_blank" rel="noreferrer">설정 SQL 열기</a><button type="button" onClick={()=>setRefresh(n=>n+1)}>설정 후 다시 불러오기</button></section>}
  {allowed&&<>
   <fieldset disabled={busy||loading} className={styles.filters}>
    <label>업체<select value={company} onChange={e=>{setCompany(e.target.value);setPage(1);}}><option value="">전체 업체</option>{companies.map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}</select></label>
    <label>작업 상태<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label>대상 분류<select value={part} onChange={e=>{setPart(e.target.value);setPage(1);}}><option value="">전체 대상</option>{Object.keys(TARGETS).map(x=><option key={x}>{x}</option>)}</select></label>
   </fieldset>
   {data&&<div className={styles.stats}>{['all','unclassified','draft','reviewed'].map(s=><button key={s} type="button" disabled={busy} onClick={()=>{setStatus(s);setPage(1);}}><span>{STATUS[s]}</span><strong>{data.stats[s].toLocaleString()}</strong></button>)}</div>}
   <div className={styles.toolbar}><button disabled={busy||loading||setup||!data?.stats?.unclassified} onClick={()=>analyzePhotos('all')}>미분류 연속 AI 분류 · 최대 100장</button>{busy&&<button onClick={()=>{stop.current=true;setMessage('진행 중인 사진을 저장한 뒤 중단합니다.');}}>현재 사진 완료 후 중단</button>}<button disabled={busy||loading} onClick={()=>setRefresh(n=>n+1)}>새로고침</button></div>
   <p className={styles.hint}>AI 분류는 한 장씩 저장해 중단 후 이어갈 수 있습니다. 검토 완료된 사진은 건드리지 않습니다. 연속 분류는 선택한 업체의 모든 미분류 사진을 대상으로 합니다.</p>
   {loading?<p role="status">사진 목록을 불러오는 중…</p>:<><div className={styles.grid}>{(data?.photos||[]).map(p=><article key={p.id} className={styles.card}>
    <button className={styles.imageButton} onClick={()=>openPhoto(p)} disabled={busy}>{p.url?<img src={p.url} alt={p.sub_category||p.category||'등록된 시공 사진'} loading="lazy"/>:<span>사진을 불러올 수 없습니다. 분류 정보는 열 수 있습니다.</span>}</button>
    <div className={styles.cardBody}><div className={styles.row}><span className={styles.badge}>{STATUS[p.review_status]}</span><span>{STAGES[p.photo_stage]}</span></div><h2>{p.category||'분류 미입력'}</h2><p>{p.targets.length? p.targets.map(t=>`${t.part} · ${won(t.price)}`).join(' / '):'6단계 분류를 시작해주세요.'}</p><small>기존 사례 가격 {won(p.legacy_price)} · 대상 연결 확인 필요</small><div className={styles.row}><button disabled={busy} onClick={()=>openPhoto(p)}>분류·가격 입력</button>{p.review_status==='unclassified'&&<button disabled={busy||!p.url} onClick={()=>analyzePhotos('one',p)}>AI 분류 제안</button>}</div></div>
   </article>)}</div>{data&&!data.photos.length&&<p>해당 조건의 사진이 없습니다.</p>}</>}
   <nav className={styles.pagination} aria-label="사진 목록 페이지"><button disabled={busy||loading||page===1} onClick={()=>setPage(n=>n-1)}>이전</button><span>{page} / {Math.max(1,Math.ceil((data?.count||0)/12))} · {data?.count||0}장</span><button disabled={busy||loading||page*12>=(data?.count||0)} onClick={()=>setPage(n=>n+1)}>다음</button></nav>
  </>}
  <dialog ref={dialog} className={styles.dialog} onCancel={e=>{e.preventDefault();close();}} aria-label="사진 분류·가격 편집">
   {draft&&selected&&<><div className={styles.dialogHeader}><div><h2>사진 분류·가격 입력</h2><small>{dirty?'저장하지 않은 변경 있음':STATUS[selected.review_status]} · 사진 ID {selected.id.slice(0,8)}</small></div><button disabled={busy} onClick={close}>닫기</button></div>
    <div className={styles.editor}><aside className={styles.preview}>{selected.url?<a href={selected.url} target="_blank" rel="noreferrer"><img src={selected.url} alt="분류할 시공 사진 · 눌러서 크게 보기"/></a>:<p>사진 주소가 만료됐으면 닫고 새로고침해주세요.</p>}<p>사진을 누르면 크게 볼 수 있습니다.</p><div className={styles.notice}><strong>기존 연결 가격 {won(selected.legacy_price)}</strong><p>{selected.legacy_price_label||'기존 시공 항목'}</p><small>여러 대상이 포함된 가격일 수 있습니다. 해당 대상의 가격인지 확인한 후 직접 입력해주세요.</small></div></aside>
     <section><fieldset disabled={busy}><label>사진 상태<select value={draft.photoStage} onChange={e=>setDraft(d=>({...d,photoStage:e.target.value}))}>{Object.entries(STAGES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><p className={styles.hint}>시공 후 사진만으로 시공 전 파손 정도를 확정하지 마세요. 파손 미관찰과 파손 없음을 구분합니다.</p>
      {draft.targets.map((t,i)=><TargetEditor key={t.id} index={i} target={t} legacyPrice={selected.legacy_price} onChange={next=>setDraft(d=>({...d,targets:d.targets.map(v=>v.id===t.id?next:v)}))} onRemove={()=>setDraft(d=>({...d,targets:d.targets.filter(v=>v.id!==t.id)}))}/>)}
      <button type="button" disabled={draft.targets.length>=20} onClick={()=>setDraft(d=>({...d,targets:[...d.targets,newTarget(crypto.randomUUID())]}))}>＋ 사진 속 대상 추가</button>
     </fieldset></section>
    </div>
    {error&&<p role="alert" className={styles.error}>{error}</p>}{message&&<p role="status" className={styles.message}>{message}</p>}
    <footer className={styles.footer}><button disabled={busy} onClick={()=>save('draft')}>임시 저장</button><button className={styles.primary} disabled={busy||!draft.targets.length} onClick={()=>save('reviewed')}>{busy?'처리 중…':'검토 완료 · 가격 저장'}</button><button disabled={busy} onClick={()=>save('excluded')}>검색 제외로 저장</button></footer><p className={styles.hint}>가격 미입력 상태도 저장할 수 있습니다. ‘검색 제외’는 원본을 삭제하지 않으며, 다시 검토 완료로 저장해 복구할 수 있습니다. 이 메뉴의 분류는 기존 고객 견적에 아직 자동 적용되지 않습니다.</p>
   </>}
  </dialog>
 </main>;
}
