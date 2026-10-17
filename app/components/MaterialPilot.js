"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { orderFlameLabel } from '../../lib/materialOrderVariants.mjs';
import MaterialOrderWorkflow from './MaterialOrderWorkflow';
import { pilotStatus, remaining, orderStage } from '../../lib/materialPilot.mjs';
import styles from './MaterialPilot.module.css';
export async function pilotFetch(mode, body) {
  const {data}=await supabase.auth.getSession();
  if(!data?.session?.access_token) throw Error('로그인해주세요.');
  const response=await fetch(`/api/material-pilot?mode=${mode}`,{
    method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(20000),
    headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify({...body,mode})}:{})
  });
  const result=await response.json();
  if(!response.ok) throw Object.assign(Error(result.error||'처리하지 못했습니다.'),{status:response.status});
  return result;
}
const won = n => `${Number(n||0).toLocaleString('ko-KR')}원`;
export default function MaterialPilot({mode='buyer'}) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[name,setName]=useState('');
  const lock=useRef(false),pending=useRef(null),alive=useRef(true),scrolled=useRef(false);
  useEffect(()=>{if(!data?.orders||scrolled.current)return;const id=new URLSearchParams(window.location.search).get('order');const el=id&&document.getElementById(id);if(el){el.scrollIntoView({block:'start'});scrolled.current=true;}},[data]);
  const refresh=useCallback(async()=>{
    try {const next=await pilotFetch(mode);if(alive.current){setData(next);setError('');}}
    catch(e){if(alive.current)setError(e.message);}
  },[mode]);
  useEffect(()=>{alive.current=true;refresh();const timer=setInterval(()=>{if(!document.hidden&&!lock.current)refresh();},15000);return()=>{alive.current=false;clearInterval(timer);};},[refresh]);
  async function act(body) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    const signature=JSON.stringify(body);
    if(pending.current?.signature!==signature){const id=crypto.randomUUID();pending.current={signature,body:{...body,requestId:id,...(body.action==='ship'?{shipmentId:id}:{})}};}
    try {await pilotFetch(mode,pending.current.body);pending.current=null;await refresh();}
    catch(e){if(e.status && e.status<500)pending.current=null;if(alive.current)setError(e.message);}
    finally {lock.current=false;if(alive.current)setBusy(false);}
  }
  return <section className={styles.root} aria-busy={busy}>
    <div className={styles.banner}><strong>대리점 연동 테스트</strong><p>실제 결제·배송 요청·운영 재고 반영 없이 주문부터 테스트 입고까지 확인합니다.</p></div>
    <div className={styles.heading}><h2>{mode==='super'?'테스트 주문·대리점 관리':mode==='dealer'?'배정 발주':'테스트 주문내역'}</h2><button disabled={busy} onClick={refresh}>새로고침</button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!data && !error && <p>불러오는 중…</p>}
    {mode==='dealer' && data && !data.role && <div className={styles.card}>
      {data.registration ? <p>{data.registration.status==='pending'?'슈퍼관리자 승인 대기 중입니다. 승인 후 새로고침해주세요.':'대리점 이용이 중지되었습니다. 슈퍼관리자에게 문의해주세요.'}</p> : <><label>대리점 이름<input maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><button disabled={busy||!name.trim()} onClick={()=>act({action:'register',name:name.trim()})}>대리점 이용 신청</button></>}
    </div>}
    {mode==='super' && data && <details className={styles.card} open><summary>대리점 승인·관리 ({data.dealers?.length||0})</summary>
      {!data.dealers?.length && <p>대리점이 /dealer에서 가입·로그인 후 이용 신청하면 표시됩니다.</p>}
      {data.dealers?.map(d=><div className={styles.dealer} key={d.id}><strong>{d.name}</strong><small>{d.status==='active'?'승인됨':d.status==='pending'?'승인 대기':'중지'}</small><button disabled={busy} onClick={()=>act({action:'dealer_status',dealerId:d.id,status:d.status==='active'?'disabled':'active'})}>{d.status==='active'?'중지':'승인'}</button></div>)}
    </details>}
    {!!data?.notices?.length&&<details className={styles.card}><summary>주문 알림 ({data.notices.length})</summary>{data.notices.map(n=><p key={n.id}><a href={n.link}>{n.title}</a><br/><small>{new Date(n.created_at).toLocaleString('ko-KR')}</small></p>)}</details>}
    {data?.role && !data.orders?.length && <p>테스트 주문이 없습니다.</p>}
    <p className={styles.help}>최근 100건 · 화면을 열어두면 15초마다 상태를 확인합니다.</p>
    {data?.orders?.map(o=><PilotOrder key={`${o.id}:${o.revision}`} order={o} mode={mode} dealers={data.dealers||[]} busy={busy} act={act}/>)}
  </section>;
}
function PilotOrder({order:o,mode,dealers,busy,act}) {
  const [dealer,setDealer]=useState(o.dealer_id||''),[prices,setPrices]=useState(o.supply_prices||o.items.map(()=>''));
  const [rolls,setRolls]=useState([{item:0,length:''}]),[tracking,setTracking]=useState('');
  const action=(action,values={})=>act({action,orderId:o.id,revision:o.revision,...values});
  return <article id={o.id} className={styles.card}>
    <div className={styles.heading}><strong>TEST-{o.id.slice(0,8).toUpperCase()}</strong><span className={styles.badge}>{orderStage(o)}</span></div>
    <small>{new Date(o.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</small>
    <MaterialOrderWorkflow order={o} mode={mode} busy={busy} action={action}/>
    {o.items.map((item,i)=><div className={styles.item} key={item.productId}>
      <strong>{item.brand} · {item.code}</strong><div>{item.name} · {orderFlameLabel(item.flame)}</div>
      <p>요청 {item.quantity}m · 미출고 {remaining(o,i)}m</p>
      {mode==='dealer'?<p>공급단가 {won(item.supplyPrice)}/m · VAT 별도</p>:<p>판매금액 {won(item.total)} · VAT 포함</p>}
    </div>)}
    {mode!=='dealer' && <p><strong>테스트 주문 합계 {won(o.total)}</strong><br/><small>실제 결제 없음 · 배송비·재단비 계산은 추후 연결</small></p>}
    <details><summary>수령지 확인</summary><p>{o.shipping.recipient_name} · {o.shipping.recipient_phone}</p><p>{o.shipping.address_line1} {o.shipping.address_line2}</p><p>{o.shipping.note}</p></details>
    {mode==='super' && ['requested','assigned'].includes(o.status) && <fieldset disabled={busy}>
      <legend>공급 대리점 배정</legend><label>대리점<select value={dealer} onChange={e=>setDealer(e.target.value)}><option value="">선택해주세요</option>{dealers.filter(d=>d.status==='active').map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      {o.items.map((item,i)=><label key={item.productId}>{item.code} 공급단가 (원/m · VAT 별도)<input type="number" min="1" step="1" value={prices[i]??''} onChange={e=>setPrices(p=>o.items.map((_,n)=>n===i?e.target.value:p[n]))}/></label>)}
      <button disabled={!dealer} onClick={()=>action('assign',{dealerId:dealer,prices:prices.map(Number)})}>배정 저장</button>
    </fieldset>}
    {mode==='dealer' && o.status==='assigned' && <button disabled={busy} onClick={()=>action('accept')}>준비 가능 · 발주 수락</button>}
    {mode==='dealer' && ['preparing','partial'].includes(o.status) && (!o.shipping.workflow || o.shipping.workflow.phase==='paid') && <fieldset disabled={busy}><legend>실제 출고 롤 입력</legend>
      {rolls.map((r,i)=><div className={styles.roll} key={i}><label>제품<select value={r.item} onChange={e=>setRolls(a=>a.map((v,n)=>n===i?{...v,item:Number(e.target.value)}:v))}>{o.items.map((item,n)=><option key={item.productId} value={n}>{item.code} · 잔여 {remaining(o,n)}m</option>)}</select></label><label>길이(m)<input type="number" min="0.01" step="0.01" value={r.length} onChange={e=>setRolls(a=>a.map((v,n)=>n===i?{...v,length:e.target.value}:v))}/></label><button aria-label={`${i+1}번째 롤 삭제`} onClick={()=>setRolls(a=>a.filter((_,n)=>n!==i))}>삭제</button></div>)}
      <button disabled={rolls.length>=100} onClick={()=>setRolls(a=>[...a,{item:0,length:''}])}>+ 롤 추가</button>
      <label>{o.shipping.method==='quick'?'퀵 기사 전화번호':o.shipping.method==='freight'?'화물회사·송장번호·도착 영업소':o.shipping.method==='parcel'?'택배회사·송장번호':'수령·전달 확인 메모'}<input maxLength={200} value={tracking} onChange={e=>setTracking(e.target.value)} placeholder="테스트 택배 / 송장번호"/></label>
      <button disabled={!rolls.length||!tracking.trim()} onClick={()=>{if(confirm('입력한 롤 구성으로 테스트 출고할까요?'))action('ship',{rolls:rolls.map(r=>({...r,length:Number(r.length)})),tracking});}}>{o.shipping.method==='pickup'?'물건 전달 · 수령 완료':o.shipping.method==='nearby'?'수령 준비 · 찾아가기 안내':o.shipping.method==='freight'?'화물 입고 · 배송 시작':o.shipping.method==='parcel'?'택배 입고 · 배송 시작':'발송 완료'}</button>
    </fieldset>}
    {o.shipments?.map(s=><section className={styles.shipment} key={s.id}><strong>{s.receivedAt?'테스트 입고 완료':'출고 · 수령 대기'}</strong><p>{o.shipping.method==='quick'?<a href={'tel:'+s.tracking}>기사 전화 {s.tracking}</a>:s.tracking}</p>{s.rolls.map((r,i)=><p key={i}>{o.items[r.item].code} · {r.length}m · 1롤 {s.receivedAt&&<small>입고번호 {s.id.slice(0,8)}-{i+1}</small>}</p>)}
      {mode==='buyer' && !s.receivedAt && <button disabled={busy} onClick={()=>{if(confirm('위 롤을 모두 받았다고 테스트 기록할까요? 실제 재고에는 반영하지 않습니다.'))action('receive',{shipmentId:s.id});}}>수령 확인 · 테스트 입고</button>}
    </section>)}
    {['buyer','super'].includes(mode) && ['requested','assigned','preparing'].includes(o.status) && o.shipping.workflow?.phase!=='paid' && <button disabled={busy} onClick={()=>{if(confirm('출고 전 테스트 주문을 취소할까요?'))action('cancel');}}>테스트 주문 취소</button>}
  </article>;
}
