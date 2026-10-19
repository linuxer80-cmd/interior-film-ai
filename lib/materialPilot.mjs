export const deliveryMethods = {pickup:'직접 수령',nearby:'내 주변에서 받기',quick:'퀵서비스',freight:'화물',parcel:'택배'};
export function deliveryInput(value) {
 const method=value?.method;
 if(!Object.hasOwn(deliveryMethods,method))throw Error('수령 방법을 선택해주세요.');
 const clean={method};
 for(const key of ['recipient_name','recipient_phone','address_line1','address_line2','note']){
  clean[key]=String(value[key]||'').trim();
  if(clean[key].length>500)throw Error('수령 정보를 500자 이내로 입력해주세요.');
 }
 if(!clean.recipient_name || !/^[0-9+() -]{7,25}$/.test(clean.recipient_phone))throw Error('수령인과 연락처를 확인해주세요.');
 if(method!=='pickup' && !clean.address_line1)throw Error('받을 주소 또는 희망 수령 지역을 입력해주세요.');
 if(['quick','freight'].includes(method) && value.feeAccepted!==true)throw Error('퀵·화물 운임 별도 본인 부담에 동의해주세요.');
 clean.feeAccepted=['quick','freight'].includes(method);
 return clean;
}
export function orderStage(o) {
 if(['partial','shipped','received','cancelled'].includes(o.status))return o.status==='shipped'?(deliveryMethods[o.shipping?.method]||'자재')+' 배송·전달 중':pilotStatus[o.status];
 return ({ready:'준비 완료 · 결제 대기',paid:'테스트 결제 완료 · 발송 대기'})[o.shipping?.workflow?.phase] || pilotStatus[o.status];
}
// Pilot quantities use integer centimetres to avoid floating-point over-delivery.
export const pilotStatus = { requested: '접수 · 배정 대기', assigned: '대리점 확인 대기', preparing: '준비 중', partial: '일부 출고', shipped: '전체 출고', received: '수령 완료', cancelled: '취소' };
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function metres(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 10000 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001) throw Error('길이는 0.01~10,000m, 소수 둘째 자리까지 입력해주세요.');
  return Math.round(n * 100);
}
export function salesItem(product, quantity) {
  const q = metres(quantity), min = metres(product.minimum_order_m || 1), unit = metres(product.order_unit_m || 1);
  if (q < min || (q - min) % unit) throw Error(`${product.product_code}: 최소 ${min / 100}m, ${unit / 100}m 단위로 주문해주세요.`);
  const price = Number(product.dealer_price_per_m);
  if (!Number.isSafeInteger(price) || price <= 0 || price > 10000000 || !product.is_order_available || product.stock_status !== 'in_stock') throw Error(`${product.product_code}: 판매 가능 여부와 단가를 확인해주세요.`);
  const supply = product.price_vat_included ? Math.round(price * q / 100 / 1.1) : Math.round(price * q / 100);
  const total = product.price_vat_included ? Math.round(price * q / 100) : supply + Math.round(supply * .1);
  return { productId: product.id, brand: product.brand, code: product.product_code, name: product.product_name, flame: product.flame_type, quantity: q / 100, minimum: min/100, unit: unit/100, unitPrice: price, vatIncluded: !!product.price_vat_included, supply, total };
}
export function remaining(order, index) {
  const shipped = (order.shipments || []).flatMap(s => s.rolls).filter(r => r.item === index).reduce((n,r) => n + metres(r.length), 0);
  return (metres(order.items[index].quantity) - shipped) / 100;
}
export function transition(order, role, action, body, now = new Date().toISOString()) {
  const o = structuredClone(order);
  const w=o.shipping?.workflow;
  if(action==='edit') {
    if(role!=='buyer' || !w || !['requested','assigned','preparing'].includes(o.status) || w.phase==='paid' || o.shipments.length)throw Error('결제 전 주문만 수정할 수 있습니다.');
    if(!Array.isArray(body.quantities) || body.quantities.length!==o.items.length)throw Error('수량을 확인해주세요.');
    o.items=o.items.map((item,i)=>{
      const cm=metres(body.quantities[i]),min=metres(item.minimum||1),unit=metres(item.unit||1);
      if(cm<min || (cm-min)%unit)throw Error('최소 주문량과 주문 단위를 확인해주세요.');
      const quantity=cm/100, supply=item.vatIncluded?Math.round(item.unitPrice*quantity/1.1):Math.round(item.unitPrice*quantity);
      return {...item,quantity,supply,total:item.vatIncluded?Math.round(item.unitPrice*quantity):supply+Math.round(supply*.1)};
    });
    o.shipping={...deliveryInput(body.shipping),workflow:{version:2,phase:'review',changedAt:now}};
    o.status=o.dealer_id?'assigned':'requested';
  } else if(action==='ready') {
    if(role!=='dealer' || o.status!=='preparing' || !w || w.phase==='paid')throw Error('준비 중 주문에서만 준비 완료할 수 있습니다.');
    if(!Array.isArray(body.quantities)||body.quantities.length!==o.items.length||body.quantities.some((q,i)=>metres(q)!==metres(o.items[i].quantity)))throw Error('준비 수량이 주문과 다릅니다. 주문자에게 수량 변경을 요청해주세요.');
    const pickup={};
    if(['pickup','nearby'].includes(o.shipping.method)){
      for(const k of ['name','address','phone','hours']){
       pickup[k]=String(body.pickup?.[k]||'').trim();
       if(!pickup[k]||pickup[k].length>200)throw Error('수령처 이름·주소·전화번호·수령 시간을 입력해주세요.');
      }
      if(!/^[0-9+() -]{7,25}$/.test(pickup.phone))throw Error('수령처 전화번호를 확인해주세요.');
    }
    o.shipping.workflow={version:2,phase:'ready',readyAt:now,pickup,preparedQuantities:body.quantities.map(Number)};
  } else if(action==='test_pay') {
    if(role!=='buyer'||o.status!=='preparing'||w?.phase!=='ready')throw Error('준비 완료된 주문만 테스트 결제할 수 있습니다.');
    if(body.expectedTotal!==o.items.reduce((n,i)=>n+i.total,0))throw Error('주문금액을 다시 확인해주세요.');
    w.phase='paid';w.paidAt=now;w.paymentMode='simulation';
  } else if (action === 'assign') {
    if (role !== 'super' || !['requested','assigned'].includes(o.status) || !uuid(body.dealerId)) throw Error('배정 대기 상태에서 대리점을 선택해주세요.');
    if (!Array.isArray(body.prices) || body.prices.length !== o.items.length || body.prices.some(n => !Number.isSafeInteger(n) || n <= 0 || n > 10000000)) throw Error('각 제품의 공급단가를 원 단위로 입력해주세요.');
    if(o.items.some(i=>i.supplierId && i.supplierId!==body.dealerId))throw Error('주문에 연결된 출고 대리점을 선택해주세요.');
    o.dealer_id = body.dealerId; o.supply_prices = body.prices; o.status = 'assigned';
  } else if (action === 'accept') {
    if (role !== 'dealer' || o.status !== 'assigned') throw Error('배정된 발주만 수락할 수 있습니다.');
    o.status = 'preparing';
  } else if (action === 'ship') {
    if (w && w.phase!=='paid')throw Error('준비 완료 후 결제 확인이 필요합니다.');
    if (w && o.shipping.method==='quick' && !/^[0-9+() -]{7,25}$/.test(body.tracking||''))throw Error('퀵 기사 전화번호를 입력해주세요.');
    if (role !== 'dealer' || !['preparing','partial'].includes(o.status)) throw Error('준비 중인 발주에서 출고해주세요.');
    if (!uuid(body.shipmentId) || !Array.isArray(body.rolls) || body.rolls.length < 1 || body.rolls.length > 100) throw Error('출고할 롤을 1~100개 입력해주세요.');
    const totals = new Map();
    const rolls = body.rolls.map(r => {
      if (!Number.isInteger(r.item) || !o.items[r.item]) throw Error('주문에 없는 제품입니다.');
      const cm = metres(r.length); totals.set(r.item, (totals.get(r.item) || 0) + cm);
      return { item: r.item, length: cm / 100 };
    });
    for (const [i, cm] of totals) if (cm > Math.round(remaining(o, i) * 100)) throw Error('요청 수량보다 많이 출고할 수 없습니다.');
    if (typeof body.tracking !== 'string' || !body.tracking.trim() || body.tracking.length > 200) throw Error('배송방법과 송장번호 또는 방문수령 정보를 입력해주세요.');
    o.shipments = [...(o.shipments || []), { id: body.shipmentId, rolls, tracking: body.tracking.trim(), shippedAt: now, receivedAt: w && o.shipping.method==='pickup' ? now : null }];
    o.status = o.items.every((_,i) => remaining(o,i) === 0) ? (w && o.shipping.method==='pickup'?'received':'shipped') : 'partial';
  } else if (action === 'receive') {
    if (role !== 'buyer' || !['partial','shipped'].includes(o.status)) throw Error('출고된 주문만 수령 확인할 수 있습니다.');
    const shipment = o.shipments.find(s => s.id === body.shipmentId);
    if (!shipment || shipment.receivedAt) throw Error('이미 수령했거나 없는 출고 건입니다.');
    shipment.receivedAt = now;
    // These immutable shipment rolls are the TEST inbound ledger. Never write production stock.
    if (o.items.every((_,i) => remaining(o,i) === 0) && o.shipments.every(s => s.receivedAt)) o.status = 'received';
  } else if (action === 'cancel') {
    if(w?.phase==='paid')throw Error('결제 후 취소는 환불 확인이 필요합니다. 관리자에게 문의해주세요.');
    if (!['buyer','super'].includes(role) || !['requested','assigned','preparing'].includes(o.status)) throw Error('출고 전 주문만 취소할 수 있습니다.');
    o.status = 'cancelled';
  } else throw Error('지원하지 않는 작업입니다.');
  return o;
}
export function visibleOrder(order, role) {
  const { id, company_id, status, dealer_id, items, shipments, shipping, created_at, revision } = order;
  const result = { id, company_id, status, dealer_id, items, shipments, shipping, created_at, revision };
  if (role === 'dealer') {
    result.items = items.map(({productId,brand,code,name,flame,quantity},i) => ({productId,brand,code,name,flame,quantity,supplyPrice:order.supply_prices?.[i]}));
  } else result.total = items.reduce((n,i) => n + i.total, 0);
  if (role === 'super') result.supply_prices = order.supply_prices;
  return result;
}

