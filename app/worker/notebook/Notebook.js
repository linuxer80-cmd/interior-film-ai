'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {supabase} from '../../../lib/supabase';
import {loadMyWorkerSites} from '../../utils/workerSites';
import {id,newNotebook,newRoom,newPart,newSize,filmName,notebookDraft,validateBackup} from '../../../lib/measurementNotebook.mjs';
import {listBooks,saveBook,compressPhoto} from '../../../lib/notebookStore';
import s from './notebook.module.css';
import BulkSizes from './BulkSizes';

export default function Notebook(){
 const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[books,setBooks]=useState([]),[book,setBook]=useState(null),[roomIndex,setRoomIndex]=useState(0),[stage,setStage]=useState('list'),[sites,setSites]=useState([]),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[photoView,setPhotoView]=useState(null);
 const current=useRef(null),queue=useRef(Promise.resolve()),revisions=useRef({}),pending=useRef(0),blocked=useRef(false),alive=useRef(true),account=useRef(null),restoreInput=useRef(null),photoDialog=useRef(null);
 useEffect(()=>{
  alive.current=true;
  (async()=>{try{
   const {data,error:authError}=await supabase.auth.getUser();
   if(authError || !data.user) throw Error('실측수첩을 사용하려면 로그인해주세요.');
   if(!alive.current)return;
   account.current=data.user.id;setUser(data.user.id);
   const items=await listBooks(data.user.id);if(!alive.current)return;
   items.forEach(b=>{revisions.current[b.id]=b.revision;});setBooks(items);
   const requested=new URLSearchParams(window.location.search).get('book');const saved=items.find(b=>b.id===requested);if(saved){current.current=saved;setBook(saved);setStage('view');setStatus('이 기기에 저장됨 ✓');}
   loadMyWorkerSites().then(data=>{if(alive.current)setSites(data.sites || []);}).catch(()=>{});
  }catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setLoading(false);}})();
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
   if(account.current && (!session || session.user.id!==account.current)){account.current=null;setUser(null);current.current=null;setBook(null);setBooks([]);setStage('list');setError('로그인 계정이 변경되었습니다. 새로고침 후 이용해주세요.');}
  });
  const leave=e=>{if(pending.current || blocked.current){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',leave);
  return()=>{alive.current=false;subscription.unsubscribe();window.removeEventListener('beforeunload',leave);};
 },[]);
 function persist(next){
  if(!user)return;
  pending.current++;setStatus('기기에 저장 중…');
  const owner=user;
  queue.current=queue.current.then(async()=>{
   if(blocked.current || account.current!==owner)return;
   try{
    revisions.current[next.id]=await saveBook(owner,next,revisions.current[next.id] || 0);
   }catch(e){blocked.current=true;if(alive.current){setError(e.message);setStatus('저장 실패 · 백업 권장');}}
  }).finally(()=>{pending.current--;if(alive.current && !pending.current && !blocked.current)setStatus('이 기기에 저장됨 ✓');});
 }
 function edit(change){
  const next=structuredClone(current.current);change(next);next.updatedAt=new Date().toISOString();
  current.current=next;setBook(next);setBooks(items=>[next,...items.filter(b=>b.id!==next.id)]);persist(next);
 }
 function choose(b,mode='view'){
  if(pending.current || blocked.current){setError('저장이 완료된 뒤 이동해주세요. 저장 실패 시 백업하거나 다시 저장해주세요.');return;}
  current.current=b;setBook(b);setRoomIndex(0);setStage(mode);setError('');setStatus(b.revision || revisions.current[b.id]?'이 기기에 저장됨 ✓':'');
 }
 function create(){const b=newNotebook();choose(b,'site');}
 function field(partIndex,key,value){edit(b=>{b.rooms[roomIndex].parts[partIndex][key]=value;});}
 function sizeField(partIndex,sizeIndex,key,value){edit(b=>{b.rooms[roomIndex].parts[partIndex].sizes[sizeIndex][key]=value;});}
 async function photos(partIndex,files){
  if(!files?.length)return;
  const targetBook=current.current.id,targetRoom=current.current.rooms[roomIndex].id,targetPart=current.current.rooms[roomIndex].parts[partIndex].id;
  if(current.current.rooms[roomIndex].parts[partIndex].photos.length+files.length>12){setError('부위마다 사진을 최대 12장까지 넣을 수 있습니다.');return;}
  setBusy(true);setError('');
  try{const added=[];for(const f of files)added.push({id:id(),data:await compressPhoto(f)});
   if(JSON.stringify(current.current).length+added.reduce((n,p)=>n+p.data.length,0)>45*1024*1024)throw Error('수첩 사진 용량이 큽니다. 새 수첩으로 나누어 기록해주세요.');
   if(current.current?.id===targetBook)edit(b=>{const part=b.rooms.find(r=>r.id===targetRoom)?.parts.find(p=>p.id===targetPart);if(part)part.photos.push(...added);});
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 function exportBook(){
  if(!current.current)return;
  const blob=new Blob([JSON.stringify({format:'film-notebook-v1',book:current.current})],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(current.current.title || '실측수첩').replace(/[\\/:*?"<>|]/g,'_')+'-실측수첩.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 async function restore(file){
  if(!file)return;
  if(pending.current || blocked.current){setError('현재 수첩 저장을 먼저 완료해주세요.');return;}
  setBusy(true);setError('');
  try{if(file.size>50*1024*1024)throw Error('백업 파일은 50MB 이하로 선택해주세요.');
   const restored=validateBackup(JSON.parse(await file.text()));choose(restored);setBooks(items=>[restored,...items]);persist(restored);
  }catch(e){setError(e.message || '백업 파일을 읽을 수 없습니다.');}finally{setBusy(false);}
 }
 function addRoom(){
  if(book.rooms.length>=100){setError('한 수첩에 장소는 100개까지 기록할 수 있습니다.');return;}
  const index=book.rooms.length;edit(b=>b.rooms.push(newRoom('')));setRoomIndex(index);setStage('edit');
 }
 function nextRoom(){if(roomIndex<book.rooms.length-1){setRoomIndex(roomIndex+1);setStage('edit');}else addRoom();}
 async function cutting(){
  setError('');
  try{
   await queue.current;if(blocked.current)throw Error('수첩을 저장한 뒤 다시 시도해주세요.');
   const draft=notebookDraft(current.current);const key=`film-cutting-v2:${user}:notebook:${book.id}`;
   if(localStorage.getItem(key) && !window.confirm('이 수첩의 기존 재단 도면과 체크를 새 치수로 교체할까요? 실측수첩 원본은 유지됩니다.'))return;
   localStorage.setItem(key,JSON.stringify(draft));window.location.assign('/worker/cutting?notebook='+encodeURIComponent(book.id));
  }catch(e){setError(e.message);}
 }
 const room=book?.rooms[roomIndex];
 const count=room?.parts.reduce((n,p)=>n+p.sizes.length,0) || 0;
 const partDetails=(p,pi)=><div className={s.details}>
   <label>메모<textarea maxLength={3000} rows={2} value={p.memo} placeholder="특이사항, 시공 방법, 재단 기록" onChange={e=>field(pi,'memo',e.target.value)}/></label>
   <div className={s.photoGrid}>{p.photos.map((photo,photoIndex)=><div key={photo.id}><button className={s.photoOpen} type="button" aria-label={`${p.name || '부위'} 사진 ${photoIndex+1} 크게 보기`} onClick={()=>{setPhotoView(photo.data);photoDialog.current.showModal();}}><img src={photo.data} alt={`${p.name || '부위'} 사진 ${photoIndex+1}`} loading="lazy"/></button><button type="button" disabled={busy} onClick={()=>{if(window.confirm('수첩에서 이 사진을 지울까요?'))field(pi,'photos',p.photos.filter(q=>q.id!==photo.id));}}>사진 삭제</button></div>)}</div>
   <div className={s.actions}><label className={s.file}>사진 촬영<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={e=>{photos(pi,Array.from(e.target.files));e.target.value='';}}/></label><label className={s.file}>사진 첨부<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={e=>{photos(pi,Array.from(e.target.files));e.target.value='';}}/></label></div>
  </div>;
 return <main className={s.app}>
  <dialog className={s.lightbox} ref={photoDialog} aria-label="실측 사진 크게 보기"><button onClick={()=>photoDialog.current.close()}>닫기 ×</button>{photoView && <img src={photoView} alt="실측 사진 확대"/>}</dialog>
  <header className={s.header}><Link href="/worker" aria-label="시공자 홈으로">‹</Link><h1>실측수첩</h1><span role="status">{status || '나만의 현장 기록'}</span></header>
  {error && <div className={s.error} role="alert">{error}{blocked.current && <div className={s.actions}><button onClick={()=>{if(pending.current)return;blocked.current=false;setError('');persist(current.current);}}>다시 저장</button><button onClick={exportBook}>현재 내용 백업</button></div>}</div>}
  {loading ? <p>수첩을 불러오고 있습니다…</p> : !user ? <Link className={s.primary} href="/worker/login?next=%2Fworker%2Fnotebook">시공자 로그인</Link> : <>
  <input ref={restoreInput} type="file" accept="application/json,.json" hidden onChange={e=>{restore(e.target.files?.[0]);e.target.value='';}}/>
  {stage==='list' ? <>
   <section className={s.intro}><span className={s.eyebrow}>MY FIELD NOTES</span><h2>내 손으로 기록한<br/>현장의 모든 치수</h2><p>배정된 현장 없이도 자유롭게 기록하세요.</p><button className={s.primary} disabled={busy} onClick={create}>＋ 새 수첩 만들기</button></section>
   <aside className={s.hint}>이 계정의 수첩은 <strong>현재 기기에만 저장</strong>됩니다. 브라우저 데이터 삭제·기기 변경 전에 사진이 포함된 백업을 보관해주세요.</aside>
   <div className={s.actions}><input aria-label="수첩 검색" placeholder="현장명·주소 검색" value={query} onChange={e=>setQuery(e.target.value)}/><button disabled={busy} onClick={()=>restoreInput.current.click()}>백업 복원</button></div>
   <div className={s.books}>{books.filter(b=>(b.title+' '+b.address).includes(query)).map(b=><button className={s.cover} key={b.id} onClick={()=>choose(b)}><small>{new Date(b.updatedAt).toLocaleDateString('ko-KR')}</small><h3>{b.title || '이름 없는 현장'}</h3><p>{b.address || '주소 미입력'}</p><span>{b.rooms.length}개 장소 · {b.rooms.reduce((n,r)=>n+r.parts.reduce((m,p)=>m+p.sizes.length,0),0)}개 치수 →</span></button>)}</div>
   {!books.length && <p className={s.empty}>첫 현장의 실측 기록을 남겨보세요.</p>}
  </> : <>
   <div className={s.tools}><button disabled={busy} onClick={()=>{if(pending.current || blocked.current){setError('저장 완료 후 이동해주세요.');return;}setStage('list');setBook(null);current.current=null;}}>‹ 내 수첩</button><button onClick={exportBook}>백업 받기</button></div>
   {stage==='site' ? <section className={s.paper}><span className={s.eyebrow}>STEP 1 · 현장</span><h2>어느 현장인가요?</h2>
    {sites.length>0 && <label>내 현장에서 가져오기<select defaultValue="" onChange={e=>{const site=sites.find(x=>(x.site_id || x.id)===e.target.value);if(site)edit(b=>{b.title=site.site_name || '';b.address=site.address || site.site_address || '';});}}><option value="">직접 입력</option>{sites.map(site=><option key={site.site_id || site.id} value={site.site_id || site.id}>{site.site_name}</option>)}</select></label>}
    <label>현장명<input maxLength={120} value={book.title} placeholder="예: 송도 아파트" onChange={e=>edit(b=>{b.title=e.target.value;})}/></label>
    <label>주소 · 선택<input maxLength={300} value={book.address} placeholder="주소를 입력해주세요" onChange={e=>edit(b=>{b.address=e.target.value;})}/></label>
    <button className={s.primary} disabled={!book.title.trim()} onClick={()=>setStage('edit')}>장소·부위 입력하기 →</button>
   </section> : <>
    <div className={s.project}><div><h2>{book.title || '이름 없는 현장'}</h2><p>{book.address || '주소 미입력'}</p></div><button onClick={()=>setStage('site')} aria-label="현장 정보 수정">✎</button></div>
    <nav className={s.tabs} aria-label="장소">{book.rooms.map((r,i)=><button key={r.id} aria-current={i===roomIndex?'page':undefined} disabled={busy} onClick={()=>setRoomIndex(i)}>{r.name || '새 장소'}</button>)}<button disabled={busy} onClick={addRoom}>＋ 장소</button></nav>
    <div className={s.switcher}><button aria-pressed={stage==='view'} disabled={busy} onClick={()=>setStage('view')}>치수 모아보기</button><button aria-pressed={stage==='edit'} disabled={busy} onClick={()=>setStage('edit')}>입력·사진·메모</button></div>
    <section className={s.paper}>
     {stage==='edit' ? <>
      <label>장소 이름<input maxLength={80} value={room.name} placeholder="방1, 거실, 1층…" onChange={e=>edit(b=>{b.rooms[roomIndex].name=e.target.value;})}/></label>
      <div className={s.suggestions}>{['방1','방2','거실','화장실','1층','2층'].map(name=><button key={name} onClick={()=>edit(b=>{b.rooms[roomIndex].name=name;})}>{name}</button>)}</div>
      {room.parts.map((p,pi)=><section className={s.partEditor} key={p.id}>
       <div className={s.sectionTitle}><strong>부위 {pi+1}</strong><button disabled={busy} onClick={()=>{if(window.confirm('이 부위의 치수·사진·메모를 지울까요?'))edit(b=>{b.rooms[roomIndex].parts.splice(pi,1);});}}>삭제</button></div>
       <label>부위 이름<input maxLength={120} value={p.name} placeholder="장식장, 방문, 걸레받이…" onChange={e=>field(pi,'name',e.target.value)}/></label>
       <div className={s.material}><label>브랜드<input list="notebook-brands" maxLength={120} value={p.brand} placeholder="미정" onChange={e=>field(pi,'brand',e.target.value)}/></label><label>제품번호<input maxLength={120} value={p.code} placeholder="PW961" onChange={e=>field(pi,'code',e.target.value)}/></label><label>방염 여부<select value={p.fire} onChange={e=>field(pi,'fire',e.target.value)}><option value="">미정</option><option value="non_fire">비방염</option><option value="fire">방염</option></select></label></div>
       <label className={s.check}><input type="checkbox" checked={p.grain} onChange={e=>field(pi,'grain',e.target.checked)}/>무늬 방향 유지 · 세로 방향 고정</label>
       <p className={s.hint}>단위 mm · 여유를 포함해 실측한 치수를 그대로 입력하세요.</p>
       {p.sizes.map((size,si)=><div className={s.sizeEdit} key={size.id}><input aria-label={`${p.name} ${si+1} 상세 이름`} maxLength={100} value={size.label} placeholder="상부 문, 측면 등" onChange={e=>sizeField(pi,si,'label',e.target.value)}/><div><label>가로<input inputMode="decimal" type="number" min="1" max="100000" value={size.width} onChange={e=>sizeField(pi,si,'width',e.target.value)}/></label><b>×</b><label>세로<input inputMode="decimal" type="number" min="1" max="100000" value={size.height} onChange={e=>sizeField(pi,si,'height',e.target.value)}/></label><label>수량<input inputMode="numeric" type="number" min="1" max="1000" step="1" value={size.quantity} onChange={e=>sizeField(pi,si,'quantity',e.target.value)}/></label><button aria-label={`${si+1}번째 치수 삭제`} onClick={()=>edit(b=>{b.rooms[roomIndex].parts[pi].sizes.splice(si,1);})}>×</button></div></div>)}
       <BulkSizes key={p.id} remaining={300-p.sizes.filter(row=>row.width!==''||row.height!==''||row.label.trim()||Number(row.quantity)!==1||row.done).length} disabled={busy} onAdd={rows=>edit(b=>{const part=b.rooms[roomIndex].parts[pi];const kept=part.sizes.filter(row=>row.width!==''||row.height!==''||row.label.trim()||Number(row.quantity)!==1||row.done);if(kept.length+rows.length>300)return;part.sizes=[...kept,...rows.map(row=>({...newSize(),...row}))];})}/>
       <div className={s.actions}><button disabled={busy||p.sizes.length>295} onClick={()=>field(pi,'sizes',[...p.sizes,...Array.from({length:5},()=>newSize())])}>＋ 입력칸 5개 추가</button></div>
       <div className={s.actions}><button disabled={p.sizes.length>=300} onClick={()=>field(pi,'sizes',[...p.sizes,newSize()])}>＋ 치수 추가</button><button disabled={busy || room.parts.length>=200} onClick={()=>edit(b=>{b.rooms[roomIndex].parts.push({...structuredClone(p),id:id(),name:p.name+' 복사',photos:[],sizes:p.sizes.map(size=>({...size,id:id(),done:false}))});})}>부위 복사</button></div>
       {partDetails(p,pi)}
      </section>)}
     </> : <>
      <div className={s.sectionTitle}><h2>{room.name || '새 장소'}</h2><small>{count}개 치수 · 단위 mm</small></div>
      <div className={s.tableHead}><span>부위</span><span>가로 × 세로</span><span>수량</span><span>재단</span></div>
      {room.parts.map((p,pi)=><section className={s.part} key={p.id}>
       <div className={s.partHeading}><strong>{p.name || '이름 없는 부위'}</strong><small>{filmName(p) || '필름 미정'}</small></div>
       {p.sizes.map((size,si)=><div className={`${s.measure} ${size.done?s.done:''}`} key={size.id}><span>{size.label || p.name || '치수 '+(si+1)}</span><strong>{size.width?Number(size.width).toLocaleString('ko-KR'):'—'} × {size.height?Number(size.height).toLocaleString('ko-KR'):'—'}</strong><span>{size.quantity}장</span><input aria-label={`${p.name} ${size.label || si+1} 재단 완료`} type="checkbox" checked={size.done} onChange={e=>sizeField(pi,si,'done',e.target.checked)}/></div>)}
       <details><summary>사진 {p.photos.length} · 메모 {p.memo?1:0} <span>펼치기⌄</span></summary>{partDetails(p,pi)}</details>
       {p.memo && <p className={s.memo} title={p.memo}>메모 · {p.memo}</p>}
      </section>)}
      {!room.parts.length && <p>부위를 추가해 치수를 기록해주세요.</p>}
     </>}
     <button className={s.addPart} disabled={busy || room.parts.length>=200} onClick={()=>{edit(b=>{b.rooms[roomIndex].parts.push(newPart());});setStage('edit');}}>＋ 부위 추가</button>
    </section>
    <div className={s.roomNav}><button disabled={busy || roomIndex===0} onClick={()=>setRoomIndex(i=>i-1)}>← 이전 장소</button><button disabled={busy} onClick={nextRoom}>다음 장소 →</button></div>
    <footer className={s.footer}>{stage==='edit'?<button className={s.primary} disabled={busy} onClick={()=>{if(!room.name.trim()){setError('장소 이름을 입력해주세요.');return;}setError('');setStage('view');window.scrollTo({top:0,behavior:'smooth'});}}>수첩으로 정리</button>:<><button disabled={busy} onClick={()=>setStage('edit')}>✎ 편집</button><button className={s.primary} disabled={busy} onClick={cutting}>재단앱으로 보내기</button></>}</footer>
    <p className={s.hint}>재단앱에는 수첩 전체의 미완료 치수를 보냅니다. 같은 필름의 방향 고정 항목이 있으면 회전을 제한합니다. 재단앱의 완료 체크는 수첩에 자동 반영되지 않습니다.</p>
   </>}
  </>}
  <datalist id="notebook-brands"><option value="영림"/><option value="현대보닥"/><option value="LX 베니프"/><option value="3M"/></datalist>
  {busy && <p role="status">사진·파일을 처리하고 있습니다…</p>}
  </>}
 </main>;
}
