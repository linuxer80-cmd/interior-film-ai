'use client';
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabase';
import {STAGES,newTarget,validateTargets} from '../../lib/photoHierarchy.mjs';
import TargetEditor from '../components/PhotoHierarchyTargetEditor';
import {prepareBulkPhoto} from './quickRegisterFiles';
import styles from '../super-admin/photo-data/page.module.css';
export default function PhotoHierarchyRegister({loadJobs,onPendingChange}){
 const [photos,setPhotos]=useState([]),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const working=useRef(false),urls=useRef(new Set());
 const current=photos.find(p=>p.id===selected);
 useEffect(()=>()=>{urls.current.forEach(u=>URL.revokeObjectURL(u));},[]);
 useEffect(()=>{onPendingChange?.(busy||photos.length>0,busy);},[busy,photos.length,onPendingChange]);
 useEffect(()=>{if(!photos.length&&!busy)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[photos.length,busy]);
 const patch=(id,value)=>setPhotos(ps=>ps.map(p=>p.id===id?{...p,...value}:p));
 async function request(photo,action,targets){
  const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('로그인이 필요합니다.');
  const form=new FormData();for(const [k,v] of Object.entries({action,stage:photo.stage,photoId:photo.id,itemId:photo.itemId,memo:photo.memo}))form.set(k,v);
  form.set('file',photo.file,'photo.jpg');if(targets)form.set('targets',JSON.stringify(targets));
  let response;try{response=await fetch('/api/admin/photo-data',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`},body:form});}catch{throw Error('통신이 끊겼습니다. 입력 내용은 유지됩니다. 연결 후 다시 시도해주세요.');}
  const body=await response.json();if(!response.ok)throw Error(body.error||'처리하지 못했습니다.');return body;
 }
 async function choose(event){
  const files=Array.from(event.target.files||[]);event.target.value='';if(working.current||!files.length)return;
  if(files.length+photos.length>100){setMessage('한 번에 최대 100장까지 등록해주세요.');return;}
  working.current=true;setBusy(true);const added=[];
  try{for(const original of files){const {file}=await prepareBulkPhoto(original);if(file.size>3*1024*1024)throw Error('변환 후 3MB 이하 사진을 선택해주세요.');const url=URL.createObjectURL(file);urls.current.add(url);added.push({id:crypto.randomUUID(),itemId:crypto.randomUUID(),name:original.name,file,url,stage:'unknown',targets:[],memo:''});}
   setPhotos(ps=>[...ps,...added]);setSelected(added[0]?.id||'');setMessage('사진별로 분류와 가격을 확인해주세요. 시공 전후 짝 맞추기는 필요하지 않습니다.');
  }catch(e){added.forEach(p=>{URL.revokeObjectURL(p.url);urls.current.delete(p.url);});setMessage(e.message);}finally{working.current=false;setBusy(false);}
 }
 function remove(photo){setPhotos(ps=>ps.filter(p=>p.id!==photo.id));URL.revokeObjectURL(photo.url);urls.current.delete(photo.url);if(selected===photo.id)setSelected('');}
 const normalized=photo=>validateTargets(photo.targets.map(t=>({...t,shapes:(t.shapesInput??t.shapes.join(',')).split(',').map(v=>v.trim()).filter(Boolean),components:(t.componentsInput??t.components.join(',')).split(',').map(v=>v.trim()).filter(Boolean)})),{reviewed:true});
 async function run(action,one){
  if(working.current)return;const items=one?[one]:photos.filter(p=>action!=='analyze'||!p.targets.length);if(!items.length)return;
  let validated;try{if(action==='save')validated=new Map(items.map(p=>[p.id,normalized(p)]));}catch(e){setMessage(e.message);return;}
  working.current=true;setBusy(true);let done=0;
  try{for(const photo of items){setMessage(`${action==='save'?'저장':'AI 분류'} 중 ${done+1}/${items.length}`);
   const result=await request(photo,action,validated?.get(photo.id));done++;
   if(action==='save')remove(photo);else patch(photo.id,{targets:result.targets});
  }setMessage(action==='save'?`${done}장 등록 완료 · 분류와 대상별 가격을 저장했습니다.`:`${done}장 AI 분류 완료 · 각 사진의 대상과 가격을 검토한 뒤 저장해주세요.`);
  if(action==='save')await loadJobs?.();
  }catch(e){setMessage(`${done}장 완료 후 중단: ${e.message}`);}finally{working.current=false;setBusy(false);}
 }
 return <section className={styles.page}>
  <h2>시공 데이터 등록</h2>
  <label>사진 추가 · 최대 100장<input type="file" accept="image/*" multiple disabled={busy} onChange={choose}/></label>
  <p className={styles.hint}>사진을 추가하고 시공 대상과 가격을 확인해주세요. 가격은 나중에 입력할 수 있습니다.</p>
  {message&&<p role="status" className={styles.notice}>{message}</p>}
  {!!photos.length&&<div className={styles.toolbar}><button disabled={busy} onClick={()=>run('analyze')}>미분류 사진 AI 분류</button><button disabled={busy||photos.some(p=>!p.targets.length)} onClick={()=>run('save')}>전체 검토 완료 · 저장</button><span>남은 사진 {photos.length}장</span></div>}
  <div className={styles.grid}>{photos.map(p=><article key={p.id} className={styles.card}><button disabled={busy} className={styles.imageButton} onClick={()=>setSelected(p.id)}><img src={p.url} alt={p.name}/></button><div className={styles.cardBody}><strong>{p.name}</strong><p>{p.targets.length?`${p.targets.length}개 대상 · 가격 ${p.targets.filter(t=>t.price!=null).length}개 입력`:'미분류'}</p><button disabled={busy} onClick={()=>setSelected(p.id)}>분류·가격 입력</button><button disabled={busy} onClick={()=>remove(p)}>등록 목록에서 제거</button></div></article>)}</div>
  {current&&<section className={styles.target}><div className={styles.row}><h3>{current.name}</h3><button disabled={busy} onClick={()=>setSelected('')}>접기</button></div>
   <img src={current.url} alt="분류할 사진" style={{maxWidth:'100%',maxHeight:420,objectFit:'contain'}}/>
   <fieldset disabled={busy}><label>사진 상태<select value={current.stage} onChange={e=>patch(current.id,{stage:e.target.value})}>{Object.entries(STAGES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <p className={styles.hint}>시공 후 사진에서 시공 전 파손 정도를 추측하지 마세요.</p>
   {!current.targets.length&&<button type="button" onClick={()=>run('analyze',current)}>사진 AI 분류</button>}
   {current.targets.map((t,i)=><TargetEditor key={t.id} index={i} target={t} onChange={next=>patch(current.id,{targets:current.targets.map(x=>x.id===t.id?next:x)})} onRemove={()=>patch(current.id,{targets:current.targets.filter(x=>x.id!==t.id)})}/>)}
   <button type="button" disabled={current.targets.length>=20} onClick={()=>patch(current.id,{targets:[...current.targets,newTarget(crypto.randomUUID())]})}>＋ 사진 속 대상 추가</button>
   <label>사진 메모<textarea value={current.memo} maxLength={2000} onChange={e=>patch(current.id,{memo:e.target.value})}/></label>
   <button type="button" disabled={!current.targets.length} onClick={()=>run('save',current)}>검토 완료 · 사진과 가격 저장</button></fieldset>
  </section>}
 </section>;
}
