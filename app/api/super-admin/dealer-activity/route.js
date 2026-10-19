import {pilotIdentity,pilotRole,pilotJson} from '../../../../lib/materialPilotServer';
import {dealerActivity} from '../../../../lib/dealerActivity.mjs';
import {stockHistoryRange} from '../../../../lib/stockHistory.mjs';
export const runtime='nodejs';
async function read(query){const r=await query;if(r.error)throw r.error;return r.data||[];}
export async function GET(request){
 try{
  const {db,user}=await pilotIdentity(request);
  await pilotRole(db,user,'super');
  const p=new URL(request.url).searchParams;
  let range;try{range=stockHistoryRange(p.get('start'),p.get('end'));}catch(e){return pilotJson({error:e.message},400);}
  const [dealers,orders,events,superUsers]=await Promise.all([
   read(db.from('material_pilot_dealers').select('id,name,status,user_id,is_test,created_at').order('created_at',{ascending:false}).limit(1000)),
   read(db.from('material_pilot_orders').select('id,dealer_id,status,shipping,buyer_id,created_at').order('created_at',{ascending:false}).limit(1000)),
   read(db.from('material_pilot_events').select('id,order_id,actor_id,action,created_at').gte('created_at',range.from).lt('created_at',range.until).order('created_at',{ascending:false}).limit(1000)),
   read(db.from('super_admins').select('user_id').limit(1000)),
  ]);
  // Never return shipping addresses or recipient contact details to the monitor.
  const safeOrders=orders.map(o=>({...o,shipping:{workflow:{phase:o.shipping?.workflow?.phase}}}));
  return pilotJson({...dealerActivity({dealers,orders:safeOrders,events,superUsers}),truncated:[dealers,orders,events].some(r=>r.length===1000),start:p.get('start'),end:p.get('end')});
 }catch(e){console.error('dealer-activity',e.code||e.status||e.message);return pilotJson({error:e.status?e.message:'대리점 활동을 불러오지 못했습니다. 잠시 후 다시 조회해주세요.'},e.status||500);}
}
