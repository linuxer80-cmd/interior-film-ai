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
    const list=await apiRef.current('/api/referrals',{action:'get',scope});setData(list);if(listRef.current)listRef.current.open=true;
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
 return <section className='achievement-panel'>
  <h2>친구 초대하고 AI 보상 받기</h2>
  <p>초대 {data?.metrics?.[scope+'_referral_shared']||0}회 · 실제 가입 {data?.metrics?.[scope+'_referral_joined']||0}명</p>
  <p>한 사람당 새 링크를 보내주세요. 링크는 30일 동안 유효하며 신규 가입자 한 명만 사용할 수 있습니다.</p>
  <button disabled={busy} onClick={()=>act('create')}>일회용 초대 링크 만들기</button>
  {message&&<p role='status'>{message}</p>}
  <details ref={listRef}><summary>최근 초대 링크 {data?.links?.length||0}개</summary>
   {(data?.links||[]).map((r,i)=><div key={r.token} style={{padding:'10px 0',borderBottom:'1px solid #e2e8f0'}}>
    <strong>초대 {i+1} · {r.joined_at?'가입 완료':new Date(r.expires_at)<new Date()?'만료':r.shared_at?'초대 완료 · 가입 대기':'공유 대기'}</strong>
    <small style={{display:'block'}}>생성 {new Date(r.created_at).toLocaleDateString('ko-KR')} · 만료 {new Date(r.expires_at).toLocaleDateString('ko-KR')}</small>
    {!r.joined_at&&new Date(r.expires_at)>new Date()&&<div><button disabled={busy} onClick={()=>act('copy',r.token)}>링크 복사</button> <button disabled={busy} onClick={()=>act('share',r.token)}>공유</button></div>}
   </div>)}
  </details>
  <small>복사·공유 완료를 초대 1회로 인정합니다. 실제 발송·열람 여부는 확인하지 않습니다. 같은 링크는 한 번만 집계하며 실제 가입 배지는 신규 계정·이메일 인증 완료 기준입니다.</small>
 <style jsx>{`
  button {min-height:44px;padding:10px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#eff6ff;color:#163153;cursor:pointer;margin:4px 0;}
  button:disabled {opacity:.5;cursor:wait;} summary {padding:12px 0;cursor:pointer;font-weight:700;} p {font-size:14px;line-height:1.6;} small {display:block;color:#64748b;line-height:1.6;}
 `}</style>
 </section>;
}
