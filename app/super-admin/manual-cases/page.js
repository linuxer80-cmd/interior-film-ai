"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { suggestedFolder, folderProfile, groupManualPhotos, manualCaseSql } from '../../../lib/manualCases.mjs';
import { PARTS } from '../../../lib/caseClassification.mjs';
import { prepareBulkPhoto } from '../../admin/quickRegisterFiles';
import { PROJECT_ID } from '../../admin/adminConstants';
import CaseClassificationFields from '../../components/CaseClassificationFields';
import styles from './page.module.css';
import { readDraft, writeDraft, readPhoto, writePhoto } from '../../../lib/manualPhotoDraft';
const key = path => JSON.stringify(path);
function PhotoPreview({ photo }) {
  const [url,setUrl]=useState(''),[zoom,setZoom]=useState(1);
  const dialog=useRef(null);
  useEffect(()=>{let active=true,objectUrl;readPhoto(photo.blobKey).then(file=>{if(active&&file){objectUrl=URL.createObjectURL(file);setUrl(objectUrl);}}).catch(()=>{});return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[photo.blobKey]);
  return <>
    <button type="button" className={styles.previewButton} disabled={!url} aria-label={`${photo.name} 확대 보기`} onClick={()=>{setZoom(1);dialog.current.showModal();}}>
      {url?<img src={url} alt={photo.name} loading="lazy"/>:<span>사진 불러오는 중</span>}<span className={styles.zoomHint}>확대 보기</span>
    </button>
    <dialog ref={dialog} className={styles.viewer} aria-label={`${photo.name} 확대 사진`} onClick={e=>{if(e.target===dialog.current)dialog.current.close();}}>
      <div className={styles.viewerBar}><strong>{photo.name}</strong><button type="button" onClick={()=>dialog.current.close()} autoFocus>닫기 ✕</button></div>
      <div className={styles.viewerControls}><button type="button" disabled={zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z-0.5))}>축소 −</button><span>{Math.round(zoom*100)}%</span><button type="button" disabled={zoom>=4} onClick={()=>setZoom(z=>Math.min(4,z+0.5))}>확대 ＋</button><button type="button" onClick={()=>setZoom(1)}>화면 맞춤</button></div>
      <div className={styles.viewerScroll}>{url&&<img src={url} alt={photo.name} style={{width:`${zoom*100}%`}}/>}</div>
      <p>확대 후 좌우·위아래로 스크롤해 확인하세요. 저장된 압축 사진을 표시합니다.</p>
    </dialog>
  </>;
}
export default function ManualCases() {
  const [companies,setCompanies]=useState([]),[company,setCompany]=useState(''),[photos,setPhotos]=useState([]),[path,setPath]=useState([]),[selected,setSelected]=useState([]),[details,setDetails]=useState({}),[mode,setMode]=useState('folders'),[busy,setBusy]=useState(false),[message,setMessage]=useState('권한 확인 중'),[sql,setSql]=useState(''),[batch,setBatch]=useState(0);
  const [customFolders,setCustomFolders]=useState([]),[folderName,setFolderName]=useState('');
  const [actor,setActor]=useState(''),[ready,setReady]=useState(false),[page,setPage]=useState(0),[savedAt,setSavedAt]=useState('');
  const working=useRef(false),stop=useRef(false);
  const draftKey=actor&&company?`${actor}:${company}`:'';
  useEffect(()=>{let active=true;(async()=>{try{
    const {data:a,error:e}=await supabase.auth.getUser(); if(e||!a?.user)throw Error('로그인이 필요합니다.');
    const {data:s,error:se}=await supabase.rpc('get_super_admin_status');if(se||!(Array.isArray(s)?s[0]:s)?.is_super_admin)throw Error('슈퍼관리자만 사용할 수 있습니다.');
    const {data,error}=await supabase.rpc('super_admin_get_companies');if(error)throw error;if(active){setActor(a.user.id);setCompanies(data||[]);setMessage('업체를 선택하고 사진을 올려주세요.');}
  }catch(e){if(active)setMessage(e.message);}})();return()=>{active=false;};},[]);
  useEffect(()=>{if(!photos.length)return;const fn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',fn);return()=>window.removeEventListener('beforeunload',fn);},[photos.length]);
  useEffect(()=>{if(!draftKey)return;let active=true;setReady(false);readDraft(draftKey).then(d=>{if(!active)return;setPhotos(d?.photos||[]);setDetails(d?.details||{});setPath(d?.path||[]);setSelected([]);setCustomFolders(d?.customFolders||[]);setSavedAt(d?.savedAt||'');setReady(true);setMessage(d?.photos?.length?`${d.photos.length}장 임시 작업을 복원했습니다.`:'사진을 추가해주세요.');}).catch(e=>{if(active)setMessage(`임시 저장소를 열 수 없습니다: ${e.message}`);});return()=>{active=false;};},[draftKey]);
  useEffect(()=>{if(!ready||!draftKey)return;const timer=setTimeout(()=>{writeDraft(draftKey,{photos,details,path,customFolders,savedAt}).catch(e=>setMessage(`임시 저장 실패: ${e.message}. 화면을 닫지 마세요.`));},300);return()=>clearTimeout(timer);},[photos,details,path,customFolders,ready,draftKey,savedAt]);
  useEffect(()=>setPage(0),[path]);
  const visible=photos.filter(p=>key(p.path)===key(path));
  const suggested=suggestedFolder(path);
  const customNames=customFolders.filter(f=>key(f.parent)===key(path)).map(f=>f.name);
  const step=!path.length?['space','공간 분류',[...new Set(['주거','상업',...customNames])]]:path.length===1&&path[0].key==='space'?['part','대분류',[...new Set([...PARTS.filter(p=>p!=='확인 필요'),...customNames])]]:suggested?[suggested[0],suggested[1],[...new Set([...suggested[2],...customNames])]]:['custom_'+path.length,'내 하위 분류',customNames];
  const fieldKey=value=>customFolders.find(f=>key(f.parent)===key(path)&&f.name===value)?.key|| (customNames.includes(value)?'custom_'+path.length:step[0]);
  const groups=groupManualPhotos(photos);
  useEffect(()=>{setBatch(b=>Math.min(b,Math.max(0,Math.ceil(groups.length/30)-1)));},[groups.length]);
  const folders=new Map([[key([]),[]]]);customFolders.forEach(f=>{const p=[...f.parent,{key:f.key||'custom_'+f.parent.length,value:f.name}];folders.set(key(p),p);});photos.forEach(p=>{for(let n=1;n<=p.path.length;n++)folders.set(key(p.path.slice(0,n)),p.path.slice(0,n));});
  const change=(id,patch)=>{setDetails(d=>({...d,[id]:{...d[id],...patch}}));setSql('');};
  function navigate(p){setPath(p);setSelected([]);setFolderName('');}
  async function add(event){
    const picked=[...event.target.files];event.target.value='';if(working.current)return;
    const files=picked.filter(file=>file.type.startsWith('image/')||/\.(jpe?g|png|webp|heic|heif|avif|gif|bmp)$/i.test(file.name));
    if(!files.length){setMessage('선택한 폴더에 지원하는 사진 파일이 없습니다.');return;}
    working.current=true;stop.current=false;setBusy(true);let added=[],failed=0,totalBytes=0;
    try{for(let index=0;index<files.length;index++){
      if(stop.current)break;
      setMessage(`압축·기기 저장 ${index+1}/${files.length} · 실패 ${failed}장`);
      let prepared;try{prepared=await prepareBulkPhoto(files[index]);}catch{failed++;continue;}
      const {file,...metadata}=prepared;
      if(file.size>3500000){failed++;continue;}
      const id=crypto.randomUUID(),blobKey=`${draftKey}:${id}`;
      await writePhoto(blobKey,file);
      totalBytes+=file.size;
      added.push({...metadata,id,caseId:id,blobKey,bytes:file.size,sourcePath:files[index].webkitRelativePath||files[index].name,path:[...path]});
      if(added.length%20===0){const next=[...photos,...added];await writeDraft(draftKey,{photos:next,details,path,customFolders});setPhotos(next);}
    }
    const next=[...photos,...added];await writeDraft(draftKey,{photos:next,details,path,customFolders});setPhotos(next);
    setMessage(`${added.length}장 추가 · 압축본 ${(totalBytes/1024/1024).toFixed(1)}MB · 실패 ${failed}장${stop.current?' · 중단됨':''}. 원본은 업로드하지 않습니다.`);
    }catch(e){setPhotos([...photos,...added]);setMessage(`기기 저장 중단: ${e.message}. 처리된 사진은 유지됩니다.`);}
    finally{setSql('');setBusy(false);working.current=false;}
  }

  function move(value,overrideKey){
    if(!selected.length)return;const target=[...path,{key:overrideKey||fieldKey(value),value}];
    setPhotos(all=>all.map(p=>selected.includes(p.id)?{...p,path:target,caseId:p.id}:p));setDetails(d=>Object.fromEntries(Object.entries(d).filter(([id])=>!photos.some(p=>p.caseId===id&&selected.includes(p.id)))));setSql('');setPath(target);setFolderName('');
  }
  function merge(){if(selected.length<2)return;const id=crypto.randomUUID();setPhotos(all=>all.map(p=>selected.includes(p.id)?{...p,caseId:id}:p));setSql('');setSelected([]);setMessage('선택한 사진을 한 사례로 묶었습니다. 금액은 한 번만 입력합니다.');}
  async function saveWork(){
    if(!ready||working.current)return;
    working.current=true;setBusy(true);
    try{
      const stamp=new Date().toISOString();
      await writeDraft(draftKey,{photos,details,path,customFolders,savedAt:stamp});
      setSavedAt(stamp);
      setMessage('작업 저장 완료. 같은 기기·브라우저에서 이 업체를 선택하면 이어서 작업할 수 있습니다.');
      if(navigator.storage?.persist)await navigator.storage.persist().catch(()=>false);
    }catch(e){setMessage(`작업 저장 실패: ${e.message}. 화면을 닫지 마세요.`);}
    finally{working.current=false;setBusy(false);}
  }
  async function generate(){
    if(working.current)return;const current=groups.slice(batch*30,batch*30+30);
    try{
      // Validate all fields before uploading any bytes.
      manualCaseSql(current.map(g=>({...g,photos:g.photos.map(p=>({...p,storagePath:'validation'}))})),details,company,PROJECT_ID);
      if(current.some(g=>g.profile.part==='확인 필요'))throw Error('시공 부위를 먼저 선택해주세요.');
      working.current=true;setBusy(true);setSql('');
      const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('로그인이 필요합니다.');
      const updated=[];
      for(const group of current){const list=[];for(const p of group.photos){
        setMessage(`사진 업로드 중 · ${p.name}`);
        const form=new FormData();form.append('company_id',company);form.append('case_id',group.id);form.append('photo_id',p.id);const file=await readPhoto(p.blobKey);if(!file)throw Error('기기에서 사진을 찾지 못했습니다. 사진을 다시 추가해주세요.');form.append('image',file);
        const response=await fetch('/api/super-admin/bulk-register',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`},body:form});const result=await response.json();if(!response.ok)throw Error(result.error||'업로드 실패');
        list.push({...p,storagePath:result.path});
      }updated.push({...group,photos:list});}
      setSql(manualCaseSql(updated,details,company,PROJECT_ID));setMessage(`${batch+1}차 SQL 준비 완료. 사진 업로드만 완료됐으며 DB 등록은 SQL 실행 후 완료됩니다.`);
    }catch(e){setMessage(e.message);}finally{setBusy(false);working.current=false;}
  }
  return <main className={styles.page}>
    <Link href="/super-admin" onClick={e=>{if(photos.length&&!confirm('임시 저장은 같은 기기에 보관됩니다. 나가시겠습니까?'))e.preventDefault();}}>← 슈퍼관리자</Link>
    <h1>사진 폴더 분류</h1><p>주거공간·상업공간 → 대분류 선택 → 내 하위 폴더 만들기 → 사진 체크·이동 → 같은 대상 묶기 → 가격 입력</p>
    <p role="status">{message}</p>
    {busy&&<button onClick={()=>{stop.current=true;}}>사진 준비 중단</button>}
    <fieldset disabled={busy}>
      <label>등록 업체<select value={company} disabled={photos.length>0} onChange={e=>setCompany(e.target.value)}><option value="">업체 선택</option>{companies.map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}</select></label>
      {company&&ready&&<>
        <button className={styles.primary} onClick={saveWork}>오늘 작업 저장 · 나중에 이어하기</button>
        <p>{savedAt?`마지막 작업 저장: ${new Date(savedAt).toLocaleString('ko-KR')}`:'자동 임시 저장 중 · 작업을 마칠 때 작업 저장을 눌러주세요.'}</p>
        <p>작업 저장은 이 기기에 보관됩니다. 다른 기기와 동기화되지 않으며 브라우저 데이터 삭제 시 사라집니다.</p>
        <div className={styles.tabs}><button onClick={()=>setMode('folders')} aria-pressed={mode==='folders'}>1. 사진 분류 ({photos.length})</button><button onClick={()=>setMode('prices')} aria-pressed={mode==='prices'}>2. 사례·가격 ({groups.length})</button></div>
        {mode==='folders'?<>
          <label>사진 선택해서 추가<input type="file" accept="image/*" multiple onChange={add}/></label>
          <label>사진 폴더 추가<input type="file" webkitdirectory="" directory="" multiple onChange={add}/></label>
          <p>폴더와 그 안의 하위 폴더에서 사진만 가져옵니다. 기존 사진에 추가하며, 현재 분류 폴더에 넣고 한 장씩 압축합니다. 폴더 선택이 지원되지 않는 기기에서는 사진 선택을 이용해주세요.</p>
          <nav className={styles.crumb}><button onClick={()=>navigate([])}>전체 / 미분류</button>{path.map((x,i)=><button key={i} onClick={()=>navigate(path.slice(0,i+1))}>{x.value}</button>)}</nav>
          <label>폴더 바로가기<select value={key(path)} onChange={e=>navigate(JSON.parse(e.target.value))}>{[...folders].map(([k,p])=><option key={k} value={k}>{p.map(x=>x.value).join(' / ')||'미분류'} ({photos.filter(x=>key(x.path)===k).length}장)</option>)}</select></label>
          <div className={styles.actions}><button onClick={()=>setSelected(visible.map(p=>p.id))}>현재 폴더 전체 체크</button><button onClick={()=>setSelected([])}>체크 해제</button><strong>{selected.length}장 선택</strong></div>
          <div className={styles.grid}>{visible.slice(page*60,page*60+60).map(p=><div key={p.id} className={selected.includes(p.id)?styles.checked:styles.photo}><PhotoPreview photo={p}/><label><input type="checkbox" checked={selected.includes(p.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,p.id]:s.filter(id=>id!==p.id))}/>{p.name}</label></div>)}</div>
          {visible.length>60&&<div className={styles.actions}><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>이전 60장</button><span>{page+1} / {Math.ceil(visible.length/60)}</span><button disabled={(page+1)*60>=visible.length} onClick={()=>setPage(p=>p+1)}>다음 60장</button></div>}
          {!visible.length&&<p>이 폴더에는 남은 사진이 없습니다. 상위 폴더로 돌아가 나머지를 분류하세요.</p>}
          <div className={styles.sticky}><strong>{suggested?`기본 추천 분류: ${step[1]}`:step[1]}</strong>
          {suggested&&<p>사진 분석에서 사용하는 구조 기준입니다. 아래 항목을 선택하거나 직접 하위 폴더를 추가할 수 있습니다. 모르면 ‘확인 필요’를 선택하고, 원하는 단계에서 가격 입력으로 넘어가세요.</p>}
          <p>폴더 이름을 누르면 체크한 사진을 이동합니다. 사진 없이 폴더를 열려면 ‘열기’를 누르세요.</p>
          <div className={styles.choices}>{step[2].map(v=><span key={v}><button disabled={!selected.length} onClick={()=>move(v)}>{step[0]==='space'&&['주거','상업'].includes(v)?v+'공간':v}</button><button onClick={()=>navigate([...path,{key:fieldKey(v),value:v}])}>{step[0]==='space'&&['주거','상업'].includes(v)?v+'공간':v} 열기</button></span>)}</div>
          {<div><label>{step[0]==='space'?'새 공간 분류':step[0]==='part'?'새 대분류 이름':'새 하위 폴더 이름'}<input value={folderName} maxLength={100} placeholder={step[0]==='part'?'예: 계단':step[0]==='space'?'예: 공용공간':'예: 냉장고장 있는 싱크대'} onChange={e=>setFolderName(e.target.value)}/></label><button disabled={!folderName.trim()} onClick={()=>{
            const name=folderName.trim();if(step[2].includes(name)){setMessage('같은 이름의 폴더가 있습니다.');return;}
            const newKey=['space','part'].includes(step[0])?step[0]:'custom_'+path.length;
            setCustomFolders(f=>[...f,{parent:[...path],key:newKey,name}]);setFolderName('');
            if(selected.length)move(name,newKey);else navigate([...path,{key:newKey,value:name}]);
          }}>폴더 만들기{selected.length?' · 체크한 사진 이동':''}</button></div>}
          <button onClick={()=>setMode('prices')}>여기까지 분류하고 가격 입력</button>
          <button disabled={selected.length<2} onClick={merge}>체크한 사진을 같은 대상 1건으로 묶기</button>
          <button disabled={!selected.length} onClick={()=>{setPhotos(all=>all.map(p=>selected.includes(p.id)?{...p,caseId:p.id}:p));setSql('');setSelected([]);}}>체크한 사진을 각각 별도 사례로 분리</button>
          {path.length>0&&<button disabled={!selected.length} onClick={()=>{const parent=path.slice(0,-1);setPhotos(all=>all.map(p=>selected.includes(p.id)?{...p,path:parent,caseId:p.id}:p));setDetails(d=>Object.fromEntries(Object.entries(d).filter(([id])=>!photos.some(p=>p.caseId===id&&selected.includes(p.id)))));setSql('');navigate(parent);}}>잘못 분류한 사진을 상위 폴더로</button>}</div>
        </>:<>
          <p>같은 대상의 다른 각도만 묶어주세요. 아래 금액은 사진 장수가 아닌 사례 전체 시공 범위의 합계입니다.</p>
          <label>30사례씩 보기<select value={batch} onChange={e=>{setBatch(Number(e.target.value));setSql('');}}>{Array.from({length:Math.ceil(groups.length/30)},(_,i)=><option key={i} value={i}>{i*30+1}~{Math.min(groups.length,(i+1)*30)}번</option>)}</select></label>
          {groups.slice(batch*30,batch*30+30).map((g,i)=><section className={styles.card} key={g.id}><h2>{batch*30+i+1}. {g.profile.part} · 사진 {g.photos.length}장</h2><div className={styles.thumbs}>{g.photos.slice(0,6).map(p=><PhotoPreview key={p.id} photo={p}/>)}</div>{g.photos.length>6&&<p>외 {g.photos.length-6}장 함께 저장</p>}<p>{g.photos[0].path.map(p=>p.value).join(' → ')||'미분류'}</p>
            <label>금액에 포함된 시공 범위<input value={details[g.id]?.scope||''} placeholder="예: ㄱ자 상하부장 + 냉장고장" onChange={e=>change(g.id,{scope:e.target.value})}/></label>
            <label>사례 전체 금액 (원)<input inputMode="numeric" value={details[g.id]?.price||''} placeholder="500000" onChange={e=>change(g.id,{price:e.target.value.replace(/[^0-9]/g,'')})}/></label>
            <label>사진 시점<select value={details[g.id]?.type||''} onChange={e=>change(g.id,{type:e.target.value})}><option value="">선택</option><option value="before">시공 전</option><option value="after">시공 후</option></select></label>
            <label>확인 메모<input value={details[g.id]?.note||''} placeholder="혼동하기 쉬운 점, 수량 등" onChange={e=>change(g.id,{note:e.target.value})}/></label>
            <details><summary>더 자세한 분류 수정</summary><CaseClassificationFields value={details[g.id]?.profile||g.profile} onChange={profile=>change(g.id,{profile})}/></details>
          </section>)}
          {!!groups.length&&<button className={styles.primary} onClick={generate}>현재 30사례 사진 업로드 · SQL 만들기</button>}
          {sql&&<section className={styles.card}><button onClick={async()=>{try{await navigator.clipboard.writeText(sql);setMessage('SQL을 복사했습니다. SQL Editor에서 실행해주세요.');}catch{setMessage('아래 SQL을 길게 눌러 전체 선택 후 복사해주세요.');}}}>SQL 전체 복사</button><textarea readOnly value={sql} rows={8} aria-label="등록 SQL"/><a href="https://supabase.com/dashboard/project/gxtvvzysuhexhpljpswj/sql/new" target="_blank" rel="noreferrer">SQL Editor 열기</a></section>}
        </>}
      </>}
    </fieldset>
    <p>사진은 한 장씩 긴 변 최대 1200px JPEG로 압축합니다. 원본은 서버에 올리지 않습니다. 압축본과 입력 내용은 같은 기기·브라우저에 임시 저장됩니다. 브라우저 데이터 삭제 시 사라질 수 있습니다. 분류 경로를 바꾼 사례는 가격을 다시 확인해야 합니다. AI 분석·임베딩은 실행하지 않습니다.</p>
  </main>;
}
