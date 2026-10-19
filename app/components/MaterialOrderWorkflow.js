"use client";
import {useState} from 'react';
import {deliveryMethods,orderStage} from '../../lib/materialPilot.mjs';
import MaterialDeliveryFields from './MaterialDeliveryFields';
import styles from './MaterialPilot.module.css';
export default function MaterialOrderWorkflow({order:o,mode,dealerProfile,busy,action}) {
 const w=o.shipping.workflow;
 const [quantities,setQuantities]=useState(o.items.map(i=>i.quantity));
 const [prepared,setPrepared]=useState(o.items.map(()=>''));
 const [shipping,setShipping]=useState(o.shipping);
 const [pickup,setPickup]=useState({name:'',address:'',phone:'',hours:''});
 if(!w)return null;
 const step=o.status==='received'?4:['shipped','partial'].includes(o.status)?3:w.phase==='paid'?2:w.phase==='ready'?1:0;
 const steps=['주문·준비','준비 완료','결제 확인','배송·수령','완료'];
 const editable=['requested','assigned','preparing'].includes(o.status)&&w.phase!=='paid';
 return <section>
 <h2>{orderStage(o)}</h2>
 <ol className={styles.progress}>{steps.map((label,i)=><li key={label} aria-current={i===step?'step':undefined} className={i<=step?styles.done:''}>{label}</li>)}</ol>
 <p><strong>{deliveryMethods[o.shipping.method]}</strong>{['quick','freight'].includes(o.shipping.method)&&' · 운임 별도 본인 부담'}</p>
 {w.changedAt&&<p role="status" className={styles.banner}>주문 변경 접수 · 대리점 재확인이 필요합니다.</p>}
 {w.pickup?.address&&<div className={styles.shipment}><strong>수령처: {w.pickup.name}</strong><p>{w.pickup.address}</p><p>수령 시간: {w.pickup.hours}</p><a href={'tel:'+w.pickup.phone}>수령처 전화 {w.pickup.phone}</a> · <a target="_blank" rel="noreferrer" href={'https://map.kakao.com/link/search/'+encodeURIComponent(w.pickup.address)}>지도·길찾기</a><p>{w.phase==='paid'?'결제 확인 완료 · 안내된 시간에 방문해주세요.':'준비 완료 · 결제 후 방문해주세요.'}</p></div>}
 {mode==='dealer'&&o.status==='preparing'&&w.phase!=='paid'&&w.phase!=='ready'&&<fieldset disabled={busy}><legend>준비 수량 확인</legend>
 {o.items.map((item,i)=><label key={item.productId}>{item.code} · 주문 {item.quantity}m<input type="number" min=".01" step=".01" value={prepared[i]} onChange={e=>setPrepared(a=>a.map((v,n)=>n===i?e.target.value:v))}/></label>)}
 {['pickup','nearby'].includes(o.shipping.method)&&<><p>해당 장소에 물건이 준비된 것을 확인한 뒤 입력해주세요.</p>
 {o.shipping.method==='pickup'&&dealerProfile&&<button type="button" onClick={()=>setPickup(p=>({...p,name:dealerProfile.name||'',address:[dealerProfile.profile?.address,dealerProfile.profile?.address_detail].filter(Boolean).join(' '),phone:dealerProfile.profile?.contact_phone||dealerProfile.profile?.phone||''}))}>등록된 대리점 주소·연락처 불러오기</button>}
 {[['name','수령처 이름'],['address','수령처 주소'],['phone','수령처 전화번호'],['hours','수령 가능 날짜·시간']].map(([k,label])=><label key={k}>{label}<input maxLength={200} value={pickup[k]} onChange={e=>setPickup(a=>({...a,[k]:e.target.value}))}/></label>)}</>}
 <button onClick={()=>action('ready',{quantities:prepared.map(Number),pickup})}>준비 완료 · 결제 요청</button></fieldset>}
 {mode==='buyer'&&w.phase==='ready'&&o.status==='preparing'&&<div className={styles.banner}><p>대리점이 주문 수량을 준비했습니다. 아래 주문 내용을 확인해주세요.</p><button disabled={busy} onClick={()=>{if(confirm('테스트 결제 완료로 기록할까요? 실제 카드 승인이나 청구는 없습니다.'))action('test_pay',{expectedTotal:o.total});}}>테스트 결제 확인 · {Number(o.total).toLocaleString()}원</button><p>실제 카드결제 연결 전 테스트 단계입니다.</p></div>}
 {mode==='buyer'&&editable&&<details><summary>주문 수량·받는 방법 변경</summary><p>변경하면 기존 준비 완료와 결제 요청이 해제되고 대리점이 다시 확인합니다.</p>
 {o.items.map((item,i)=><label key={item.productId}>{item.code} 수량(m)<input disabled={busy} type="number" min={item.minimum||1} step={item.unit||1} value={quantities[i]} onChange={e=>setQuantities(a=>a.map((v,n)=>n===i?e.target.value:v))}/></label>)}
 <MaterialDeliveryFields value={shipping} onChange={setShipping} disabled={busy}/>
 <button disabled={busy} onClick={()=>{if(confirm('변경 내용을 대리점에 다시 전달할까요?'))action('edit',{quantities:quantities.map(Number),shipping});}}>변경 저장 · 대리점 재확인 요청</button>
 </details>}
 </section>;
}

