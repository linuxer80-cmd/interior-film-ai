import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDealerProfile,orderSupplier} from '../lib/materialDealerProfile.mjs';
import {transition,salesItem} from '../lib/materialPilot.mjs';
import {dealerSettings} from '../lib/materialDealerSettings.js';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const profile={name:'드림아트',representative_name:'테스트',business_number:'123-45-67891',phone:'010-0000-0000',address:'테스트 주소'};
test('real registration needs verified-shape business details; test placeholders do not fabricate details',()=>{
 assert.equal(normalizeDealerProfile(profile).business_number,'1234567891');
 for(const key of ['name','representative_name','business_number','phone','address'])assert.throws(()=>normalizeDealerProfile({...profile,[key]:''}));
 for(const patch of [{business_number:'1234567890'},{phone:'abc'},{email:'a'},{postal_code:'123'}])assert.throws(()=>normalizeDealerProfile({...profile,...patch}));
 assert.equal(normalizeDealerProfile({name:'드림아트'},{test:true}).business_number,'');
 assert.equal(normalizeDealerProfile({...profile,status:'active',user_id:'attacker'}).user_id,undefined);
});
const link=(brand,dealer_id=id,status='active',enabled=true)=>({brand,dealer_id,enabled,dealer:{status}});
test('routing pins supplier UUID and rejects inactive suppliers and conflicting single-order suppliers',()=>{
 assert.equal(orderSupplier([{brand:'영림'}],[link('영림')]),id);
 assert.equal(orderSupplier([{brand:'현대보닥'}],[link('영림')]),null);
 assert.throws(()=>orderSupplier([{brand:'영림'}],[link('영림',id,'deleted')]));
 assert.throws(()=>orderSupplier([{brand:'영림'}],[link('영림',id,'active',false)]));
 assert.throws(()=>orderSupplier([{brand:'영림'},{brand:'LX'}],[link('영림'),link('LX',other)]));
 assert.throws(()=>orderSupplier([{brand:'영림'},{brand:'현대보닥'}],[link('영림')]));
});
test('linked supplier cannot be silently replaced during assignment; price snapshots survive',()=>{
 const item={...salesItem({id,brand:'영림',product_code:'PS156',dealer_price_per_m:10000,is_order_available:true,stock_status:'in_stock'},10),supplierId:id,supplierName:'드림아트',supplierTest:true};
 const order={status:'requested',items:[item],shipping:{},shipments:[],supply_prices:[]};
 assert.throws(()=>transition(order,'super','assign',{dealerId:other,prices:[7000]}));
 const assigned=transition(order,'super','assign',{dealerId:id,prices:[7000]});
 assert.equal(assigned.dealer_id,id);assert.equal(assigned.items[0].supplierName,'드림아트');assert.equal(assigned.items[0].total,110000);
});
test('self profile edits ignore foreign dealer IDs and cannot change approval or test flags',async()=>{
 const calls=[],row={id,name:'드림아트',status:'pending',is_test:false};
 const db={from(table){const filters=[];return {select(){return this},eq(k,v){filters.push([k,v]);return this},neq(k,v){filters.push([k,v]);return this},update(value){calls.push({table,value,filters});return this},async maybeSingle(){calls.push({table,filters:[...filters]});return {data:row}}}}};
 await assert.rejects(dealerSettings(db,{id:'buyer'},{action:'create_test_dealer'},{role:'buyer'}),/슈퍼관리자/);
 await dealerSettings(db,{id:'self'},{action:'dealer_profile',dealerId:other,profile:{...profile,status:'active',is_test:true}},null);
 assert.ok(calls.every(c=>c.filters.some(([k,v])=>k==='user_id'&&v==='self')));
 assert.equal(calls.find(c=>c.value).value.status,undefined);
 assert.equal(calls.find(c=>c.value).value.profile.is_test,undefined);
});
test('test dealer uses neutral name and both brands with VAT excluded',async()=>{
 let inserted;
 const db={from(){return {select(){return this},eq(){return this},neq(){return this},async maybeSingle(){return {data:null}},async insert(row){inserted=row;return {error:null}}}}};
 await dealerSettings(db,{id:'super'},{action:'create_test_dealer'},{role:'super'});
 assert.equal(inserted.name,'테스트 대리점');assert.equal(inserted.user_id,null);assert.equal(inserted.is_test,true);
 assert.deepEqual(inserted.profile.handled_brands,['영림','현대보닥']);assert.equal(inserted.profile.vat_included,false);
});
test('both brand publishers preserve net prices and explicitly exclude VAT',async()=>{
 for(const brand of ['영림','현대보닥']) {
  let productUpdate,linked;const filters=[];
  const db={from(table){return {select(){return this},eq(k,v){filters.push([k,v]);return this},gt(){return this},in(){return this},async maybeSingle(){return {data:{id,is_test:true,status:'active'}}},async upsert(row){linked=row;return {}},update(row){productUpdate=row;return this},then(resolve){resolve({data:[{id}],error:null})}}}};
  const result=await dealerSettings(db,{id:'super'},{action:'publish_brand',brand,dealerId:id},{role:'super'});
  assert.equal(linked.brand,brand);assert.equal(result.brand,brand);assert.equal(result.published,1);
  assert.deepEqual(productUpdate,{is_order_available:true,price_vat_included:false});assert.ok(filters.some(([k,v])=>k==='brand'&&v===brand));
 }
});
test('VAT exclusive price adds tax exactly once at payment',()=>{
 const item=salesItem({id,brand:'영림',product_code:'PS156',dealer_price_per_m:6500,price_vat_included:false,is_order_available:true,stock_status:'in_stock'},10);
 assert.equal(item.supply,65000);assert.equal(item.total-item.supply,6500);assert.equal(item.total,71500);
});
