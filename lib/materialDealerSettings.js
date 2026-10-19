import { normalizeDealerProfile, orderSupplier, canonicalMaterialBrand, materialBrandAliases } from './materialDealerProfile.mjs';
import { uuid } from './materialPilot.mjs';
export const dealerColumns='id,name,status,user_id,profile,is_test';
export async function brandLinks(db,brands) {
 let q=db.from('material_pilot_brand_dealers').select('brand,dealer_id,enabled,dealer:material_pilot_dealers(id,name,status,is_test)');
 if(brands)q=q.in('brand',[...new Set(brands.map(canonicalMaterialBrand))]);
 const {data,error}=await q;
 if(error)throw error;
 return data||[];
}
export async function supplierSnapshot(db,items) {
 const links=await brandLinks(db,items.map(i=>i.brand));
 const id=orderSupplier(items,links);
 return {dealerId:id,items:items.map(item=>{
  const link=links.find(l=>canonicalMaterialBrand(l.brand)===canonicalMaterialBrand(item.brand));
  return link?{...item,supplierId:link.dealer_id,supplierName:link.dealer.name,supplierTest:link.dealer.is_test}:item;
 })};
}
export async function dealerSettings(db,user,b,actor) {
 if(b.action==='dealer_profile') {
  let q=db.from('material_pilot_dealers').select(dealerColumns);
  q=actor?.role==='super'?q.eq('id',b.dealerId):q.eq('user_id',user.id);
  const {data:d,error}=await q.maybeSingle();
  if(error)throw error;
  if(!d||d.status==='deleted')throw Error('수정할 대리점을 찾을 수 없습니다.');
  const {name,...profile}=normalizeDealerProfile(b.profile,{test:d.is_test});
  let update=db.from('material_pilot_dealers').update({name,profile}).eq('id',d.id).neq('status','deleted');
  if(actor?.role!=='super')update=update.eq('user_id',user.id);
  const result=await update.select('id').maybeSingle();
  if(result.error)throw result.error;
  if(!result.data)throw Error('대리점 상태가 변경되었습니다. 새로고침해주세요.');
  return {ok:true};
 }
 if(actor?.role!=='super')throw Object.assign(Error('슈퍼관리자만 변경할 수 있습니다.'),{status:403});
 if(b.action==='create_test_dealer') {
  // No fabricated business number, phone number or authentication account.
  const {data,error}=await db.from('material_pilot_dealers').select('id').eq('is_test',true).eq('name','테스트 대리점').neq('status','deleted').maybeSingle();
  if(error)throw error;
  if(data)return {ok:true};
  const result=await db.from('material_pilot_dealers').insert({name:'테스트 대리점',is_test:true,status:'active',user_id:null,profile:{handled_brands:['영림','현대보닥'],vat_included:false}});
  if(result.error&&result.error.code!=='23505')throw result.error;
  return {ok:true};
 }
 if(['brand_dealer','publish_younglim','publish_brand'].includes(b.action)) {
  const brand=b.brand||'영림';
  if(!['영림','현대보닥'].includes(brand))throw Error('영림 또는 현대보닥을 선택해주세요.');
  if(!uuid(b.dealerId))throw Error('출고 대리점을 선택해주세요.');
  const {data:d,error}=await db.from('material_pilot_dealers').select(dealerColumns).eq('id',b.dealerId).eq('status','active').maybeSingle();
  if(error)throw error;
  if(!d)throw Error('활성 대리점을 선택해주세요.');
  if(!d.is_test)normalizeDealerProfile({...d.profile,name:d.name});
  const result=await db.from('material_pilot_brand_dealers').upsert({brand,dealer_id:d.id,enabled:true,updated_at:new Date().toISOString()});
  if(result.error)throw result.error;
  if(b.action==='brand_dealer')return {ok:true};
  // Only already-stocked, priced, classified products; never invent price or stock.
  const products=await db.from('film_products').update({is_order_available:true,price_vat_included:false})
   .in('brand',materialBrandAliases(brand)).eq('stock_status','in_stock').gt('dealer_price_per_m',0)
   .in('flame_type',['fire','non_fire','flame_retardant','non_flame_retardant','방염','비방염']).select('id');
  if(products.error)throw products.error;
  return {ok:true,published:products.data?.length||0,brand};
 }
 throw Error('지원하지 않는 대리점 설정입니다.');
}
