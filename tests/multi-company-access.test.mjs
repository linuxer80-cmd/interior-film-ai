import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolveWorkerSite } from '../lib/workerSiteAccess.mjs';
const S = '10000000-0000-0000-0000-000000000001';
function database(extra = {}, failure) {
  const tables = { profiles: [], companies: [{id:'a',is_active:true},{id:'b',is_active:true}],
    workers: [{id:'wa',user_id:'u',company_id:'a',is_active:true},{id:'wb',user_id:'u',company_id:'b',is_active:true}],
    sites: [{id:S,company_id:'b'}], site_workers: [],
    site_daily_assignments: [{id:'d',site_id:S,company_id:'b',worker_id:'wb',work_date:'2026-10-11',role:'leader'}], ...extra };
  return { auth: {getUser:async()=>({data:{user:{id:'u'}}})}, from(table) {
    let filters=[],start=0,end=499;
    const result=(single=false)=>{const rows=(tables[table]||[]).filter(r=>filters.every(f=>f(r))).slice(start,end+1);return table===failure?{error:Error('read failed')}:{data:single?rows[0]||null:rows};};
    const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,vs){filters.push(r=>vs.includes(r[k]));return q;},order(){return q;},range(a,b){start=a;end=b;return q;},maybeSingle:async()=>result(true),then(a,b){return Promise.resolve(result()).then(a,b);}};return q;
  }};
}
test('daily-only multi-company worker resolves the site company identity',async()=>{
  const access=await resolveWorkerSite(database(),'u',S);
  assert.equal(access.worker.id,'wb'); assert.equal(access.worker.company_id,'b');assert.equal(access.canSubmit,true);
});
test('membership alone, inactive company/profile and foreign-company assignment cannot grant access',async()=>{
  for(const extra of [{site_daily_assignments:[]},{companies:[{id:'b',is_active:false}]},{profiles:[{id:'u',is_active:false}]},
    {site_daily_assignments:[{id:'d',site_id:S,company_id:'a',worker_id:'wb'}]}, {workers:[]}]){
    await assert.rejects(resolveWorkerSite(database(extra),'u',S),e=>e.status===403);
  }
});
test('effective daily roles override legacy leaders and withdrawn dates',async()=>{
  const legacy=[{id:'old',site_id:S,company_id:'b',worker_id:'wb',role:'leader'}];
  const daily=[{id:'mine',site_id:S,company_id:'b',worker_id:'wb',work_date:'2026-10-11',role:'member'}, {id:'other',site_id:S,company_id:'b',worker_id:'other',work_date:'2026-10-11',role:'leader'}];
  const access=await resolveWorkerSite(database({site_workers:legacy,site_daily_assignments:daily}),'u',S);
  assert.equal(access.canSubmit,false);assert.equal(access.assignment.role,'member');
  await assert.rejects(resolveWorkerSite(database({site_workers:legacy,sites:[{id:S,company_id:'b',work_dates:[]}]}),'u',S),e=>e.status===403);
});
test('assignment pagination preserves the actual leader and database errors fail closed',async()=>{
  const daily=Array.from({length:501},(_,i)=>({id:String(i),site_id:S,company_id:'b',worker_id:i===500?'wb':'other',role:'leader'}));
  assert.equal((await resolveWorkerSite(database({site_daily_assignments:daily}),'u',S)).worker.id,'wb');
  await assert.rejects(resolveWorkerSite(database({},'site_daily_assignments'),'u',S),/read failed/);
});
const ctx=vm.createContext({resolveWorkerSite,Symbol});
vm.runInContext(fs.readFileSync(new URL('../lib/aiQuota.js',import.meta.url),'utf8').replace(/^import[\s\S]*?;\s*/gm,'').replaceAll('export ','')+'\nglobalThis.scope=resolveScope;',ctx);
const headers=new Headers({Authorization:'Bearer test'});
test('AI never chooses an arbitrary company and rejects unassigned site usage',async()=>{
  await assert.rejects(ctx.scope(database(),{worker:true},headers),e=>e.code==='AI_COMPANY_REQUIRED');
  assert.equal(await ctx.scope(database(),{worker:true,siteId:S},headers),'b');
  await assert.rejects(ctx.scope(database({site_daily_assignments:[]}),{worker:true,siteId:S},headers),e=>e.status===403);
  assert.equal(await ctx.scope(database({companies:[{id:'a',is_active:false},{id:'b',is_active:true}]}),{worker:true},headers),'b');
});

test('company listing supports independent workers while preserving disabled-profile rejection', async () => {
  for (const [extra, status, count] of [[{workers:[]},200,0],[{},200,2],[{profiles:[{id:'u',is_active:false}]},403,undefined]]) {
    const client=database(extra);
    const context=vm.createContext({createClient:()=>client,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'test',SUPABASE_SERVICE_ROLE_KEY:'test'}},console,
      Response:{json:(body,options)=>({body,...options})}});
    vm.runInContext(fs.readFileSync(new URL('../app/api/worker/companies/route.js',import.meta.url),'utf8').replace(/^import[\s\S]*?;\s*/gm,'').replaceAll('export ','')+'\nglobalThis.get=GET;',context);
    const result=await context.get({headers});
    assert.equal(result.status,status);assert.equal(result.body.companies?.length,count);
  }
});
