import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchEstimate} from '../lib/estimateRequest.mjs';
import {validEstimateRequestId,findSavedEstimate} from '../lib/estimateSaveReplay.mjs';
test('stalled requests and response bodies time out and abort',async()=>{
 for(const bodyOnly of [false,true]) {
   let signal;
   await assert.rejects(fetchEstimate('/test',{}, {timeoutMs:5,fetchImpl:async(_,options)=>{signal=options.signal;if(!bodyOnly)return new Promise(()=>{});return {ok:true,text:()=>new Promise(()=>{})};}}),/응답이 지연/);
   assert.equal(signal.aborted,true);
 }
});
test('completed response retains status and body',async()=>{
 const r=await fetchEstimate('/test',{}, {fetchImpl:async()=>({ok:false,status:429,text:async()=>'{"error":"limit"}'})});
 assert.equal(r.status,429);assert.equal(r.ok,false);assert.equal(await r.text(),'{"error":"limit"}');
});
test('saved request lookup is restricted to request, company and browser session',async()=>{
 const id='11111111-1111-4111-8111-111111111111';const rows=[{id,company_id:'mine',session_id:'session'}];
 const db={from:table=>{assert.equal(table,'estimate_usage');let filtered=rows;const q={select:()=>q,eq:(k,v)=>{filtered=filtered.filter(r=>r[k]===v);return q;},maybeSingle:async()=>({data:filtered[0]||null})};return q;}};
 assert.equal(validEstimateRequestId(id),true);assert.equal(validEstimateRequestId('x'),false);
 assert.equal((await findSavedEstimate(db,{requestId:id,companyId:'mine',sessionId:'session'})).usage_id,id);
 assert.equal(await findSavedEstimate(db,{requestId:id,companyId:'other',sessionId:'session'}),null);
 assert.equal(await findSavedEstimate(db,{requestId:id,companyId:'mine',sessionId:'other'}),null);
});
