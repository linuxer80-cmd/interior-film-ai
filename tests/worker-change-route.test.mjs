import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app/api/admin/worker-assignment-alerts/route.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replaceAll('export ','');
test('change drain route requires the owner and never accepts a foreign company or client event payload',async()=>{
 const site='30000000-0000-4000-8000-000000000001';let foreign=false,unauthorized=false,queued=[];
 const db={from(){const checks=[];const q={select(){return q;},eq(k,v){checks.push([k,v]);return q;},maybeSingle:async()=>({data:!foreign&&checks.some(([k,v])=>k==='company_id'&&v==='mine')?{id:site}:null})};return q;}};
 const ctx=vm.createContext({json:(data,status=200)=>Response.json(data,{status}),uuid:v=>v===site,privateAuth:async()=>unauthorized?{error:'로그인 필요',status:401}:{db,companyId:'mine',user:{id:'owner'}},after:fn=>queued.push(fn),notifyWorkerChangeAlerts:async(...args)=>{assert.equal(args[1],'mine');assert.equal(args[2],site);}});
 vm.runInContext(source+'\nglobalThis.post=POST;',ctx);const call=()=>ctx.post(new Request('https://example.test',{method:'POST',body:JSON.stringify({siteId:site,companyId:'foreign',old_dates:['fake'],to:'fake'})}));
 unauthorized=true;assert.equal((await call()).status,401);unauthorized=false;foreign=true;assert.equal((await call()).status,404);assert.equal(queued.length,0);foreign=false;assert.equal((await call()).status,200);assert.equal(queued.length,1);await queued[0]();
});
