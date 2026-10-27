import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSupplement,consultationSupplement,readableConsultationMemo} from '../lib/consultationSupplement.mjs';

test('additional consultation fills missing fields and keeps known zero amounts and confirmed details',()=>{
 const site={customer_name:'미정',address:'인천 부평구',address_detail:'',contract_amount:null,deposit_amount:0,status:'scheduled',work_dates:['2026-11-01'],work_description:'방문 3개',memo:'기존 상담'};
 const data=normalizeSupplement({customer_name:'고객',address:'다른 주소',address_detail:'101호',contract_amount:1000000,deposit_amount:100000,work_dates:['2026-11-03'],work_description:'방문 3개\n신발장 측면',memo:'샘플 방문'});
 const change=consultationSupplement(site,data);
 assert.equal(change.patch.customer_name,'고객');assert.equal(change.patch.contract_amount,1000000);assert.equal(change.patch.address_detail,'101호');
 assert.equal(change.patch.address,undefined);assert.equal(change.patch.deposit_amount,undefined);assert.equal(change.patch.status,undefined);assert.equal(change.patch.work_dates,undefined);
 assert.equal(change.patch.work_description,'방문 3개\n신발장 측면');assert.match(change.patch.memo,/샘플 방문/);
 assert.deepEqual(change.conflicts.map(c=>c.field),['address','deposit_amount','work_dates']);
 const again=consultationSupplement({...site,...change.patch},data);assert.equal(again.patch.memo,undefined);assert.equal(again.patch.work_description,undefined);
});
test('empty dates are filled without confirming the site; historical completed status is preserved',()=>{
 const data=normalizeSupplement({work_dates:['2026-11-03','2026-11-01','2026-11-01']});
 const change=consultationSupplement({status:'consulting'},data);
 assert.deepEqual(change.patch.work_dates,['2026-11-01','2026-11-03']);assert.equal(change.patch.status,undefined);assert.equal(change.patch.schedule_start,'2026-10-31T15:00:00.000Z');
 assert.equal(consultationSupplement({status:'completed'},data).patch.work_dates,undefined);
 assert.equal(consultationSupplement({status:'scheduled',schedule_start:'2026-10-31T15:00:00Z'},data).patch.work_dates,undefined);
});
test('invalid inputs fail instead of erasing records; AI quote prices are never invented',()=>{
 for(const input of [{contract_amount:-1},{contract_amount:'x'},{deposit_amount:1.5},{work_dates:['2026-02-30']},{customer_name:{}},{work_dates:'2026-01-01'}])assert.throws(()=>normalizeSupplement(input));
 const data=normalizeSupplement({contract_amount:'',consultation_quote_seed:{items:[{name:'측면',quantity:'2.5',unit_price:999999}]}});
 assert.equal(data.contract_amount,null);assert.equal(data.consultation_quote_seed.items[0].quantity,'2.5');assert.equal(data.consultation_quote_seed.items[0].unit_price,'');
 assert.equal(readableConsultationMemo('메모\n[상담 추가 e69fbb37-ec0e-4676-a31d-5d5820036ecc]\n방문 예정'),'메모\n[추가 상담]\n방문 예정');
 const old='[상담 추가 e69fbb37-ec0e-4676-a31d-5d5820036ecc]\n방문 예정';
 assert.equal(consultationSupplement({memo:old},normalizeSupplement({})).patch.memo,undefined);
});
