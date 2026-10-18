"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { nextFolder, folderProfile, groupManualPhotos, manualCaseSql } from '../../../lib/manualCases.mjs';
import { prepareBulkPhoto } from '../../admin/quickRegisterFiles';
import { PROJECT_ID } from '../../admin/adminConstants';
import CaseClassificationFields from '../../components/CaseClassificationFields';
import styles from './page.module.css';
const key = path => JSON.stringify(path);
export default function ManualCases() {
  const [companies,setCompanies]=useState([]),[company,setCompany]=useState(''),[photos,setPhotos]=useState([]),[path,setPath]=useState([]),[selected,setSelected]=useState([]),[details,setDetails]=useState({}),[mode,setMode]=useState('folders'),[busy,setBusy]=useState(false),[message,setMessage]=useState('권한 확인 중'),[sql,setSql]=useState(''),[batch,setBatch]=useState(0);
  const urls=useRef([]), working=useRef(false);
  useEffect(()=>{let active=true;(async()=>{try{
    const {data:a,error:e}=await supabase.auth.getUser(); if(e||!a?.user)throw Error('로그인이 필요합니다.');
    const {data:s,error:se}=await supabase.rpc('get_super_admin_status');if(se||!(Array.isArray(s)?s[0]:s)?.is_super_admin)throw Error('슈퍼관리자만 사용할 수 있습니다.');
    const {data,error}=await supabase.rpc('super_admin_get_companies');if(error)throw error;if(active){setCompanies(data||[]);setMessage('업체를 선택하고 사진을 올려주세요.');}
  }catch(e){if(active)setMessage(e.message);}})();return()=>{active=false;urls.current.forEach(URL.revokeObjectURL);};},[]);
  useEffect(()=>{if(!photos.length)return;const fn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',fn);return()=>window.removeEventListener('beforeunload',fn);},[photos.length]);
  const visible=photos.filter(p=>key(p.path)===key(path));
  const step=nextFolder(folderProfile(path),path.length);
  const groups=groupManualPhotos(photos);
  useEffect(()=>{setBatch(b=>Math.min(b,Math.max(0,Math.ceil(groups.length/30)-1)));},[groups.length]);
  const folders=new Map([[key([]),[]]]);photos.forEach(p=>{for(let n=1;n<=p.path.length;n++)folders.set(key(p.path.slice(0,n)),p.path.slice(0,n));});
  const change=(id,patch)=>{setDetails(d=>({...d,[id]:{...d[id],...patch}}));setSql('');};
  function navigate(p){setPath(p);setSelected([]);}
  async function add(event){
    const files=[...event.target.files];event.target.value='';if(!files.length||working.current)return;
    working.current=true;setBusy(true);const added=[];
    try{for(const file of files){setMessage(`사진 준비 ${added.length+1}/${files.length}`);const prepared=await prepareBulkPhoto(file);const id=crypto.randomUUID(),url=URL.createObjectURL(prepared.file);urls.current.push(url);added.push({...prepared,id,caseId:id,url,path:[...path]});}}
    catch(e){setMessage(`일부 사진을 읽지 못했습니다: ${e.message}`);}
    finally{setPhotos(p=>[...p,...added]);setSql('');setBusy(false);working.current=false;if(added.length===files.length)setMessage(`${added.length}장 추가. 사진을 체크하고 분류를 눌러주세요.`);}
  }
  function move(value){
    if(!selected.length)return;const target=[...path,{key:step[0],value}];
    setPhotos(all=>all.map(p=>selected.includes(p.id)?{...p,path:target,caseId:p.id}:p));setDetails(d=>Object.fromEntries(Object.entries(d).filter(([id])=>!photos.some(p=>p.caseId===id&&selected.includes(p.id)))));setSql('');navigate(target);
  }
  function merge(){if(selected.length<2)return;const id=crypto.randomUUID();setPhotos(all=>all.map(p=>selected.includes(p.id)?{...p,caseId:id}:p));setSql('');setSelected([]);setMessage('선택한 사진을 한 사례로 묶었습니다. 금액은 한 번만 입력합니다.');}
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
        const form=new FormData();form.append('company_id',company);form.append('case_id',group.id);form.append('photo_id',p.id);form.append('image',p.file);
        const response=await fetch('/api/super-admin/bulk-register',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`},body:form});const result=await response.json();if(!response.ok)throw Error(result.error||'업로드 실패');
        list.push({...p,storagePath:result.path});
      }updated.push({...group,photos:list});}
      setSql(manualCaseSql(updated,details,company,PROJECT_ID));setMessage(`${batch+1}차 SQL 준비 완료. 사진 업로드만 완료됐으며 DB 등록은 SQL 실행 후 완료됩니다.`);
    }catch(e){setMessage(e.message);}finally{setBusy(false);working.current=false;}
  }
  return <main className={styles.page}>
    <Link href="/super-admin" onClick={e=>{if(photos.length&&!confirm('입력 중인 내용이 사라집니다. 나가시겠습니까?'))e.preventDefault();}}>← 슈퍼관리자</Link>
    <h1>사진 폴더 분류</h1><p>AI 없이 사진 체크 → 분류 이동 → 같은 대상 묶기 → 가격 입력</p>
    <p role="status">{message}</p>
    <fieldset disabled={busy}>
      <label>등록 업체<select value={company} disabled={photos.length>0} onChange={e=>setCompany(e.target.value)}><option value="">업체 선택</option>{companies.map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}</select></label>
      {company&&<>
        <div className={styles.tabs}><button onClick={()=>setMode('folders')} aria-pressed={mode==='folders'}>1. 사진 분류 ({photos.length})</button><button onClick={()=>setMode('prices')} aria-pressed={mode==='prices'}>2. 사례·가격 ({groups.length})</button></div>
        {mode==='folders'?<>
          <label>현재 폴더에 사진 추가<input type="file" accept="image/*" multiple onChange={add}/></label>
          <nav className={styles.crumb}><button onClick={()=>navigate([])}>전체 / 미분류</button>{path.map((x,i)=><button key={i} onClick={()=>navigate(path.slice(0,i+1))}>{x.value}</button>)}</nav>
          <label>폴더 바로가기<select value={key(path)} onChange={e=>navigate(JSON.parse(e.target.value))}>{[...folders].map(([k,p])=><option key={k} value={k}>{p.map(x=>x.value).join(' / ')||'미분류'} ({photos.filter(x=>key(x.path)===k).length}장)</option>)}</select></label>
          <div className={styles.actions}><button onClick={()=>setSelected(visible.map(p=>p.id))}>현재 폴더 전체 체크</button><button onClick={()=>setSelected([])}>체크 해제</button><strong>{selected.length}장 선택</strong></div>
          <div className={styles.grid}>{visible.map(p=><label key={p.id} className={selected.includes(p.id)?styles.checked:styles.photo}><img src={p.url} alt={p.name}/><span><input type="checkbox" checked={selected.includes(p.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,p.id]:s.filter(id=>id!==p.id))}/>{p.name}</span></label>)}</div>
          {!visible.length&&<p>이 폴더에는 남은 사진이 없습니다. 상위 폴더로 돌아가 나머지를 분류하세요.</p>}
          <div className={styles.sticky}>{step?<><strong>다음 분류: {step[1]}</strong><div className={styles.choices}>{step[2].map(v=><button disabled={!selected.length} key={v} onClick={()=>move(v)}>{v==='평판'?'모양 없는 문·평판':v==='정상 확인'?'손상 없음':v}</button>)}</div></>:<strong>기본 분류 완료. 같은 대상을 묶고 가격을 입력하세요.</strong>}
          <button disabled={selected.length<2} onClick={merge}>체크한 사진을 같은 대상 1건으로 묶기</button>
          <button disabled={!selected.length} onClick={()=>{setPhotos(all=>all.map(p=>selected.includes(p.id)?{...p,caseId:p.id}:p));setSql('');setSelected([]);}}>체크한 사진을 각각 별도 사례로 분리</button>
          {path.length>0&&<button disabled={!selected.length} onClick={()=>{const parent=path.slice(0,-1);setPhotos(all=>all.map(p=>selected.includes(p.id)?{...p,path:parent,caseId:p.id}:p));setDetails(d=>Object.fromEntries(Object.entries(d).filter(([id])=>!photos.some(p=>p.caseId===id&&selected.includes(p.id)))));setSql('');navigate(parent);}}>잘못 분류한 사진을 상위 폴더로</button>}</div>
        </>:<>
          <p>같은 대상의 다른 각도만 묶어주세요. 아래 금액은 사진 장수가 아닌 사례 전체 시공 범위의 합계입니다.</p>
          <label>30사례씩 보기<select value={batch} onChange={e=>{setBatch(Number(e.target.value));setSql('');}}>{Array.from({length:Math.ceil(groups.length/30)},(_,i)=><option key={i} value={i}>{i*30+1}~{Math.min(groups.length,(i+1)*30)}번</option>)}</select></label>
          {groups.slice(batch*30,batch*30+30).map((g,i)=><section className={styles.card} key={g.id}><h2>{batch*30+i+1}. {g.profile.part} · 사진 {g.photos.length}장</h2><div className={styles.thumbs}>{g.photos.map(p=><img key={p.id} src={p.url} alt={p.name}/>)}</div><p>{g.photos[0].path.map(p=>p.value).join(' → ')||'미분류'}</p>
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
    <p>저장 전에는 화면을 유지해주세요. 분류 경로를 바꾼 사례는 가격을 다시 확인해야 합니다. AI 분석·임베딩은 실행하지 않습니다.</p>
  </main>;
}
