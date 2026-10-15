import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {summarizeOperations,scheduleConflicts,scheduledDays} from '../lib/superMonitor.mjs';
const now=new Date('2026-10-15T15:30:00Z'); // 10/16 in Korea
const c='11111111-1111-4111-8111-111111111111',u='22222222-2222-4222-8222-222222222222';
const base=()=>({company:{id:c,company_name:'업체'},workers:[{id:'w1',company_id:c,user_id:u,name:'시공자',is_active:true}],sites:[],daily:[],legacy:[],reports:[]});
const site=(id,extra={})=>({id,company_id:c,site_name:id,status:'scheduled',work_dates:['2026-10-16','2026-10-18'],updated_at:'2026-10-01',...extra});
const assignment=(site_id,work_date,role='member',worker_id='w1')=>({id:site_id+work_date+worker_id,company_id:c,site_id,worker_id,work_date,role});
test('Korea date, non-consecutive schedule, assignment gaps, canceled exclusion',()=>{
 const f=base();f.sites=[site('one'),site('canceled',{status:'cancelled'})];f.daily=[assignment('one','2026-10-16','leader'),assignment('canceled','2026-10-16')];
 const r=summarizeOperations(f,{now});assert.equal(r.period.today,'2026-10-16');assert.equal(r.summary.cancelled,1);assert.equal(r.summary.unassigned,1);assert.equal(r.upcoming.length,2);assert.equal(r.upcoming[1].date,'2026-10-18');
});
test('latest report wins; canceled reports excluded; overdue is not completed report',()=>{
 const f=base();f.sites=[site('a',{work_dates:['2026-10-01']}),site('b',{work_dates:['2026-10-01']}),site('c',{status:'cancelled'})];
 f.reports=[{id:'r1',company_id:c,site_id:'a',review_status:'pending',updated_at:'2026-10-01'}, {id:'r2',company_id:c,site_id:'a',review_status:'approved',updated_at:'2026-10-02'}, {id:'r3',company_id:c,site_id:'c',review_status:'pending',updated_at:'2026-10-01'}];
 const r=summarizeOperations(f,{now});assert.equal(r.summary.pending,0);assert.equal(r.summary.overdue,1);assert.equal(r.sites.find(s=>s.id==='a').reportStatus,'approved');
});
test('daily assignments override legacy, explicit removed dates do not resurrect assignments',()=>{
 const f=base();f.sites=[site('a')];f.legacy=[{site_id:'a',worker_id:'w1',company_id:c,role:'leader'}];f.daily=[assignment('a','2026-10-17')];
 const r=summarizeOperations(f,{now,workerIds:['w1']});assert.equal(r.sites.length,0);assert.equal(r.upcoming.length,0);
});
test('worker scope hides peers, shared date counted once and role is deduplicated',()=>{
 const f=base();f.workers.push({id:'w2',user_id:u,company_id:c,name:'같은계정',is_active:true});f.sites=[site('a',{work_dates:['2026-10-15']}),site('b',{work_dates:['2026-10-15']}),site('foreign')];f.daily=[assignment('a','2026-10-15'),assignment('a','2026-10-15','leader','w2'),assignment('b','2026-10-15')];
 const r=summarizeOperations(f,{now,workerIds:['w1','w2']});assert.equal(r.summary.pastAssignmentDays,1);assert.equal(r.summary.pastLeaderDays,1);assert.equal(r.sites.length,2);
});
test('cross-company schedule overlap is flagged and duplicate member rows do not create false conflicts',()=>{
 const f=base();f.sites=[site('a')];f.daily=[assignment('a','2026-10-16'),assignment('a','2026-10-16','leader')];const g=summarizeOperations(f,{now});assert.equal(scheduleConflicts([g]).length,0);
 const other={...g,upcoming:g.upcoming.map(r=>({...r,companyId:'other',siteId:'b'}))};assert.equal(scheduleConflicts([g,other]).length,1);
});
test('legacy periods are clipped and explicit empty schedules stay empty',()=>{
 assert.deepEqual(scheduledDays({schedule_start:'2026-09-01',schedule_end:'2026-10-17'},'2026-10-16','2026-10-29'),['2026-10-16','2026-10-17']);
 assert.deepEqual(scheduledDays({work_dates:[],schedule_start:'2026-10-16'},'2026-10-16','2026-10-29'),[]);
});
const source=readFileSync(new URL('../app/api/super-admin/monitor/route.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/export /g,'');
function route({authorized=true,login=true,failTable=null}={}){
 const calls=[];
 const tables={super_admins:authorized?[{user_id:u,is_active:true}]:[],companies:[{id:c,company_name:'업체'}],workers:[{id:u,company_id:c,user_id:u,name:'시공자',is_active:true}],sites:[site('a')],site_workers:[],site_daily_assignments:[{...assignment('a','2026-10-16'),worker_id:u}],work_reports:[]};
 const db={from(table){calls.push(table);let rows=tables[table]||[];const q={select(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},is(k,v){rows=rows.filter(r=>r[k]==v);return q},in(k,ids){rows=rows.filter(r=>ids.includes(r[k]));return q},order(){return q},maybeSingle:async()=>({data:rows[0]||null,error:failTable===table?{code:'failure'}:null}),range:async(a,b)=>({data:rows.slice(a,b+1),error:failTable===table?{code:'failure'}:null})};return q;}};
 const ctx=vm.createContext({URL,Response,console:{error(){}},privateAuth:async()=>login?{db,user:{id:u}}:{error:'로그인 필요',status:401},uuid:v=>typeof v==='string'&&/^[a-f\d-]{36}$/i.test(v),summarizeOperations,scheduleConflicts});vm.runInContext(source+';globalThis.get=GET',ctx);
 return {calls,get:(suffix=`type=company&id=${c}`)=>ctx.get({url:'https://app.test/api/super-admin/monitor?'+suffix})};
}
test('authentication and super-admin checks run before any operational reads',async()=>{
 for(const options of [{login:false},{authorized:false}]){const r=route(options);const res=await r.get();assert.ok([401,403].includes(res.status));assert.ok(!r.calls.includes('sites'));assert.ok(!r.calls.includes('workers'));}
});
test('validation, private response, failures not treated as zero',async()=>{
 const r=route();assert.equal((await r.get('type=company&id=bad')).status,400);assert.ok(!r.calls.includes('sites'));
 const ok=await r.get();assert.equal(ok.status,200);assert.match(ok.headers.get('Cache-Control'),/private, no-store/);assert.equal(ok.headers.get('Vary'),'Authorization');
 const body=await ok.json();assert.equal(body.summary.sites,1);assert.equal(body.summary.workers,1);
 const failed=await route({failTable:'work_reports'}).get();assert.equal(failed.status,503);assert.equal((await failed.json()).summary,undefined);
});
test('account monitoring reads its assignments and unrelated worker does not receive sites',async()=>{
 const a=await (await route().get(`type=account&id=${u}`)).json();assert.equal(a.sites.length,1);
 const b=await (await route().get(`type=account&id=${c}`)).json();assert.equal(b.sites.length,0);assert.equal(b.memberships.length,0);
});
