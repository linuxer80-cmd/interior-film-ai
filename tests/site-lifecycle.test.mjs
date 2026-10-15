import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {initialSiteStatus, nextSiteStatus, syncSiteLifecycle, syncAfterReport} from '../lib/siteLifecycle.mjs';

const now = new Date('2026-10-14T15:00:00Z');
const site = (extra = {}) => ({id:'s1',company_id:'a',status:'scheduled',work_dates:['2026-10-15','2026-10-18'],updated_at:'2026-10-13T01:00:00Z',...extra});
const report = (extra = {}) => ({id:'r',site_id:'s1',company_id:'a',review_status:'pending',completed_at:'2026-10-14T10:00:00Z',updated_at:'2026-10-14T10:00:00Z',...extra});

test('direct registration defaults to scheduled without a date; imported consultations stay consulting',()=>{
  assert.equal(initialSiteStatus({}), 'scheduled');
  assert.equal(initialSiteStatus({consultation_quote_seed:{},status:'scheduled'}),'consulting');
});
test('Korea midnight starts work, including missed days; future, undated and explicit empty dates wait',()=>{
  assert.equal(nextSiteStatus(site(),null,new Date('2026-10-14T14:59:59Z')),'scheduled');
  assert.equal(nextSiteStatus(site(),null,now),'in_progress');
  assert.equal(nextSiteStatus(site(),null,new Date('2026-10-16T15:00:00Z')),'in_progress');
  assert.equal(nextSiteStatus(site({work_dates:['2026-10-18']}),null,now),'scheduled');
  assert.equal(nextSiteStatus(site({work_dates:[],schedule_date:'2026-10-13'}),null,now),'scheduled');
  assert.equal(nextSiteStatus(site({work_dates:null,schedule_start:'2026-10-14T15:00:00Z'}),null,now),'in_progress');
  assert.equal(nextSiteStatus(site({work_dates:['2026-02-30']}),null,now),'scheduled');
});
test('consulting does not advance by date; terminal states are preserved',()=>{
  for (const status of ['consulting','completed','cancelled']) assert.equal(nextSiteStatus(site({status}),null,now),status);
  for (const status of ['completed','cancelled']) assert.equal(nextSiteStatus(site({status}),report(),now),status);
});
test('submitted report completes site without approval; drafts, rejected and old reports do not',()=>{
  assert.equal(nextSiteStatus(site(),report(),now),'completed');
  assert.equal(nextSiteStatus(site(),report({review_status:'approved'}),now),'completed');
  assert.equal(nextSiteStatus(site(),report({completed_at:null}),now),'in_progress');
  assert.equal(nextSiteStatus(site(),report({review_status:'rejected'}),now),'in_progress');
  assert.equal(nextSiteStatus(site({status:'in_progress',updated_at:'2026-10-14T11:00:00Z'}),report(),now),'in_progress');
});

function database({sites=[site()],reports=[],race=false,fail=false,role='owner',active=true}={}) {
  const tables={sites:structuredClone(sites),work_reports:structuredClone(reports),profiles:[{id:'u',role,company_id:'a',is_active:active}],companies:[{id:'a',is_active:true}]};
  const writes=[];
  const db={auth:{getUser:async()=>({data:{user:{id:'u'}}})},from(table){
    let filters=[],sorts=[],start=0,end=Infinity,patch;
    const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){return q.eq(k,v);},in(k,v){filters.push(r=>v.includes(r[k]));return q;},gt(k,v){filters.push(r=>r[k]>v);return q;},order(k,o={}){sorts.push([k,o.ascending!==false]);return q;},limit(n){end=n;return q;},range(a,b){start=a;end=b+1;return q;},update(v){patch=v;return q;},
      async maybeSingle(){const r=await q;return {...r,data:r.data?.[0]||null};},
      then(resolve,reject){
        if(fail && table==='sites') return Promise.resolve({error:{code:'offline'}}).then(resolve,reject);
        if(patch && race){tables.sites[0].status='cancelled';tables.sites[0].updated_at='2026-10-14T15:00:01Z';}
        let data=(tables[table]||[]).filter(r=>filters.every(f=>f(r)));
        data.sort((a,b)=>{for(const[k,asc] of sorts){const n=String(a[k]).localeCompare(String(b[k]));if(n)return asc?n:-n;}return 0;});
        data=data.slice(start,end);
        if(patch) for(const row of data){Object.assign(row,patch);writes.push({table,id:row.id});}
        return Promise.resolve({data:structuredClone(data)}).then(resolve,reject);
      }};return q;
  }};
  return {db,tables,writes};
}
test('sync is company-scoped and idempotent, does not modify reports or other records',async()=>{
  const h=database({sites:[site(),site({id:'s2',company_id:'b'})],reports:[report()]});
  assert.equal((await syncSiteLifecycle(h.db,{companyId:'a',now})).changed,1);
  assert.equal(h.tables.sites[0].status,'completed');assert.equal(h.tables.sites[1].status,'scheduled');
  assert.deepEqual(h.tables.work_reports,[report()]);
  assert.equal((await syncSiteLifecycle(h.db,{companyId:'a',now})).changed,0);
  assert.deepEqual(h.writes,[{table:'sites',id:'s1'}]);
});
test('a concurrent cancellation wins over the automatic change',async()=>{
  const h=database({race:true});assert.equal((await syncSiteLifecycle(h.db,{companyId:'a',now})).changed,0);
  assert.equal(h.tables.sites[0].status,'cancelled');assert.equal(h.writes.length,0);
});
test('keyset pagination does not skip sites when earlier pages change status',async()=>{
  const sites=Array.from({length:205},(_,i)=>site({id:String(i).padStart(4,'0')}));
  const h=database({sites});assert.equal((await syncSiteLifecycle(h.db,{now})).changed,205);
  assert.ok(h.tables.sites.every(s=>s.status==='in_progress'));
});
test('failed post-report synchronization is reported while the saved report remains intact',async()=>{
  const h=database({fail:true,reports:[report()]});
  assert.match(await syncAfterReport(h.db,'a','s1'),/완료보고는 저장됐지만/);
  assert.deepEqual(h.tables.work_reports,[report()]);assert.equal(h.writes.length,0);
});

async function ownerSync(options={},token='Bearer test') {
  const h=database(options);
  const source=fs.readFileSync(new URL('../app/api/admin/site-status/sync/route.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replaceAll('export ','');
  const ctx=vm.createContext({Response,console,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'x',SUPABASE_SERVICE_ROLE_KEY:'test'}},createClient:()=>h.db,syncSiteLifecycle:(db,opts)=>syncSiteLifecycle(db,{...opts,now})});
  vm.runInContext(source+'\nglobalThis.post=POST;',ctx);
  const response=await ctx.post(new Request('https://test/sync',{method:'POST',headers:{authorization:token},body:JSON.stringify({companyId:'b'})}));
  return {...h,response};
}
test('owner sync ignores client company ID, rejects workers, disabled accounts and missing login',async()=>{
  const h=await ownerSync({sites:[site(),site({id:'s2',company_id:'b'})]});
  assert.equal(h.response.status,200);assert.equal(h.tables.sites[1].status,'scheduled');
  for(const [opts,token,status] of [[{role:'worker'},'Bearer test',403],[{active:false},'Bearer test',403],[{},'',401]]){
    const h=await ownerSync(opts,token);assert.equal(h.response.status,status);assert.equal(h.writes.length,0);
  }
});
