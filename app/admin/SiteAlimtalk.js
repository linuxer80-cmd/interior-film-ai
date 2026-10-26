"use client";
import {useEffect,useRef,useState} from 'react';
import {ALIMTALK_UNIT_PRICE,ALIMTALK_PACKAGES} from '../../lib/alimtalkPricing.mjs';
import {supabase} from '../../lib/supabase';
const labels={reserved:'접수 확인 중',requested:'발송 요청됨',unknown:'결과 확인 필요',success:'발송 완료',failed:'발송 실패',rejected:'접수 거절',canceled:'발송 취소'};
const date=value=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
async function api(method,siteId,body){
  const session=await supabase.auth.getSession();
  if(session.error||!session.data?.session)throw Error('관리자로 다시 로그인해주세요.');
  const response=await fetch('/api/admin/site-alimtalk'+(method==='GET'?'?siteId='+encodeURIComponent(siteId):''),{
    method,headers:{Authorization:'Bearer '+session.data.session.access_token,'Content-Type':'application/json'},cache:'no-store',
    ...(body?{body:JSON.stringify({...body,siteId})}:{})});
  const result=await response.json();if(!response.ok)throw Error(result.error||result.reason||'알림톡 요청을 처리하지 못했습니다.');return result;
}
export default function SiteAlimtalk({siteId,active=true,blocked=false}){
  const [open,setOpen]=useState(false),[data,setData]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[resend,setResend]=useState(false);
  const lock=useRef(false),operation=useRef(null),current=useRef(siteId),panel=useRef(null);
  current.current=siteId;
  useEffect(()=>{if(open&&active)panel.current?.focus();},[open,active]);
  async function load(){
    if(lock.current)return;lock.current=true;setBusy(true);setNotice('');const id=siteId;
    try{const result=await api('GET',id);if(current.current!==id)return;setData(result);setResend(false);operation.current=crypto.randomUUID();}
    catch(error){if(current.current===id){setData(null);setNotice(error.message);}}
    finally{lock.current=false;if(current.current===id)setBusy(false);}
  }
  async function send(){
    if(lock.current||blocked||!data?.ready||Boolean(data.latestId&&!resend))return;
    lock.current=true;setBusy(true);setNotice('');const id=siteId;
    // A lost response keeps this operation ID; retry cannot create another paid send.
    try{
      const result=await api('POST',id,{operationId:operation.current,contentHash:data.contentHash,latestId:data.latestId,confirmResend:resend});
      if(current.current!==id)return;setNotice(result.reason);setData(null);setResend(false);
    }catch(error){if(current.current===id){setNotice(error.message);setData(null);}}
    finally{lock.current=false;if(current.current===id)setBusy(false);}
  }
  return <section className="alimtalk" hidden={!active} aria-label="고객 알림톡">
    <button className="open" type="button" disabled={busy||blocked} aria-expanded={open} onClick={()=>{if(open)setOpen(false);else{setOpen(true);load();}}}>고객 알림톡 보내기 {open?'−':'＋'}</button>
    {blocked&&<p>현장 기본정보를 저장한 후 알림톡을 확인해주세요.</p>}
    {open&&<div ref={panel} tabIndex={-1} className="panel">
      <h3>시공 일정 안내</h3><p>현장에 저장된 고객 번호로 발송합니다. {data?.unlimited?'운영 업체는 충전 없이 이용합니다.':'발송 1건당 충전 횟수 1회를 사용합니다.'}</p>
      {busy&&<p role="status">{data?'발송을 요청하고 있습니다…':'최신 정보와 발송 상태를 확인하고 있습니다…'}</p>}
      {notice&&<p role="status" className="notice">{notice}</p>}
      {data&&<>
        <p><strong>{data.customerName||'고객명 미입력'}</strong> · {data.to||'유효한 휴대폰 번호 없음'}</p>
        <p>시공 일정 확정 시 1회, 첫 시공일 하루 전 낮 12시부터 1시 사이에 고객에게 자동 안내합니다. {data.unlimited?'운영 업체는 충전 없이 이용합니다.':'발송 시 1회가 사용됩니다.'}</p>
        <p>알림톡 잔여 <strong>{data.unlimited?'무제한':data.availableCount.toLocaleString('ko-KR')+'회'}</strong></p>
        {!data.unlimited&&<details><summary>알림톡 충전 안내 · 1건 {ALIMTALK_UNIT_PRICE}원</summary><p>충전 금액은 결제 총액 기준입니다. 발송마다 1회를 사용하며 실패가 확정되면 복구됩니다.</p><ul>{ALIMTALK_PACKAGES.map(pack=><li key={pack.quantity}>{pack.quantity.toLocaleString('ko-KR')}건 · {pack.amount.toLocaleString('ko-KR')}원</li>)}</ul><p>고객지원에 충전할 횟수와 업체명을 알려주세요. 안내받은 계좌로 입금한 후 확인이 완료되면 횟수가 반영됩니다.</p><a href="/support">입금·충전 문의 →</a></details>}
        <pre aria-label="고객 알림톡 메시지 미리보기">{data.text}</pre>
        {data.reasons.length>0&&<ul className="notice">{data.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
        {data.syncWarning&&<p>{data.syncWarning}</p>}
        {data.latestId&&<label className="confirm"><input type="checkbox" checked={resend} onChange={e=>setResend(e.target.checked)} disabled={busy}/><span>이전에 보낸 안내가 있습니다. 이력과 번호를 확인했으며 1회를 사용해 다시 보냅니다.</span></label>}
        <button className="send" type="button" disabled={busy||blocked||!data.ready||Boolean(data.latestId&&!resend)} onClick={send}>{busy?'처리 중…':data.latestId?'알림톡 재발송 · 1회 사용':'알림톡 발송 · 1회 사용'}</button>
        {data.history.length>0&&<details><summary>발송 이력 {data.history.length}건</summary><ul>{data.history.map(row=><li key={row.id}>{date(row.created_at)} · {row.kind==='worker_schedule_changed'?'시공자 일정 변경':row.kind==='worker_canceled'?'시공자 배정 취소':row.kind==='worker_reminder'?'시공자 전날 안내':row.kind==='customer_reminder'?'고객 하루 전 안내':row.kind==='customer_schedule'?'고객 일정':'시공자 배정'} · {row.recipient_mask}<br/>{labels[row.status]||row.status}{row.accounting==='refunded'&&!row.credit_exempt?' · 1회 복구':''}{row.error_code?' · 코드 '+row.error_code:''}</li>)}</ul></details>}
      </>}
      <button type="button" disabled={busy} onClick={load}>정보·발송 결과 새로고침</button>
    </div>}
    <style jsx>{`
      .alimtalk{margin:12px 0;color:#263c31}.open{width:100%;text-align:left;font-weight:800}.panel{padding:16px;background:#f8f7f3;border:1px solid #dfe5db;border-radius:14px;margin-top:8px}h3{margin:0;font-size:17px}p,li,label{font-size:13px;line-height:1.7;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:14px;background:#fffefa;border:1px solid #dfe5db;border-radius:12px;padding:14px;line-height:1.8}button{font:inherit;min-height:44px;padding:10px 14px;border:1px solid #cbd8cd;border-radius:11px;background:#fffefa;color:#285340;cursor:pointer}button:disabled{opacity:.5;cursor:default}.send{width:100%;font-weight:700;background:#285340;color:white;margin:12px 0}.notice{background:#fff4dd;padding:12px 12px 12px 25px;border-radius:10px;color:#78591c}.confirm{display:flex;gap:10px;align-items:flex-start}.confirm input{margin-top:5px;width:18px;height:18px;flex-shrink:0}summary{min-height:44px;cursor:pointer;padding-top:10px}li{margin-bottom:10px}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid #315c91;outline-offset:3px}
    `}</style>
  </section>;
}
