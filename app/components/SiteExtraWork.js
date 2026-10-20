"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
const box={border:'1px solid #dce3d6',borderRadius:16,padding:16,margin:'12px 0',background:'#fffefb'};
const button={border:'1px solid #cdd8c9',borderRadius:10,padding:'10px 14px',minHeight:44,background:'#edf3e8',color:'#355d46',fontWeight:700,cursor:'pointer'};
const input={display:'block',width:'100%',boxSizing:'border-box',fontSize:16,padding:10,margin:'6px 0 12px',border:'1px solid #cdd8c9',borderRadius:10};
const labels={pending:'승인 대기',approved:'승인 완료',rejected:'반려',cancelled:'요청 취소'};
const money=n=>n==null?'미정':Number(n).toLocaleString('ko-KR')+'원';
async function photoFile(file){
 const bitmap=await createImageBitmap(file).catch(()=>{throw Error('읽을 수 없는 사진입니다. JPG·PNG 사진을 선택해주세요.');});
 try{
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.75));if(!blob)throw Error('사진을 준비하지 못했습니다.');
  return new File([blob],'extra-work.jpg',{type:'image/jpeg'});
 }finally{bitmap.close();}
}
export default function SiteExtraWork({siteId=null,active=true,onChanged,summary=false,approvedSummary=false}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[page,setPage]=useState(0);
 const [description,setDescription]=useState(''),[amount,setAmount]=useState(''),[files,setFiles]=useState([]),[reviews,setReviews]=useState({});
 const lock=useRef(false),requestId=useRef(null),serial=useRef(0),photoInput=useRef(null),changed=useRef(onChanged);changed.current=onChanged;
 const call=useCallback(async body=>{
  const {data:a,error:e}=await supabase.auth.getSession();if(e||!a?.session)throw Error('다시 로그인해주세요.');
  const query=new URLSearchParams({page:String(page)});if(siteId)query.set('siteId',siteId);if(approvedSummary)query.set('approved','true');
  const form=body instanceof FormData;
  const r=await fetch('/api/site-extra-work?'+query,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+a.session.access_token,...(body&&!form?{'Content-Type':'application/json'}:{})},...(body?{body:form?body:JSON.stringify({...body,siteId})}:{})});
  const result=await r.json();const current=await supabase.auth.getSession();
  if(current.data?.session?.user?.id!==a.session.user.id)throw Error('계정이 변경됐습니다. 새로고침해주세요.');
  if(!r.ok)throw Error(result.error||'추가 작업을 처리하지 못했습니다.');return result;
 },[siteId,page,approvedSummary]);
 const load=useCallback(async()=>{const version=++serial.current;try{const r=await call();if(version===serial.current){setData(r);setError('');}}catch(e){if(version===serial.current)setError(e.message);}},[call]);
 useEffect(()=>{if(!active)return;setData(null);void load();const focus=()=>{if(!lock.current)void load();};window.addEventListener('focus',focus);return()=>{serial.current++;window.removeEventListener('focus',focus);};},[active,load]);
 useEffect(()=>{setDescription('');setAmount('');setFiles([]);setReviews({});setPage(0);requestId.current=null;},[siteId]);
 async function act(body){if(lock.current)return;lock.current=true;serial.current++;setBusy(true);setError('');setMessage('');try{
  await call(body);if(body instanceof FormData){setDescription('');setAmount('');setFiles([]);if(photoInput.current)photoInput.current.value='';requestId.current=null;}
  setMessage(body.action==='approve'?'승인했습니다. 계약금액·수익·미수금에 반영됩니다.':body.action==='reject'?'반려했습니다.':body.action==='cancel'?'요청을 취소했습니다.':'추가 작업을 요청했습니다.');
  await load();await changed.current?.();
 }catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}}
 async function submit(e){e.preventDefault();if(lock.current)return;setError('');try{
  // Keep the same request ID for retries; edits create a new request ID.
  requestId.current ||= crypto.randomUUID();
  const form=new FormData();form.set('action','create');form.set('siteId',siteId);form.set('requestId',requestId.current);form.set('description',description);form.set('amount',amount);
  for(const file of files)form.append('photos',file);
  await act(form);
 }catch(e){setError(e.message);}}
 const edit=()=>{requestId.current=null;setMessage('');};
 async function selectPhotos(e){const chosen=[...e.target.files];if(chosen.length>5){setError('사진은 최대 5장입니다.');e.target.value='';return;}
  if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const photos=[];for(const file of chosen)photos.push(await photoFile(file));if(photos.reduce((n,f)=>n+f.size,0)>3*1024*1024)throw Error('사진 합계가 3MB를 넘습니다. 사진 수를 줄여주세요.');setFiles(photos);edit();}catch(e){setError(e.message);setFiles([]);e.target.value='';}finally{lock.current=false;setBusy(false);}}
 if(!active)return null;
 if(approvedSummary)return <section style={box} aria-label="승인된 추가 작업 견적 부속 내역"><h3 style={{marginTop:0}}>승인된 추가 작업 · 견적 부속 내역</h3>{error?<p role="alert">{error}</p>:!data?<p>확인 중…</p>:<><p>아래 승인 금액은 현재 계약금액에 포함되어 있습니다. 기존 견적서에 다시 더하면 중복됩니다. 저장·발행된 견적서 원본은 보존됩니다.</p>{data.rows.map(r=><p key={r.id} style={{whiteSpace:'pre-wrap'}}>{r.description} · <strong>{money(r.approved_amount)}</strong></p>)}{!data.rows.length&&<p>승인된 추가 작업이 없습니다.</p>}{data.count>data.rows.length&&<p>전체 {data.count}건 · 모든 내역은 ‘추가 작업’ 탭에서 확인하세요.</p>}</>}<button type="button" style={button} onClick={load}>다시 확인</button></section>;
 if(summary)return <section style={box} aria-label="추가 작업 승인 대기"><h3 style={{marginTop:0}}>추가 작업 승인 대기 {data?`${data.count}건`:''}</h3>{error?<p role="alert">{error}</p>:!data?<p>확인 중…</p>:data.rows.length?<><p>현장에서 요청한 추가 작업의 내용과 금액을 확인해주세요.</p>{data.rows.slice(0,5).map(r=><a key={r.id} href={`/admin?tab=sites&site=${r.site_id}&section=extra`} style={{display:'block',padding:'12px 0',color:'#355d46'}}><strong>{r.siteName}</strong> · {r.description.slice(0,70)} · 요청 {money(r.requested_amount)} →</a>)}{data.count>5&&<p>외 {data.count-5}건 · 각 현장의 ‘추가 작업’에서 확인하세요.</p>}</>:<p>승인 대기 중인 추가 작업이 없습니다.</p>}{error&&<button type="button" style={button} onClick={load}>다시 확인</button>}</section>;
 return <section style={box} aria-label="추가 작업 요청과 승인">
  <div style={{display:'flex',justifyContent:'space-between',gap:8}}><h3 style={{margin:0}}>추가 작업 · 승인</h3><button type="button" style={button} disabled={busy} onClick={load}>새로고침</button></div>
  <p>현장 추가 작업을 사진과 함께 요청하고, 관리자가 금액을 확정합니다. 고객과의 추가 금액 합의는 관리자가 별도로 확인해주세요.</p>
  {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}{message&&<p role="status">{message}</p>}
  {!data&&!error&&<p>확인 중…</p>}
  {data&&<>
   {data.owner&&<p>현재 계약금액: <strong>{money(data.contractAmount)}</strong> · 승인 금액은 기존 계약금액에 추가됩니다.</p>}
   <details><summary style={{...button,display:'list-item'}}>추가 작업 요청하기</summary><form onSubmit={submit} style={{marginTop:12}}>
    <label>작업 내용<textarea required maxLength={3000} rows={4} style={input} value={description} disabled={busy} onChange={e=>{setDescription(e.target.value);edit();}} /></label>
    <label>요청 금액 (원 · 선택)<input type="number" min="0" max="1000000000" step="1" inputMode="numeric" style={input} value={amount} disabled={busy} onChange={e=>{setAmount(e.target.value);edit();}} /></label>
    <label>현장 사진 (선택 · 최대 5장)<input ref={photoInput} type="file" accept="image/*" multiple disabled={busy} style={input} onChange={selectPhotos}/></label><p>{files.length}장 준비됨 · 사진은 전송 전에 크기를 줄입니다.</p>
    <button type="submit" style={button} disabled={busy||!description.trim()}>{busy?'처리 중…':'승인 요청 보내기'}</button>
   </form></details>
   <p>전체 {data.count}건 · 승인 전에는 금액이 반영되지 않습니다. 기존에 저장한 견적서는 자동으로 덮어쓰지 않습니다.</p>
   {data.rows.map(row=>{const review=reviews[row.id]||{},patch=value=>setReviews(old=>({...old,[row.id]:{...old[row.id],...value}}));return <article key={row.id} style={{...box,background:row.status==='pending'?'#fff9e9':'#f8faf7'}}>
    <strong>{labels[row.status]}</strong><small style={{display:'block',marginTop:5}}>{new Date(row.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</small>
    <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.description}</p><p>요청 {money(row.requested_amount)}{row.status==='approved'&&<> · 승인 <strong>{money(row.approved_amount)}</strong></>}</p>
    {row.photos.map((url,i)=><a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`추가 작업 현장 사진 ${i+1}`} loading="lazy" style={{width:90,height:90,objectFit:'cover',borderRadius:10,margin:4}}/></a>)}
    {row.photoCount>row.photos.length&&<p>일부 사진을 불러오지 못했습니다. 새로고침해주세요.</p>}
    {row.review_note&&<p style={{whiteSpace:'pre-wrap'}}>검토 메모: {row.review_note}</p>}
    {row.status==='pending'&&data.owner&&<div>
     <label>확정 추가 금액 (원)<input aria-label="확정 추가 금액" type="number" min="0" max="1000000000" step="1" inputMode="numeric" style={input} value={review.amount??row.requested_amount??''} disabled={busy} onChange={e=>patch({amount:e.target.value})}/></label>
     <label>검토 메모 (반려 시 필수)<textarea maxLength={1000} style={input} value={review.note||''} disabled={busy} onChange={e=>patch({note:e.target.value})}/></label>
     <p>승인하면 위 금액이 계약금액에 한 번만 추가됩니다. 이미 계약금액에 포함한 작업은 0원으로 승인해주세요.</p>
     <button type="button" style={button} disabled={busy} onClick={()=>act({action:'approve',id:row.id,amount:review.amount??row.requested_amount,note:review.note||''})}>금액 확정·승인</button>{' '}
     <button type="button" style={button} disabled={busy||!review.note?.trim()} onClick={()=>act({action:'reject',id:row.id,note:review.note})}>반려</button>
    </div>}
    {row.status==='pending'&&row.requested_by===data.userId&&<button type="button" style={{...button,marginTop:10}} disabled={busy} onClick={()=>act({action:'cancel',id:row.id})}>내 요청 취소</button>}
   </article>;})}
   {!data.rows.length&&<p>등록된 추가 작업이 없습니다.</p>}
   <div style={{display:'flex',gap:8}}>{page>0&&<button type="button" style={button} disabled={busy} onClick={()=>setPage(p=>p-1)}>이전 내역</button>}{(page+1)*50<data.count&&<button type="button" style={button} disabled={busy} onClick={()=>setPage(p=>p+1)}>다음 내역</button>}</div>
  </>}
 </section>;
}
