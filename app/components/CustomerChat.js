'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabase';
import styles from './CustomerChat.module.css';
export async function chatRequest(url,body,admin=false){
  const headers={};if(admin){const {data}=await supabase.auth.getSession();if(!data.session)throw Error('관리자 로그인이 필요합니다.');headers.Authorization=`Bearer ${data.session.access_token}`;}
  const multipart=body instanceof FormData;
  if(body&&!multipart)headers['Content-Type']='application/json';
  const response=await fetch(url,{method:body?'POST':'GET',headers,body:body?(multipart?body:JSON.stringify(body)):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'채팅을 불러오지 못했습니다.');return result;
}
export function ChatConversation({url,admin=false,onUpdated}){
  const [messages,setMessages]=useState([]),[thread,setThread]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[older,setOlder]=useState(false),[loadingOlder,setLoadingOlder]=useState(false);
  const [photo,setPhoto]=useState(null),[preview,setPreview]=useState(''),[preparing,setPreparing]=useState(false);
  const [text,setText]=useState(''),[name,setName]=useState(''),[consent,setConsent]=useState(false);
  const list=useRef(null), pending=useRef(null), sending=useRef(false),alive=useRef(true),generation=useRef(0),nearBottom=useRef(true),historyLoaded=useRef(false),readAt=useRef(null);
  const refresh=useCallback(async()=>{
    const version=++generation.current;
    try{const data=await chatRequest(url,null,admin);if(!alive.current||version!==generation.current)return;
      setThread(data.thread);setReady(true);setError('');
      setMessages(previous=>{const map=new Map(previous.map(m=>[m.id,m]));for(const m of data.messages)map.set(m.id,m);return [...map.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));});
      if(!historyLoaded.current)setOlder(data.hasOlder);
      if(admin&&data.thread?.last_customer_at&&readAt.current!==data.thread.last_customer_at){await chatRequest(url,{action:'read',seenAt:data.thread.last_customer_at},true);readAt.current=data.thread.last_customer_at;}
    }catch(e){if(alive.current&&version===generation.current)setError(e.name==='TimeoutError'?'연결이 지연됩니다. 다시 시도해주세요.':e.message);}
  },[url,admin]);
  useEffect(()=>{alive.current=true;refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},5000);return()=>{alive.current=false;generation.current++;clearInterval(timer);};},[refresh]);
  useEffect(()=>{if(nearBottom.current&&list.current)list.current.scrollTop=list.current.scrollHeight;},[messages]);
  async function loadOlder(){if(loadingOlder||!messages.length)return;setLoadingOlder(true);try{const data=await chatRequest(url+'&before='+encodeURIComponent(messages[0].created_at),null,admin);if(!alive.current)return;setMessages(previous=>{const map=new Map([...data.messages,...previous].map(m=>[m.id,m]));return [...map.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at));});historyLoaded.current=true;setOlder(data.hasOlder);}catch(e){setError(e.message);}finally{setLoadingOlder(false);}}
  useEffect(()=>{if(!photo){setPreview('');return;}const url=URL.createObjectURL(photo);setPreview(url);return()=>URL.revokeObjectURL(url);},[photo]);
  async function choosePhoto(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024){setError('JPG·PNG·WebP 사진을 선택해주세요. 원본은 20MB까지 가능합니다.');return;}
    setPreparing(true);setError('');
    let objectUrl;
    try{
      const img=new Image();objectUrl=URL.createObjectURL(file);img.src=objectUrl;await img.decode();
      const ratio=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.82));
      if(!blob||blob.size>2*1024*1024)throw Error('사진을 줄이지 못했습니다. 다른 사진을 선택해주세요.');
      if(alive.current){pending.current=null;setPhoto(new File([blob],'chat-photo.jpg',{type:'image/jpeg'}));}
    }catch(e){if(alive.current)setError(e.message||'사진을 읽지 못했습니다.');}finally{if(objectUrl)URL.revokeObjectURL(objectUrl);if(alive.current)setPreparing(false);}
  }
  async function send(event){event.preventDefault();if(sending.current||preparing||(!text.trim()&&!photo))return;sending.current=true;setBusy(true);setError('');
    if(!pending.current||pending.current.text!==text.trim())pending.current={messageId:crypto.randomUUID(),text:text.trim()};
    try{let payload={...pending.current,name,consent};if(photo){const form=new FormData();for(const [key,value] of Object.entries(payload))form.append(key,String(value));form.append('photo',photo);payload=form;}await chatRequest(url,payload,admin);if(!alive.current)return;setText('');setPhoto(null);pending.current=null;nearBottom.current=true;await refresh();onUpdated?.();}catch(e){if(alive.current)setError(e.message);}finally{sending.current=false;if(alive.current)setBusy(false);}}
  return <div className={styles.chat}>
    <div className={styles.messages} ref={list} role="log" aria-live="polite" aria-label="대화 내용" onScroll={()=>{const el=list.current;nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}}>
      {older&&<button className={styles.older} disabled={loadingOlder} onClick={loadOlder}>{loadingOlder?'불러오는 중…':'이전 대화 보기'}</button>}
      {!messages.length&&<p className={styles.notice}>{ready?'궁금한 내용을 남겨주세요. 담당자가 확인 후 답장합니다.':'대화를 불러오는 중…'}</p>}
      {messages.map(m=><div key={m.id} className={`${styles.bubble} ${(m.sender==='owner')===admin?styles.mine:''}`}><small>{m.sender==='owner'?'담당 관리자':'고객'}</small>{m.has_image&&(m.image_url?<a href={m.image_url} target="_blank" rel="noopener noreferrer" aria-label="사진 크게 보기"><img className={styles.photo} src={m.image_url} alt="채팅으로 보낸 사진" loading="lazy" /></a>:<span>사진을 불러오지 못했습니다. 다시 확인을 눌러주세요.</span>)}{m.body}<small>{new Date(m.created_at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small></div>)}
    </div>
    {error&&<p className={styles.error} role="alert">{error} <button type="button" onClick={refresh}>다시 확인</button></p>}
    <form className={styles.form} onSubmit={send}>
      {!admin&&!thread&&<><input type="text" aria-label="이름 또는 별명" placeholder="이름 또는 별명" maxLength={60} value={name} onChange={e=>setName(e.target.value)} required/><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> 이름·대화내용을 문의 응대 목적으로 해당 업체에 전달하고 저장하는 데 동의합니다. 민감한 정보는 입력하지 마세요.</label></>}
      {preview&&<div className={styles.attachment}><img src={preview} alt="전송할 사진"/><button type="button" disabled={busy} onClick={()=>{setPhoto(null);pending.current=null;}}>사진 제거</button></div>}
      <label className={styles.photoButton}>{preparing?'사진 준비 중…':'＋ 사진 첨부'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||preparing||!ready} onChange={choosePhoto}/></label>
      <textarea aria-label="메시지" placeholder="문의 내용을 입력하세요" maxLength={2000} value={text} onChange={e=>setText(e.target.value)} disabled={busy}/>
      <button disabled={busy||preparing||!ready||(!text.trim()&&!photo)||(!admin&&!thread&&(!consent||!name.trim()))}>{busy?'보내는 중…':'보내기'}</button>
    </form>
  </div>;
}
export default function CustomerChat({slug,companyName}){
  const [open,setOpen]=useState(false);const trigger=useRef(null);
  useEffect(()=>{if(!open)return;const escape=e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[open]);
  return <>{!open&&<button ref={trigger} className={styles.launcher} onClick={()=>setOpen(true)}>채팅 문의</button>}{open&&<section className={styles.panel} role="dialog" aria-label="업체 채팅 문의"><header className={styles.header}><div><h2>{companyName || '담당 관리자'}</h2><small>고객 문의 채팅 · 자동 새로고침</small></div><button autoFocus onClick={()=>{setOpen(false);setTimeout(()=>trigger.current?.focus(),0);}}>닫기</button></header><p className={styles.notice}>답장은 이 페이지에서 확인해주세요. 같은 브라우저에서 대화가 이어지며 쿠키를 삭제하면 이전 대화를 다시 볼 수 없습니다.</p><ChatConversation key={slug} url={'/api/customer-chat?slug='+encodeURIComponent(slug)}/></section>}</>;
}
