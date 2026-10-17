import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {salesItem,metres,remaining,transition,visibleOrder} from '../lib/materialPilot.mjs';
const id='11111111-1111-4111-8111-111111111111', sid='22222222-2222-4222-8222-222222222222';
const product={id,brand:'영림',product_code:'PX449',product_name:'발렌블랑',flame_type:'non_fire',dealer_price_per_m:10000,minimum_order_m:1,order_unit_m:1,is_order_available:true,stock_status:'in_stock'};
const order=()=>({id,company_id:id,status:'requested',items:[salesItem(product,70)],shipments:[],supply_prices:[],shipping:{address_line1:'주소'},revision:0});
function prepared(){return transition(transition(order(),'super','assign',{dealerId:id,prices:[6500]}),'dealer','accept',{});}
test('prices and VAT come from product snapshot; invalid quantities or unavailable products rejected',()=>{
 assert.equal(salesItem(product,70).total,770000);
 assert.equal(salesItem({...product,price_vat_included:true},70).total,700000);
 for(const q of [0,-1,Infinity,NaN,.001,10001])assert.throws(()=>metres(q));
 assert.throws(()=>salesItem(product,1.5));assert.throws(()=>salesItem({...product,is_order_available:false},70));
});
test('only platform assigns; only dealer accepts/ships; only buyer receives',()=>{
 assert.throws(()=>transition(order(),'buyer','assign',{dealerId:id,prices:[1]}));
 assert.throws(()=>transition(prepared(),'super','ship',{shipmentId:sid,rolls:[{item:0,length:70}],tracking:'택배'}));
 assert.throws(()=>transition(order(),'dealer','accept',{}));
});
test('partial shipments retain balance and received rolls; final receipt finishes order',()=>{
 let o=prepared();o=transition(o,'dealer','ship',{shipmentId:id,rolls:[{item:0,length:50}],tracking:'테스트 택배'});
 assert.equal(o.status,'partial');assert.equal(remaining(o,0),20);
 o=transition(o,'buyer','receive',{shipmentId:id});assert.equal(o.status,'partial');
 o=transition(o,'dealer','ship',{shipmentId:sid,rolls:[{item:0,length:20}],tracking:'테스트 방문수령'});
 assert.equal(o.status,'shipped');o=transition(o,'buyer','receive',{shipmentId:sid});assert.equal(o.status,'received');
 assert.deepEqual(o.shipments.flatMap(s=>s.rolls.map(r=>r.length)),[50,20]);
 assert.throws(()=>transition(o,'buyer','receive',{shipmentId:sid}));
});
test('combined rolls cannot exceed order even when individual rolls fit',()=>{
 assert.throws(()=>transition(prepared(),'dealer','ship',{shipmentId:id,rolls:[{item:0,length:50},{item:0,length:50}],tracking:'택배'}));
 assert.throws(()=>transition(prepared(),'dealer','ship',{shipmentId:id,rolls:[{item:99,length:1}],tracking:'택배'}));
});
test('outbound blocks cancellation and reallocation; pre-shipping cancellation works',()=>{
 const p=prepared();assert.equal(transition(p,'buyer','cancel',{}).status,'cancelled');
 const s=transition(p,'dealer','ship',{shipmentId:id,rolls:[{item:0,length:1}],tracking:'택배'});
 assert.throws(()=>transition(s,'super','cancel',{}));assert.throws(()=>transition(s,'super','assign',{dealerId:id,prices:[1]}));
});
test('dealer payload excludes sale price, totals, buyer identifier and idempotency hash',()=>{
 const o={...prepared(),buyer_id:'secret',request_hash:'secret'};
 const d=visibleOrder(o,'dealer');assert.equal(d.items[0].supplyPrice,6500);
 for(const key of ['total','buyer_id','request_hash','supply_prices'])assert.equal(d[key],undefined);
 for(const key of ['unitPrice','total','supply','vatIncluded'])assert.equal(d.items[0][key],undefined);
 const b=visibleOrder(o,'buyer');assert.equal(b.supply_prices,undefined);assert.equal(b.total,770000);
});
const source=fs.readFileSync(new URL('../lib/materialPilotServer.js',import.meta.url),'utf8');
const {pilotBuyer,pilotRole}=new Function('createClient',source.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+';return {pilotBuyer,pilotRole};')(()=>{});
function fake(rows) {
 return { from(table) {
  const filters=[];
  return {
   select(){return this;},
   eq(k,v){filters.push([k,v]);return this;},
   async maybeSingle(){const row=rows[table];return {data:row && filters.every(([k,v])=>row[k]===v)?row:null,error:null};}
  };
 } };
}
test('buyer access requires owner, active company, active profile and server allowlist',async()=>{
 const rows={profiles:{id,company_id:sid,role:'owner',is_active:true},companies:{id:sid,is_active:true},material_pilot_companies:{company_id:sid,enabled:true}};
 assert.equal(await pilotBuyer(fake(rows),id),sid);
 assert.equal(await pilotBuyer(fake({...rows,material_pilot_companies:null}),id),null);
 assert.equal(await pilotBuyer(fake({...rows,profiles:{...rows.profiles,role:'worker'}}),id),null);
 assert.equal(await pilotBuyer(fake({...rows,profiles:{...rows.profiles,is_active:false}}),id),null);
 assert.equal(await pilotBuyer(fake({...rows,companies:{id:sid,is_active:false}}),id),null);
});
test('unapproved dealer cannot gain role and client super role needs server membership',async()=>{
 await assert.rejects(pilotRole(fake({material_pilot_dealers:{user_id:id,status:'pending'}}),{id},'dealer'));
 await assert.rejects(pilotRole(fake({}),{id},'super'));
 assert.equal((await pilotRole(fake({material_pilot_dealers:{id:sid,user_id:id,status:'active'}}),{id},'dealer')).dealerId,sid);
});
const route=fs.readFileSync(new URL('../app/api/material-pilot/route.js',import.meta.url),'utf8');
const {createHash}=await import('node:crypto');
function api(actor, stored, denied=false) {
 const db=fake({material_pilot_orders:stored,material_pilot_companies:{company_id:id,enabled:true}});
 return new Function('createHash','pilotIdentity','pilotRole','pilotJson','salesItem','transition','visibleOrder','uuid',route.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+';return POST;')(
 createHash,async()=>({db,user:{id}}),async()=>{if(denied)throw Object.assign(Error('denied'),{status:403});return actor},(b,s=200)=>Response.json(b,{status:s}),salesItem,transition,visibleOrder,v=>/^[0-9a-f-]{36}$/.test(v));
}
const req=b=>new Request('https://example.test/api/material-pilot',{method:'POST',headers:{origin:'https://example.test','Content-Type':'application/json'},body:JSON.stringify({requestId:sid,orderId:id,revision:0,...b})});
test('API denies non-pilot buyers, foreign company orders and unassigned dealers',async()=>{
 assert.equal((await api({},null,true)(req({mode:'buyer',action:'create'}))).status,403);
 assert.equal((await api({role:'buyer',companyId:sid},{...order(),company_id:id})(req({mode:'buyer',action:'cancel'}))).status,404);
 assert.equal((await api({role:'dealer',dealerId:sid},{...order(),dealer_id:id})(req({mode:'dealer',action:'accept'}))).status,404);
});
test('cross-origin requests rejected before identity and database access',async()=>{
 const response=await api({},null)(new Request('https://example.test/api/material-pilot',{method:'POST',headers:{origin:'https://other.test'},body:'{}'}));
 assert.equal(response.status,403);
});
