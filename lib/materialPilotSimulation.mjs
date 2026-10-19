// Server-side delegation is limited to active, explicitly marked test dealers.
export function canSimulateDealer(role, order, dealer) {
  return role === 'super' && Boolean(order.dealer_id) &&
    dealer?.id === order.dealer_id && dealer.is_test === true && dealer.status === 'active';
}
export async function simulationRole(db, actor, order, body) {
  if (body.simulateDealer !== true) return actor.role;
  if (actor.role !== 'super' || !['accept', 'ready', 'ship'].includes(body.action) || !order.dealer_id) {
    throw Object.assign(Error('테스트 대리점의 접수·준비·출고만 대신 처리할 수 있습니다.'), {status: 403});
  }
  const {data, error} = await db.from('material_pilot_dealers').select('*').eq('id', order.dealer_id).maybeSingle();
  if (error) throw error;
  if (!canSimulateDealer(actor.role, order, data)) {
    throw Object.assign(Error('활성 테스트 대리점에 배정된 주문만 대신 처리할 수 있습니다.'), {status: 403});
  }
  return 'dealer';
}
