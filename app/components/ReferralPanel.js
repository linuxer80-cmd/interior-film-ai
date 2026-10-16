'use client';
import {useEffect,useRef,useState} from 'react';
import {useAchievementApi} from './AchievementBadges';
export default function ReferralPanel({scope='worker',onChanged}) {
 const {user,ready,api}=useAchievementApi();
 const apiRef=useRef(api);apiRef.current=api;
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false),listRef=useRef(null);
 useEffect(()=>{let alive=true;setData(null);if(user)apiRef.current('/api/referrals',{action:'get',scope}).then(r=>{if(alive)setData(r);}).catch(e=>{if(alive)setMessage(e.message);});return()=>{alive=false;};},[user,scope]);
 async function act(action,token) {
  if(lock.current)return; lock.current=true;setBusy(true);setMessage('');
  try {
   if(action==='create') {
    await apiRef.current('/api/referrals',{action,scope});
    const list=await apiRef.current('/api/referrals',{action:'get',scope});setData(list);
    setMessage('링크를 만들었습니다. 아래 복사·공유 버튼으로 한 사람에게 보내주세요.');
   } else {
    const url=`${window.location.origin}/invite/${token}`;
    if(action==='share' && navigator.share) await navigator.share({title:'필름장이 초대',text:'필름장이에서 현장 관리와 AI 기능을 함께 사용해보세요.',url});
    else await navigator.clipboard.writeText(url);
    const r=await apiRef.current('/api/referrals',{action:'shared',scope,token});setData(r);
    setMessage('초대를 기록했습니다. 달성한 배지와 보상을 확인해주세요.');onChanged?.();
   }
  }catch(e){if(e.name!=='AbortError')setMessage(e.message||'복사·공유에 실패했습니다. 다시 시도해주세요.');}
  finally{lock.current=false;setBusy(false);}
 }
 if(!ready)return <p>로그인 확인 중…</p>;
 if(!user)return <p><a href='/login'>로그인</a> 후 초대 링크를 만들 수 있습니다.</p>;
 const links=data?.links||[];
 const date=value=>new Date(value).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'});
 const linkRow=(r,i)=><div className='invite-row' key={r.token}>
  <div className='row-heading'><strong>{i===0?'최근 만든 초대':'초대 링크'}</strong><span className={r.joined_at?'status joined':'status'}>{r.joined_at?'가입 완료':new Date(r.expires_at)<new Date()?'기간 만료':r.shared_at?'가입 대기':'공유 대기'}</span></div>
  <small>{date(r.created_at)} 생성 · {date(r.expires_at)}까지</small>
  {!r.joined_at&&new Date(r.expires_at)>new Date()&&<div className='share-actions'><button disabled={busy} onClick={()=>act('copy',r.token)}>링크 복사</button><button className='share-button' disabled={busy} onClick={()=>act('share',r.token)}>친구에게 공유 ↗</button></div>}
 </div>;
 return <section className='achievement-panel referral-card' aria-label='친구 초대'>
  <header><span className='invite-icon' aria-hidden='true'><svg width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round'><path d='M3 9h18v4H3zM5 13v8h14v-8M12 9v12'/><path d='M12 9H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z'/></svg></span><div><small className='kicker'>함께 쓰는 필름장이</small><h2>친구 초대 · AI 보상</h2></div></header>
  <p className='intro'>친구와 함께 시작하고<br/>배지와 무료 AI 횟수를 받아보세요.</p>
  <div className='stats'><div><small>보낸 초대</small><strong>{data?data.metrics?.[scope+'_referral_shared']||0:'—'}<span>회</span></strong></div><div><small>가입한 친구</small><strong>{data?data.metrics?.[scope+'_referral_joined']||0:'—'}<span>명</span></strong></div></div>
  <button className='create-button' disabled={busy} onClick={()=>act('create')}>{busy?'처리 중…':'＋ 새 친구 초대하기'}</button>
  <small className='link-note'>한 사람만 사용할 수 있는 링크 · 30일 유효</small>
  {message&&<p className='message' role='status'>{message}</p>}
  {links[0]&&linkRow(links[0],0)}
  {links.length>1&&<details ref={listRef} className='history'><summary>이전 초대 내역 <span>{links.length-1}개</span></summary>{links.slice(1).map((r,i)=>linkRow(r,i+1))}</details>}
  <details className='guide'><summary>보상은 어떻게 받나요?</summary><p>링크 복사·공유 → 초대 배지<br/>친구 신규 가입·이메일 인증 → 가입 배지</p><small>같은 링크는 한 번만 집계합니다. 복사·공유 완료 기준이며 실제 발송·열람 여부는 확인하지 않습니다. 배지별 보상은 아래에서 확인하세요.</small></details>
 <style jsx>{`
  .referral-card {margin:16px 0;padding:20px;color:#203c48;}
  header {display:flex;gap:12px;align-items:center;}
  .invite-icon {display:flex;align-items:center;justify-content:center;width:48px;height:48px;flex-shrink:0;background:#f6edda;color:#8c6928;border-radius:15px;}
  .kicker {color:#8c6928;font-size:11px;}
  h2 {font-size:19px;line-height:1.4;margin:3px 0 0;}
  .intro {font-size:14px;line-height:1.7;color:#65716f;margin:14px 0;}
  .stats {display:grid;grid-template-columns:1fr 1fr;background:#f2f5f1;border-radius:14px;margin-bottom:14px;padding:12px 0;text-align:center;}
  .stats>div+div {border-left:1px solid #dce4dc;}
  .stats strong {display:block;font-size:26px;line-height:1.4;}
  .stats strong span {font-size:12px;margin-left:4px;font-weight:400;}
  small {display:block;font-size:12px;color:#6b7877;line-height:1.6;}
  button {min-height:46px;padding:11px 14px;border:1px solid #c9d5d8;border-radius:12px;background:#fffdf8;color:#203c48;font:inherit;font-size:14px;font-weight:700;cursor:pointer;}
  button.create-button {width:100%;background:#203f4b;color:white;border-color:#203f4b;}
  button:disabled {opacity:.55;cursor:wait;}
  button:focus-visible,summary:focus-visible {outline:3px solid #297d92;outline-offset:3px;}
  .link-note {text-align:center;margin:7px 0 14px;}
  .invite-row {padding:14px;background:#fff;border:1px solid #e0e5de;border-radius:14px;margin:10px 0;}
  .row-heading {display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;}
  .row-heading strong {font-size:14px;}
  .status {font-size:11px;color:#6c7065;background:#f4f2eb;border-radius:20px;padding:4px 8px;white-space:nowrap;}
  .status.joined {background:#e8f5ed;color:#25766b;}
  .share-actions {display:grid;grid-template-columns:1fr 1.4fr;gap:8px;margin-top:10px;}
  button.share-button {background:#edf5f1;border-color:#c6dbd1;color:#246658;}
  .message {padding:12px;border-radius:12px;background:#edf5f1;font-size:13px;line-height:1.6;}
  summary {font-size:13px;cursor:pointer;padding:12px 0;color:#526763;}
  summary span {font-size:11px;margin-left:4px;}
  .guide {border-top:1px solid #e2e5dd;margin-top:10px;}
  .guide p {font-size:13px;line-height:1.8;margin:0 0 8px;}
 `}</style>
 </section>;
}
