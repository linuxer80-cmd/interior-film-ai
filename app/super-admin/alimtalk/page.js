"use client";
import {useEffect,useRef,useState} from 'react';
import SolapiBalanceCard from '../SolapiBalanceCard';
import {supabase} from '../../../lib/supabase';
const labels={reserved:'접수 확인 중',requested:'발송 요청됨',unknown:'결과 확인 필요',success:'발송 완료',failed:'실패',rejected:'접수 거절',canceled:'취소'};
export default function AlimtalkAdmin(){
  const [companyId,setCompanyId]=useState(''),[data,setData]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[quantity,setQuantity]=useState(''),[reason,setReason]=useState(''),[confirm,setConfirm]=useState(false);
  const lock=useRef(false),operation=useRef(null);
  async function api(method,body,id=companyId){
    const session=await supabase.auth.getSession();if(!session.data?.session)throw Error('슈퍼관리자로 로그인해주세요.');
    const response=await fetch('/api/super-admin/alimtalk'+(method==='GET'&&id?'?companyId='+id:''),{method,headers:{Authorization:'Bearer '+session.data.session.access_token,'Content-Type':'application/json'},cache:'no-store',...(body?{body:JSON.stringify({...body,companyId:id})}:{})});
    const result=await response.json();if(!response.ok)throw Error(result.error);return result;
  }
  async function load(id){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');setData(null);try{setData(await api('GET',null,id));setCompanyId(id);}catch(e){setMessage(e.message);}finally{lock.current=false;setBusy(false);}}
  useEffect(()=>{load('');},[]);
  async function change(body){
    if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
    try{await api('POST',body);setData(await api('GET'));setMessage('저장했습니다.');setQuantity('');setReason('');setConfirm(false);operation.current=null;}
    catch(e){setMessage(e.message);}finally{lock.current=false;setBusy(false);}
  }
  return <main><a href="/super-admin">← 슈퍼관리자</a><h1>알림톡 운영 관리</h1><p>업체별 사용 여부·충전 횟수·발송 결과를 관리합니다. 이 화면은 결제를 실행하지 않습니다.</p>
    <SolapiBalanceCard />
    <label>업체<select value={companyId} disabled={busy} onChange={e=>{setCompanyId(e.target.value);setConfirm(false);operation.current=null;load(e.target.value);}}><option value="">업체 선택</option>{data?.companies?.map(c=><option key={c.id} value={c.id}>{c.company_name}{!c.is_active?' · 비활성':''}</option>)}</select></label>
    {busy&&<p role="status">처리 중…</p>}{message&&<p role="status">{message}</p>}
    {companyId&&data?.account&&<>
      <section><h2>잔여 {data.account.unlimited?'무제한':data.account.available_count.toLocaleString('ko-KR')+'회'}</h2><label><input type="checkbox" disabled={busy} checked={data.account.enabled} onChange={e=>change({action:'enabled',enabled:e.target.checked})}/>업체 알림톡 사용</label><p>첫 시공일 전날 낮 12~1시에 고객에게 자동 안내합니다. {data.account.unlimited?'운영 업체는 충전 없이 이용합니다.':'고객 안내·시공자 배정 발송마다 1회 사용하며, 실패가 확정되면 1회가 복구됩니다.'}</p></section>
      {!data.account.unlimited&&<section><h2>충전 횟수 반영</h2><p>입금 확인이나 승인된 지급 건을 확인한 뒤 반영해주세요.</p><label>추가 횟수<input type="number" min="1" max="1000000" value={quantity} onChange={e=>{setQuantity(e.target.value);setConfirm(false);operation.current=null;}}/></label><label>입금 확인·지급 사유<input maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);setConfirm(false);operation.current=null;}}/></label>
      <label><input type="checkbox" checked={confirm} disabled={busy} onChange={e=>setConfirm(e.target.checked)}/>선택 업체와 추가 횟수를 확인했습니다.</label><button disabled={busy||!confirm||!Number.isInteger(Number(quantity))||Number(quantity)<1||Number(quantity)>1000000||reason.trim().length<3} onClick={()=>{operation.current ||= crypto.randomUUID();change({action:'grant',quantity:Number(quantity),reason,operationId:operation.current});}}>충전 반영</button></section>}
      <section><h2>발송 이력</h2><button disabled={busy} onClick={()=>load(companyId)}>결과 새로고침</button>{data.syncWarning&&<p>{data.syncWarning}</p>}{data.deliveries.map(row=><article key={row.id}><strong>{row.kind==='worker_schedule_changed'?'시공자 일정 변경':row.kind==='worker_canceled'?'시공자 배정 취소':row.kind==='worker_reminder'?'시공자 전날 안내':row.kind==='customer_reminder'?'고객 전날 안내':row.kind==='customer_schedule'?'고객 일정':'시공자 배정'} · {labels[row.status]||row.status}</strong><p>{row.recipient_mask} · {new Date(row.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}{row.accounting==='refunded'&&!row.credit_exempt?' · 1회 복구':''}</p>
      {row.accounting==='reserved'&&!row.receipt_id&&<details><summary>솔라피 접수 결과 대조</summary><p>솔라피 발송 내역에서 customFields.deliveryId가 아래 요청 ID와 같은 메시지 ID만 입력해주세요.</p><code>{row.id}</code><form onSubmit={e=>{e.preventDefault();change({action:'reconcile',deliveryId:row.id,receiptId:new FormData(e.currentTarget).get('receiptId')});}}><input name="receiptId" required placeholder="솔라피 메시지 ID"/><button disabled={busy}>접수 결과 확인</button></form></details>}</article>)}</section>
      <section><h2>충전 이력</h2>{data.entries.map(row=><p key={row.id}>{new Date(row.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · +{row.quantity}회 · {row.reason}</p>)}</section>
    </>}
    <style jsx>{`main{max-width:780px;margin:auto;padding:24px 16px;color:#263c31}section{padding:18px;margin:18px 0;background:#f8f7f3;border:1px solid #dfe5db;border-radius:14px}h1{font-size:25px}h2{font-size:18px}p,label,article{font-size:14px;line-height:1.7;overflow-wrap:anywhere}label{display:block;margin:12px 0}input:not([type=checkbox]),select{display:block;box-sizing:border-box;width:100%;padding:12px;font:inherit;border:1px solid #cbd8cd;border-radius:8px}button{min-height:44px;padding:10px 14px;font:inherit;background:#285340;color:white;border:0;border-radius:9px;cursor:pointer}button:disabled{opacity:.5}article{padding:12px 0;border-bottom:1px solid #dfe5db}code{overflow-wrap:anywhere}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #315c91;outline-offset:3px}`}</style>
  </main>;
}
