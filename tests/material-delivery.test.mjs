import test from 'node:test';
import assert from 'node:assert/strict';
import {transition,salesItem,deliveryInput} from '../lib/materialPilot.mjs';
const id='11111111-1111-4111-8111-111111111111';
const shipping=method=>({method,recipient_name:'테스트',recipient_phone:'01012345678',address_line1:'서울',feeAccepted:true,workflow:{version:2,phase:'review'}});
const item=salesItem({id,product_code:'PX449',dealer_price_per_m:10000,minimum_order_m:1,order_unit_m:1,is_order_available:true,stock_status:'in_stock',flame_type:'non_fire'},10);
const order=method=>({id,status:'preparing',dealer_id:id,items:[item],shipping:shipping(method),shipments:[],supply_prices:[6500]});
const pickup={name:'수령처',address:'서울 주소',phone:'01012345678',hours:'내일 9시'};
const ready=o=>transition(o,'dealer','ready',{quantities:[10],pickup});
const paid=o=>transition(ready(o),'buyer','test_pay',{expectedTotal:110000});
test('all five methods validate recipients, destination and payer consent',()=>{
 for(const method of ['pickup','nearby','quick','freight','parcel'])assert.equal(deliveryInput(shipping(method)).method,method);
 assert.throws(()=>deliveryInput({...shipping('quick'),feeAccepted:false}));
 assert.throws(()=>deliveryInput({...shipping('nearby'),address_line1:''}));
 assert.throws(()=>deliveryInput({...shipping('parcel'),recipient_phone:''}));
});
test('preparation requires exact quantities and confirmed pickup information',()=>{
 assert.throws(()=>transition(order('parcel'),'dealer','ready',{quantities:[9]}));
 assert.throws(()=>transition(order('nearby'),'dealer','ready',{quantities:[10]}));
 assert.equal(ready(order('nearby')).shipping.workflow.pickup.address,'서울 주소');
 assert.throws(()=>transition(order('parcel'),'buyer','ready',{quantities:[10]}));
});
test('payment is gated on readiness and unchanged total; dispatch requires paid phase',()=>{
 assert.throws(()=>transition(order('parcel'),'buyer','test_pay',{expectedTotal:110000}));
 assert.throws(()=>transition(ready(order('parcel')),'buyer','test_pay',{expectedTotal:1}));
 assert.throws(()=>transition(ready(order('parcel')),'dealer','ship',{shipmentId:id,rolls:[{item:0,length:10}],tracking:'택배 123'}));
 assert.equal(paid(order('parcel')).shipping.workflow.paymentMode,'simulation');
});
test('editing invalidates readiness and preserves authoritative unit price',()=>{
 const o=transition(ready(order('nearby')),'buyer','edit',{quantities:[20],shipping:shipping('quick')});
 assert.equal(o.status,'assigned');assert.equal(o.items[0].total,220000);
 assert.equal(o.shipping.workflow.phase,'review');assert.equal(o.shipping.workflow.pickup,undefined);
 assert.throws(()=>transition(o,'buyer','test_pay',{expectedTotal:220000}));
 assert.throws(()=>transition(paid(order('parcel')),'buyer','edit',{quantities:[20],shipping:shipping('quick')}));
});
test('pickup is confirmed by dealer while other modes require buyer receipt',()=>{
 for(const method of ['pickup','nearby','quick','freight','parcel']){
  let o=transition(paid(order(method)),'dealer','ship',{shipmentId:id,rolls:[{item:0,length:10}],tracking:method==='quick'?'01098765432':'전달 또는 운송장'});
  assert.equal(o.status,method==='pickup'?'received':'shipped');
  if(method!=='pickup'){o=transition(o,'buyer','receive',{shipmentId:id});assert.equal(o.status,'received');}
  assert.throws(()=>transition(o,'buyer','receive',{shipmentId:id}));
 }
 assert.throws(()=>transition(paid(order('quick')),'dealer','ship',{shipmentId:id,rolls:[{item:0,length:10}],tracking:'기사 미정'}));
});
