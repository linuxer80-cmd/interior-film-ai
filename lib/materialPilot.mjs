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
  return { productId: product.id, brand: product.brand, code: product.product_code, name: product.product_name, flame: product.flame_type, quantity: q / 100, unitPrice: price, vatIncluded: !!product.price_vat_included, supply, total };
}
export function remaining(order, index) {
  const shipped = (order.shipments || []).flatMap(s => s.rolls).filter(r => r.item === index).reduce((n,r) => n + metres(r.length), 0);
  return (metres(order.items[index].quantity) - shipped) / 100;
}
export function transition(order, role, action, body, now = new Date().toISOString()) {
  const o = structuredClone(order);
  if (action === 'assign') {
    if (role !== 'super' || !['requested','assigned'].includes(o.status) || !uuid(body.dealerId)) throw Error('배정 대기 상태에서 대리점을 선택해주세요.');
    if (!Array.isArray(body.prices) || body.prices.length !== o.items.length || body.prices.some(n => !Number.isSafeInteger(n) || n <= 0 || n > 10000000)) throw Error('각 제품의 공급단가를 원 단위로 입력해주세요.');
    o.dealer_id = body.dealerId; o.supply_prices = body.prices; o.status = 'assigned';
  } else if (action === 'accept') {
    if (role !== 'dealer' || o.status !== 'assigned') throw Error('배정된 발주만 수락할 수 있습니다.');
    o.status = 'preparing';
  } else if (action === 'ship') {
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
    o.shipments = [...(o.shipments || []), { id: body.shipmentId, rolls, tracking: body.tracking.trim(), shippedAt: now, receivedAt: null }];
    o.status = o.items.every((_,i) => remaining(o,i) === 0) ? 'shipped' : 'partial';
  } else if (action === 'receive') {
    if (role !== 'buyer' || !['partial','shipped'].includes(o.status)) throw Error('출고된 주문만 수령 확인할 수 있습니다.');
    const shipment = o.shipments.find(s => s.id === body.shipmentId);
    if (!shipment || shipment.receivedAt) throw Error('이미 수령했거나 없는 출고 건입니다.');
    shipment.receivedAt = now;
    // These immutable shipment rolls are the TEST inbound ledger. Never write production stock.
    if (o.items.every((_,i) => remaining(o,i) === 0) && o.shipments.every(s => s.receivedAt)) o.status = 'received';
  } else if (action === 'cancel') {
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
