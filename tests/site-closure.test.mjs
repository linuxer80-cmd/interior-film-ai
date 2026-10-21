import test from 'node:test';
import assert from 'node:assert/strict';
import {siteClosure} from '../lib/siteClosure.mjs';
const base=()=>({site:{id:'s',status:'completed'},report:{hasReport:true,review:{status:'approved'},materials:[]},payment:{site:{confirmed:true,contract_amount:1000000,outstanding:0}},stock:{trips:[]}});
test('approved site combines payment, unreturned site rolls and actual material prices',()=>{
 const b=base();b.payment.site.outstanding=300000;b.stock.trips=[{site_id:'s',returned:null,label:'R1'},{site_id:'other',returned:null},{site_id:'s',returned:0}];b.report.materials=[{quantity:20,unit_price:null,brand:'영림',product_code:'PW803'},{quantity:0,unit_price:null},{quantity:10,unit_price:0}];
 const r=siteClosure(b);assert.equal(r.complete,false);assert.deepEqual(r.actions.map(a=>a.id),['payment','returns','price']);assert.match(r.actions[0].message,/300,000/);assert.match(r.actions[1].message,/1개/);assert.match(r.actions[2].message,/1건/);assert.equal(r.actions[0].menu,'settlement');assert.equal(r.actions[1].menu,'materials');assert.match(r.actions[2].message,/실제 이익 미확정/);
});
test('empty or failed lookups never produce a completed badge',()=>{
 for(const field of ['payment','stock']){const b=base();delete b[field];const result=siteClosure(b);assert.equal(result.complete,false);assert.ok(result.unknown.length);}
 const b=base();delete b.report.materials;assert.equal(siteClosure(b).complete,false);
 for(const amount of [null,'',NaN]){const b=base();b.payment.site.outstanding=amount;assert.equal(siteClosure(b).complete,false);assert.equal(siteClosure(b).actions[0].id,'confirm-payment');}
 const b2=base();b2.payment.site.contract_amount=null;assert.equal(siteClosure(b2).complete,false);
});
test('resolved items disappear and only independently checked records produce completion',()=>{
 const b=base();b.stock.trips=[{site_id:'s',returned:0}];b.report.materials=[{quantity:20,unit_price:6500}];assert.equal(siteClosure(b).complete,true);b.payment.site.confirmed=false;assert.equal(siteClosure(b).complete,false);b.payment.site.confirmed=true;b.payment.site.contract_amount=0;assert.equal(siteClosure(b).complete,true);
});
test('pending or rejected reviews and cancelled sites never show closure completion',()=>{
 for(const status of ['pending','rejected']){const b=base();b.report.review.status=status;assert.equal(siteClosure(b),null);}const b=base();b.site.status='cancelled';assert.equal(siteClosure(b),null);
});
