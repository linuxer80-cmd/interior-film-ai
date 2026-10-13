'use client';
import {useEffect,useRef,useState} from 'react';
import {relationshipRequest as api,relationshipLabel} from '../../../lib/workerRelationshipClient';
export default function WorkerRelationships({workers=[]}) {
 const [data,setData]=useState(null),[workerId,setWorkerId]=useState(''),[type,setType]=useState('employee');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[url,setUrl]=useState('');
 const selectedWorker=workers.find(w=>w.id===workerId);
 const lock=useRef(false);
 async function load(){setData(await api({action:'list'}));}
 useEffect(()=>{let active=true;api({action:'list'}).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[]);
 async function act(body){
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
  try{const result=await api(body);await load();
   if(result.code)setUrl(`${window.location.origin}/worker/connect/${result.code}`);
   else setUrl('');
   setMessage(body.action==='approve'?'계정 연결을 완료했습니다. 시공자 목록을 새로고침해주세요.':body.action==='end'?'거래를 종료했습니다. 기존 기록은 유지됩니다. 목록을 새로고침해주세요.':'처리했습니다.');
  }catch(e){setMessage(e.message);}finally{lock.current=false;setBusy(false);}
 }
 return <details style={{padding:16,background:'#fff',border:'1px solid #dce2e6',borderRadius:16,marginBottom:16}}>
  <summary style={{fontWeight:800,cursor:'pointer'}}>직원·협력 시공자 연결 관리</summary>
  <p>시공자를 명단에 등록한 뒤 관계를 선택해 초대하세요. 본인이 수락하고 관리자가 요청 계정을 확인하면 연결됩니다.</p>
  {message&&<p role='status'>{message}</p>}
  {data&&<><fieldset disabled={busy} style={{border:0,padding:0,display:'grid',gap:10}}>
   <label>등록된 시공자<select value={workerId} onChange={e=>{setWorkerId(e.target.value);setUrl('');}} style={{width:'100%',padding:12}}><option value=''>선택해주세요</option>{workers.filter(w=>w.is_active!==false).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
   <label>우리 업체와의 관계<select value={type} onChange={e=>{setType(e.target.value);setUrl('');}} style={{width:'100%',padding:12}}><option value='employee'>업체 소속 직원</option><option value='freelancer'>협력 시공자·프리랜서</option></select></label>
   <div role='status' style={{padding:12,background:'#f1f5f9',borderRadius:10,fontSize:13}}>{type==='employee'?`소속 직원: 업체가 설정한 일당${selectedWorker?.daily_wage!=null?` ${Number(selectedWorker.daily_wage).toLocaleString('ko-KR')}원`:''}을 기준으로 관리합니다.`:'협력 프리랜서: 시공자 본인의 프로필 등록 일당을 기본으로 사용합니다. 업체에 저장된 직원 일당을 자동으로 적용하지 않습니다.'}<p style={{margin:'6px 0 0'}}>프리랜서 일당은 새 현장 날짜를 배정할 때 확정·보존됩니다. 이후 개인 일당을 변경해도 이미 확정된 날짜의 금액은 바뀌지 않습니다.</p></div>
   <button type='button' disabled={!workerId||busy} onClick={()=>{if(window.confirm(`${selectedWorker?.name||'시공자'}님을 ${relationshipLabel(type)}으로 초대할까요?`))act({action:'invite',workerId,relationshipType:type});}}>초대 링크 만들기 · 7일 유효</button>
   {url&&<label>초대 링크<input readOnly value={url} onFocus={e=>e.target.select()} style={{width:'100%',padding:12}}/><button type='button' onClick={async()=>{try{await navigator.clipboard.writeText(url);setMessage('초대 링크를 복사했습니다.');}catch{setMessage('초대 링크를 길게 눌러 복사해주세요.');}}}>링크 복사</button></label>}
  </fieldset>
  <h4>초대·계정 확인 대기</h4>
  {!data.invites.length&&<p>진행 중인 초대가 없습니다.</p>}
  {data.invites.map(i=><article key={i.id} style={{borderTop:'1px solid #eee',padding:'12px 0'}}>
   <b>{workers.find(w=>w.id===i.worker_id)?.name||'시공자'} · {relationshipLabel(i.relationship_type)}</b>
   <p>{i.status==='requested'?`수락한 계정: ${i.claimant_email||'이메일 확인 필요'}`:'초대 수락 대기'}</p>
   {i.status==='requested'&&<><small>초대받은 본인의 계정인지 직접 확인한 뒤 승인해주세요.</small><button disabled={busy} onClick={()=>{if(window.confirm(`${i.claimant_email} 계정이 초대한 시공자 본인인지 확인하셨나요?`))act({action:'approve',code:i.id});}}>본인 확인 · 연결 승인</button></>}
   <button disabled={busy} onClick={()=>act({action:'cancel',code:i.id})}>초대 취소</button>
  </article>)}
  <h4>연결된 관계</h4>
  {data.relationships.map(r=><article key={r.worker_id} style={{padding:'10px 0'}}><b>{workers.find(w=>w.id===r.worker_id)?.name||'시공자'}</b> · {relationshipLabel(r.relationship_type)} · {r.ended_at?'거래 종료':'연결 완료'}{!r.ended_at&&<button disabled={busy} onClick={()=>{if(window.confirm('새 배정을 중지하고 거래를 종료할까요? 과거 기록은 유지됩니다.'))act({action:'end',workerId:r.worker_id});}}>거래 종료</button>}</article>)}
  <small>관계를 지정하지 않은 기존 시공자의 급여와 계정 연결은 유지됩니다.</small></>}
 </details>;
}
