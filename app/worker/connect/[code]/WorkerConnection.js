'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {relationshipRequest as api,relationshipLabel} from '../../../../lib/workerRelationshipClient';
export default function WorkerConnection({code}){
 const [data,setData]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 const lock=useRef(false);
 useEffect(()=>{let active=true;api({action:'preview',code}).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[code]);
 async function act(action){if(lock.current)return;lock.current=true;setBusy(true);try{await api({action,code});setDone(true);setMessage(action==='accept'?'초대를 수락했습니다. 업체 관리자가 본인 계정을 확인하면 연결됩니다.':'초대를 거절했습니다.');}catch(e){setMessage(e.message);}finally{lock.current=false;setBusy(false);}}
 return <main style={{maxWidth:560,margin:'32px auto',padding:24,background:'#fff',borderRadius:20}}>
  <h1>업체 연결 초대</h1>{message&&<p role='status'>{message}</p>}
  {!data&&!done&&<><p>로그인 후 이 초대 링크로 돌아오세요. 링크를 여는 것만으로는 소속이 변경되지 않습니다.</p><Link href={`/worker/login?next=${encodeURIComponent(`/worker/connect/${code}`)}`} data-ui-link="action">로그인</Link><p><Link href="/worker/account" data-ui-link="action">처음 이용하시나요? 시공자 회원가입</Link></p><button onClick={()=>window.location.reload()}>로그인 후 다시 확인</button></>}
  {data&&!done&&<><h2>{data.companyName}</h2><p>{data.workerName}님을 <strong>{relationshipLabel(data.relationshipType)}</strong>으로 초대했습니다.</p>
  <p>수락 후 관리자가 계정을 확인하면 기존 현장 기록과 연결됩니다. 본인 확인을 위해 로그인 이메일이 이 업체 관리자에게 전달됩니다.</p>
  <p>{data.relationshipType==='employee'?'급여는 업체와 정한 기준을 사용합니다. 개인 계정과 다른 업체의 기록은 유지됩니다.':'새 날짜의 현장 배정에는 본인 프로필에 등록한 일당을 적용합니다. 확정된 날짜의 금액은 이후 일당 변경과 관계없이 유지합니다.'}</p>
  {data.relationshipType==='freelancer'&&<p><Link href='/worker/account' data-ui-link="action">내 프로필·등록 일당 확인</Link></p>}
  {data.status==='requested'?<p>관리자의 연결 승인을 기다리고 있습니다.</p>:<button disabled={busy} onClick={()=>act('accept')}>내용 확인 · 초대 수락</button>}
  <button disabled={busy} onClick={()=>act('decline')}>거절</button></>}
  <p><Link href='/worker' data-ui-link="action">시공자 홈으로</Link></p>
 </main>;
}
