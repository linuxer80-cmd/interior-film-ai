"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {supabase} from '../../lib/supabase';
import {pendingConnection} from '../../lib/workerDirectory.mjs';

export const directoryCard={background:'#fff',border:'1px solid #d8dfe5',borderRadius:20,padding:20,margin:'16px 0'};
export const directoryButton={padding:'12px 16px',borderRadius:12,border:'1px solid #c7d4e2',background:'#edf5ff',color:'#163153',fontWeight:700,cursor:'pointer'};
export const directoryInput={width:'100%',padding:12,border:'1px solid #c7d4e2',borderRadius:10,boxSizing:'border-box'};
export const connectionLabel=row=>row.status==='pending'&&!pendingConnection(row)?'만료 또는 이용 불가':({pending:'수락 대기',accepted:'연결 완료',declined:'거절됨',cancelled:'취소됨'}[row.status]||row.status);
export function useDirectory() {
  const [user,setUser]=useState(null),[ready,setReady]=useState(false);
  const identity=useRef(null);
  useEffect(()=>{
    let live=true;
    const sync=s=>{if(live){identity.current=s?.user?.id||null;setUser(identity.current);setReady(true);}};
    supabase.auth.getSession().then(({data})=>sync(data.session));
    const {data}=supabase.auth.onAuthStateChange((_e,s)=>sync(s));
    return()=>{live=false;identity.current=null;data.subscription.unsubscribe();};
  },[]);
  const api=useCallback(async (query='',body)=>{
    const expected=identity.current;
    const {data}=await supabase.auth.getSession();
    if(!expected || data.session?.user?.id!==expected) throw Error('로그인 후 이용해주세요.');
    const response=await fetch('/api/worker-directory'+query,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${data.session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();
    if(identity.current!==expected) throw Error('계정이 변경되었습니다.');
    if(!response.ok) throw Error(result.error||'처리하지 못했습니다.');
    return result;
  },[]);
  return {user,ready,api};
}
export default function WorkerConnectionPanel({compact=false,reviewOnly=false}) {
  const {user,api}=useDirectory();
  const pathname=usePathname();
  if(reviewOnly&&pathname==='/worker/account')return null;
  return user?<ConnectionInbox key={user} api={api} compact={compact} reviewOnly={reviewOnly}/>:null;
}
function ConnectionInbox({api,compact,reviewOnly}) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const live=useRef(true);
  const refresh=useCallback(async()=>{try{const next=await api('?mode=mine');if(live.current){setData(next);setError('');}}catch(e){if(live.current)setError(e.message);}},[api]);
  useEffect(()=>{live.current=true;refresh();const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{live.current=false;clearInterval(timer);window.removeEventListener('focus',refresh);};},[refresh]);
  const act=async body=>{setBusy(true);setError('');try{await api('',body);await refresh();}catch(e){if(live.current)setError(e.message);}finally{if(live.current)setBusy(false);}};
  const pending=(data?.requests||[]).filter(row=>pendingConnection(row));
  if(reviewOnly) return null;
  if(compact) return pending.length?<a href='/worker/account#company-connections' style={{...directoryCard,display:'block',color:'#163153',fontWeight:800}}>업체 연결 요청 {pending.length}건 · 확인하기 →</a>:null;
  return <section id='company-connections' style={directoryCard}>
    <h2>업체 검색 · 연결 요청</h2>
    <p>로그인한 업체 관리자에게 활동 지역·경력·전문 분야·소개를 표시합니다. 연결 전에는 이름을 가리고 사진·일당·연락처는 표시하지 않습니다.</p>
    <label><input type='checkbox' checked={data?.visible===false} disabled={busy||!data||!data.has_profile} onChange={e=>act({action:'consent',visible:!e.target.checked})}/> 업체 검색에서 내 프로필 숨기기</label>
    <p style={{color:'#667085'}}>연락처·계좌·주소는 검색에 공개되지 않습니다. 공개를 해제하면 대기 중인 연결 요청도 취소됩니다. 기본 프로필을 저장하면 기본적으로 검색에 표시됩니다. 숨기기는 언제든 변경할 수 있습니다.</p>
    <button type='button' style={directoryButton} disabled={busy} onClick={refresh}>새로고침</button>
    {error&&<p role='alert'>{error}</p>}
    {data&&!data.requests?.length&&<p>받은 업체 연결 요청이 없습니다.</p>}
    {(data?.requests||[]).map(row=><article key={row.id} style={directoryCard}>
      <strong>{row.company_name} · {row.relationship_type==='employee'?'직원':'프리랜서'} 연결 요청</strong>
      <p>{connectionLabel(row)} · 만료 {new Date(row.expires_at).toLocaleDateString('ko-KR')}</p>
      {row.message&&<p style={{whiteSpace:'pre-wrap'}}>{row.message}</p>}
      {pendingConnection(row)&&<><p>수락하면 이 업체에 이름·연락처·기본 일당을 공유하고 시공자로 연결됩니다.</p>
      <button type='button' style={directoryButton} disabled={busy} onClick={()=>{if(window.confirm(`${row.company_name}에 이름·연락처·기본 일당을 공유하고 ${row.relationship_type==='employee'?'직원':'프리랜서'}로 연결하시겠습니까?`))act({action:'accept',id:row.id,revision:row.revision,consent:true});}}>동의하고 연결 수락</button>{' '}
      <button type='button' style={directoryButton} disabled={busy} onClick={()=>act({action:'decline',id:row.id,revision:row.revision})}>거절</button></>}
    </article>)}
  </section>;
}
