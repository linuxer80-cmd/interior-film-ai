export const dealerActions={assign:'주문 배정',accept:'발주 접수',ready:'준비 완료',test_pay:'테스트 결제 확인',ship:'출고',receive:'수령 확인',edit:'주문 변경',cancel:'주문 취소'};
export function dealerActivity({dealers,orders,events,superUsers},now=Date.now()) {
  const orderMap=new Map(orders.map(o=>[o.id,o]));
  const dealerMap=new Map(dealers.map(d=>[d.id,d]));
  const superIds=new Set(superUsers.map(s=>s.user_id));
  const lastAssign=new Map();
  for(const e of events)if(e.action==='assign'&&(!lastAssign.has(e.order_id)||e.created_at>lastAssign.get(e.order_id)))lastAssign.set(e.order_id,e.created_at);
  const activities=events.map(e=>{
    const o=orderMap.get(e.order_id),d=dealerMap.get(o?.dealer_id);
    const reassigned=Boolean(lastAssign.get(e.order_id)&&e.created_at<lastAssign.get(e.order_id));
    const delegate=superIds.has(e.actor_id)&&['accept','ready','ship'].includes(e.action);
    return {id:e.id,orderId:e.order_id,at:e.created_at,action:e.action,
      dealerId:reassigned?null:d?.id||null,dealerName:reassigned?'재배정 전 · 대리점 확인 필요':d?.name||'미배정·연결 정보 없음',
      actor:delegate?'슈퍼관리자 대신 처리':superIds.has(e.actor_id)?'슈퍼관리자':e.actor_id===d?.user_id?'대리점':e.actor_id===o?.buyer_id?'주문 업체':'처리 계정 확인 필요',
      delegated:delegate,test:d?.is_test===true,
    };
  }).sort((a,b)=>new Date(b.at)-new Date(a.at)||b.id.localeCompare(a.id));
  const summaries=dealers.map(d=>{
    const own=orders.filter(o=>o.dealer_id===d.id),history=activities.filter(e=>e.dealerId===d.id);
    const ownActivity=history.filter(e=>e.actor==='대리점');
    return {id:d.id,name:d.name,status:d.status,test:d.is_test===true,accountLinked:Boolean(d.user_id),registeredAt:d.created_at,
      orders:own.length,waiting:own.filter(o=>o.status==='assigned').length,
      preparing:own.filter(o=>o.status==='preparing').length,
      shipping:own.filter(o=>['partial','shipped'].includes(o.status)).length,
      received:own.filter(o=>o.status==='received').length,
      cancelled:own.filter(o=>o.status==='cancelled').length,
      lastActivity:history[0]?.at||null,lastDealerActivity:ownActivity[0]?.at||null,
      delegated:history.filter(e=>e.delegated).length,
    };
  });
  const pending=orders.filter(o=>['assigned','preparing','partial','shipped'].includes(o.status)).map(o=>({id:o.id,dealerId:o.dealer_id,dealerName:dealerMap.get(o.dealer_id)?.name||'연결 정보 없음',status:o.status,phase:o.shipping?.workflow?.phase||'',createdAt:o.created_at,hours:Math.max(0,Math.floor((now-new Date(o.created_at))/3600000)),test:dealerMap.get(o.dealer_id)?.is_test===true}));
  return {dealers:summaries,activities,pending};
}
