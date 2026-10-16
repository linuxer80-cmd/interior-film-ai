import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/api/achievements/activity/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
function fixture(allowed=true){
 const calls=[];
 const ctx=vm.createContext({URL,Request,Response,achievementAuth:async()=>({db:{},user:{id:'signed-in-worker'}}),
  workerContext:async()=>Response.json(allowed?{worker:{}}:{error:'배정 없음'},{status:allowed?200:403}),
  json:(body,status=200)=>Response.json(body,{status}),recordWorkerActivity:async(_db,user,feature)=>{calls.push([user,feature]);return true;}});
 vm.runInContext(source+'\nglobalThis.post=POST;',ctx);
 return {calls,post:body=>ctx.post(new Request('https://test/api/achievements/activity',{method:'POST',body:JSON.stringify(body)}))};
}
test('cutting completion is attributed only to the signed-in user',async()=>{
 const f=fixture();assert.equal((await f.post({feature:'cutting',usedRollCount:1,totalBatchCount:2,user_id:'someone-else'})).status,200);
 assert.deepEqual(f.calls,[['signed-in-worker','cutting']]);
});
test('client cannot fabricate search activity or an empty cutting calculation',async()=>{
 const f=fixture();
 assert.equal((await f.post({feature:'nearby_food',usedRollCount:1,totalBatchCount:1})).status,400);
 assert.equal((await f.post({feature:'cutting',usedRollCount:0,totalBatchCount:0})).status,400);
 assert.equal(f.calls.length,0);
});
test('unassigned-site requests are not counted',async()=>{
 const f=fixture(false);assert.equal((await f.post({feature:'cutting',siteId:'forbidden',usedRollCount:1,totalBatchCount:1})).status,403);
 assert.equal(f.calls.length,0);
});
