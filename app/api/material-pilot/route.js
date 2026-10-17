import { createHash } from 'node:crypto';
import { pilotIdentity, pilotRole, pilotJson } from '../../../lib/materialPilotServer';
import { salesItem, transition, visibleOrder, uuid } from '../../../lib/materialPilot.mjs';
export const runtime = 'nodejs';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = error => {
  console.error('material-pilot',error.code || error.message);
  const setup = ['42P01','PGRST205','PGRST202'].includes(error.code);
  return pilotJson({error: setup ? '대리점 테스트 SQL을 먼저 실행해주세요.' : error.message || '처리하지 못했습니다.'},setup ? 503 : error.status || (error.code === '40001' ? 409 : 400));
};
async function ownOrder(db,actor,id) {
  if(!uuid(id)) throw Error('주문번호를 확인해주세요.');
  let q=db.from('material_pilot_orders').select('*').eq('id',id);
  if(actor.role==='buyer') q=q.eq('company_id',actor.companyId);
  if(actor.role==='dealer') q=q.eq('dealer_id',actor.dealerId);
  const {data,error}=await q.maybeSingle();
  if(error) throw error;
  if(!data) throw Object.assign(Error('접근할 수 없는 주문입니다.'),{status:404});
  // All workflow access remains tied to an enabled pilot company.
  const {data:enabled,error:ee}=await db.from('material_pilot_companies').select('company_id').eq('company_id',data.company_id).eq('enabled',true).maybeSingle();
  if(ee) throw ee;
  if(!enabled) throw Object.assign(Error('중지된 테스트 업체입니다.'),{status:403});
  return data;
}
export async function GET(request) {
 try {
  const {db,user}=await pilotIdentity(request);
  const mode=new URL(request.url).searchParams.get('mode') || 'buyer';
  if(mode==='dealer') {
    const {data,error}=await db.from('material_pilot_dealers').select('id,name,status').eq('user_id',user.id).maybeSingle();
    if(error) throw error;
    if(data?.status!=='active') return pilotJson({registration:data,orders:[]});
  }
  const actor=await pilotRole(db,user,mode);
  const {data:companies,error:ce}=await db.from('material_pilot_companies').select('company_id').eq('enabled',true);
  if(ce) throw ce;
  let query=db.from('material_pilot_orders').select('*').in('company_id',(companies||[]).map(c=>c.company_id)).order('created_at',{ascending:false}).limit(100);
  if(actor.role==='buyer') query=query.eq('company_id',actor.companyId);
  if(actor.role==='dealer') query=query.eq('dealer_id',actor.dealerId);
  const {data,error}=await query;
  if(error) throw error;
  let dealers=[];
  if(actor.role==='super') {
    const result=await db.from('material_pilot_dealers').select('id,name,status,user_id').order('created_at',{ascending:false}).limit(100);
    if(result.error) throw result.error;
    dealers=result.data || [];
  }
  return pilotJson({role:actor.role,orders:(data||[]).map(o=>visibleOrder(o,actor.role)),dealers});
 } catch(error) {return fail(error);}
}
export async function POST(request) {
 try {
  if(request.headers.get('origin')!==new URL(request.url).origin) return pilotJson({error:'같은 앱에서 요청해주세요.'},403);
  const raw=await request.text();
  if(raw.length>40000) return pilotJson({error:'요청이 너무 큽니다.'},413);
  const b=JSON.parse(raw),{db,user}=await pilotIdentity(request);
  if(b.action==='register' && b.mode==='dealer') {
    const name=String(b.name||'').trim();
    if(!name || name.length>80) throw Error('대리점 이름을 80자 이내로 입력해주세요.');
    const {error}=await db.from('material_pilot_dealers').insert({user_id:user.id,name});
    if(error && error.code!=='23505') throw error;
    return pilotJson({ok:true});
  }
  const actor=await pilotRole(db,user,b.mode);
  if(b.action==='dealer_status') {
    if(actor.role!=='super' || !uuid(b.dealerId) || !['active','disabled'].includes(b.status)) throw Object.assign(Error('슈퍼관리자만 승인·중지할 수 있습니다.'),{status:403});
    const {data,error}=await db.from('material_pilot_dealers').update({status:b.status}).eq('id',b.dealerId).select('id').single();
    if(error) throw error;
    return pilotJson({ok:true,id:data.id});
  }
  if(!uuid(b.requestId)) throw Error('저장 요청번호를 확인해주세요.');
  const requestHash=hash(b);
  if(b.action==='create') {
    if(actor.role!=='buyer') throw Object.assign(Error('업체 관리자만 테스트 주문할 수 있습니다.'),{status:403});
    const {data:existing,error:ex}=await db.from('material_pilot_orders').select('*').eq('id',b.requestId).maybeSingle();
    if(ex) throw ex;
    if(existing) {
      if(existing.buyer_id!==user.id || existing.request_hash!==requestHash) throw Error('이미 사용된 요청 번호입니다.');
      return pilotJson({order:visibleOrder(existing,'buyer')});
    }
    if(!uuid(b.addressId) || !Array.isArray(b.items) || !b.items.length || b.items.length>30 || b.items.some(i=>!uuid(i.productId)) || new Set(b.items.map(i=>i.productId)).size!==b.items.length) throw Error('배송지와 주문 제품을 확인해주세요.');
    const [addressResult,productsResult]=await Promise.all([
      db.from('material_shipping_addresses').select('recipient_name,recipient_phone,postal_code,address_line1,address_line2').eq('id',b.addressId).eq('company_id',actor.companyId).eq('is_active',true).maybeSingle(),
      db.from('film_products').select('id,brand,product_code,product_name,flame_type,minimum_order_m,order_unit_m,dealer_price_per_m,price_vat_included,is_order_available,stock_status').in('id',b.items.map(i=>i.productId))
    ]);
    if(addressResult.error || productsResult.error) throw addressResult.error || productsResult.error;
    if(!addressResult.data) throw Error('업체 배송지를 확인해주세요.');
    const items=b.items.map(item=>{
      const product=productsResult.data?.find(p=>p.id===item.productId);
      if(!product) throw Error('판매 제품을 확인해주세요.');
      return salesItem(product,item.quantityM);
    });
    if(b.expectedTotal!==items.reduce((n,i)=>n+i.total,0)) throw Error('판매가격이 변경되었습니다. 상품을 새로 확인해주세요.');
    const {data,error}=await db.from('material_pilot_orders').insert({id:b.requestId,company_id:actor.companyId,buyer_id:user.id,request_hash:requestHash,items,shipping:{...addressResult.data,note:String(b.deliveryNote||'').slice(0,500)}}).select('*').single();
    if(error) {
      if(error.code==='23505') return pilotJson({error:'같은 요청이 처리 중입니다. 주문내역 확인 후 다시 시도해주세요.'},409);
      throw error;
    }
    return pilotJson({order:visibleOrder(data,'buyer')});
  }
  const order=await ownOrder(db,actor,b.orderId);
  const {data:event,error:ee}=await db.from('material_pilot_events').select('order_id,actor_id,action,request_hash').eq('id',b.requestId).maybeSingle();
  if(ee) throw ee;
  if(event) {
    if(event.order_id!==order.id || event.actor_id!==user.id || event.action!==b.action || event.request_hash!==requestHash) throw Error('이미 사용된 요청 번호입니다.');
    return pilotJson({order:visibleOrder(order,actor.role)});
  }
  if(b.revision!==order.revision) throw Object.assign(Error('주문이 변경되었습니다. 새로고침해주세요.'),{status:409});
  if(b.action==='assign') {
    const {data,error}=await db.from('material_pilot_dealers').select('id').eq('id',b.dealerId).eq('status','active').maybeSingle();
    if(error) throw error;
    if(!data) throw Error('승인된 대리점을 선택해주세요.');
  }
  const next=transition(order,actor.role,b.action,b);
  const {data,error}=await db.rpc('material_pilot_commit',{p_order:order.id,p_revision:order.revision,p_actor:user.id,p_request:b.requestId,p_action:b.action,p_hash:requestHash,p_next:next});
  if(error) throw error;
  return pilotJson({order:visibleOrder(data,actor.role)});
 } catch(error) {return fail(error);}
}
