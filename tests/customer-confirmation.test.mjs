import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyCustomerConfirmation} from '../lib/customerConfirmation.mjs';
function fixture(status='scheduled',prior=false){
 const filters=[],sent=[];
 const site={id:'site',company_id:'company',status,work_dates:['2099-11-01'],site_name:'현장',customer_phone:'01012345678',address:'주소'};
 const company={id:'company',company_name:'업체',phone:'0212345678',is_active:true};
 const db={from(table){const q={select(){return q},eq(k,v){filters.push([table,k,v]);return q},limit(){return q},single(){return q},maybeSingle(){return q},then(resolve){return Promise.resolve({data:table==='sites'?site:table==='companies'?company:prior?[{id:'old'}]:[]}).then(resolve)}};return q;}};
 return {db,filters,sent,dispatch:async args=>{sent.push(args);return {status:'requested'};}};
}
test('confirmed site dispatches exact customer schedule once with scoped actor and first-send reservation',async()=>{
 const f=fixture();assert.equal((await notifyCustomerConfirmation(f.db,'company','site','owner',{dispatch:f.dispatch})).status,'requested');
 assert.equal(f.sent.length,1);assert.equal(f.sent[0].actorId,'owner');assert.equal(f.sent[0].expectedLatest,null);
 assert.equal(f.sent[0].message.kind,'customer_schedule');assert.equal(f.sent[0].message.to,'01012345678');
 assert.ok(f.filters.some(([t,k,v])=>t==='sites'&&k==='company_id'&&v==='company'));
});
test('consulting, cancelled, completed and already-notified sites do not send',async()=>{
 for(const status of ['consulting','cancelled','completed','in_progress']){const f=fixture(status);await notifyCustomerConfirmation(f.db,'company','site','owner',{dispatch:f.dispatch});assert.equal(f.sent.length,0);}
 const f=fixture('scheduled',true);assert.equal((await notifyCustomerConfirmation(f.db,'company','site','owner',{dispatch:f.dispatch})).status,'already_sent');assert.equal(f.sent.length,0);
});
