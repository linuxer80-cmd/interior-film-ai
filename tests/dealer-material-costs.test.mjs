import test from 'node:test';
import assert from 'node:assert/strict';
import {dealerMaterialCosts} from '../lib/dealerMaterialCosts.mjs';
const planned={id:'p',site_id:'s',company_id:'c',material_type:'planned',brand:'영림',product_code:'PS160',unit:'m'};
const actual={...planned,id:'a',material_type:'actual',brand:'영림 인테리어필름'};
const row={materialId:'a',siteId:'s',amount:1001,quantity:10,unit:'m'};
const trips=[{company_id:'c',site_id:'s',material_id:'p',roll_id:'r1',issued:10,returned:4},{company_id:'c',site_id:'s',material_id:'p',roll_id:'r2',issued:10,returned:6}];
const rolls=[{id:'r1',company_id:'c',supplier:'A대리점'},{id:'r2',company_id:'c',supplier:'B대리점'}];
const run=(rows=[row],m=[planned,actual],t=trips,r=rolls)=>dealerMaterialCosts(rows,m,t,r,'c');
test('actual rows map through canonical brands and split consumed metres while preserving total',()=>{
 const result=run();assert.deepEqual(result.map(x=>x.amount),[600,401]);assert.equal(result.reduce((s,x)=>s+x.amount,0),1001);assert.equal(result.reduce((s,x)=>s+x.quantity,0),10);assert(result.every(x=>x.dealerAllocated));assert.equal(row.amount,1001);
});
test('an archived duplicate cannot hide the active material dealer attribution',()=>{
 const result=run([row],[{...planned,id:'removed',removed_at:'2026-10-27'},planned,actual]);
 assert.deepEqual(result.map(x=>x.dealer),['A대리점','B대리점']);
 assert.equal(result.reduce((sum,x)=>sum+x.amount,0),1001);
});
test('provisional rows use exact material id; manual rows stay unknown',()=>{
 const result=run([{...row,materialId:'p',provisional:true},{siteId:'s',amount:50,quantity:null}]);assert.equal(result.length,3);assert.equal(result[2].dealer,'대리점 미확인');assert.equal(result.reduce((s,x)=>s+x.amount,0),1051);
});
test('ambiguous products, pending returns, unknown supplier and foreign rolls do not guess a dealer',()=>{
 assert.equal(run([row],[planned,actual,{...planned,id:'p2'}])[0].dealer,'대리점 미확인');
 assert.equal(run([row],undefined,[{...trips[0],returned:null}])[0].dealer,'대리점 미확인');
 const result=run([row],undefined,undefined,[{...rolls[0],company_id:'other'},rolls[1]]);assert(result.some(x=>x.dealer==='대리점 미확인'));assert(!result.some(x=>x.dealer==='A대리점'));
});
test('multiple dealers with tiny amounts never produce negative allocation; full returns cost nothing',()=>{
 const ts=Array.from({length:4},(_,i)=>({...trips[0],roll_id:String(i),issued:1,returned:0}));
 const rs=ts.map(t=>({id:t.roll_id,company_id:'c',supplier:t.roll_id}));const result=run([{...row,amount:2}],undefined,ts,rs);assert(result.every(x=>x.amount>=0));assert.equal(result.reduce((s,x)=>s+x.amount,0),2);
 assert.equal(run([row],undefined,[{...trips[0],returned:10}])[0].dealer,'대리점 미확인');
});
