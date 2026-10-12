import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contractWage,loadLaborContracts,attachAssignmentState} from '../lib/laborContracts.mjs';
function database(tables) {
 return {from(table) {
  let data=tables[table]||[];
  const q={select(){return q},eq(k,v){data=data.filter(r=>r[k]===v);return q},
   in(k,v){data=data.filter(r=>v.includes(r[k]));return q},order(){return q},
   async range(a,b){return {data:data.slice(a,b+1),error:null}}};
  return q;
 }};
}
test('contract wage applies only to accepted company, worker, site and date',async()=>{
 const db=database({
  workers:[{id:'w',user_id:'u',company_id:'c'}],
  labor_jobs:[{id:'j',company_id:'c',site_id:'s',work_dates:['2026-11-19'],daily_wage:300000},
   {id:'foreign',company_id:'other',site_id:'s',work_dates:['2026-11-19'],daily_wage:900000}],
  labor_applications:[{id:'a',job_id:'j',user_id:'u',status:'accepted'}]
 });
 const contracts=await loadLaborContracts(db,'c',['w']);
 assert.equal(contracts.length,1);
 assert.equal(contractWage(contracts,'w','s','2026-11-19',250000),300000);
 assert.equal(contractWage(contracts,'w','s','2026-11-20',250000),250000);
 assert.equal(contractWage(contracts,'w','other','2026-11-19',250000),250000);
 assert.equal(contractWage([...contracts,{...contracts[0],amount:350000}],'w','s','2026-11-19',250000),null);
 assert.equal(contractWage([{...contracts[0],amount:0}],'w','s','2026-11-19',250000),0);
});
test('assignment state distinguishes full, partial, removed and cancelled assignments',async()=>{
 const job={id:'j',company_id:'c',site_id:'s',work_dates:['2026-11-19','2026-11-20']};
 for(const [dates,status,expected] of [
  [job.work_dates,'scheduled','assigned'],[['2026-11-19'],'scheduled','changed'],
  [[],'scheduled','unassigned'],[job.work_dates,'cancelled','unassigned']
 ]) {
  const app={job_id:'j',user_id:'u',status:'accepted'};
  await attachAssignmentState(database({
   sites:[{id:'s',company_id:'c',status,work_dates:job.work_dates}],
   workers:[{id:'w',company_id:'c',user_id:'u',is_active:true}],
   site_daily_assignments:dates.map((d,i)=>({id:i,site_id:'s',company_id:'c',worker_id:'w',work_date:d}))
  }),[app],[job]);
  assert.equal(app.assignment_status,expected);
  assert.equal(app.has_site_access,expected!=='unassigned');
 }
});
test('confirmed personal wages and dates survive later job edits, with assignment snapshots taking priority',async()=>{
 const db=database({
  workers:[{id:'w',user_id:'u',company_id:'c'}],
  labor_jobs:[{id:'j',company_id:'c',site_id:'changed',work_dates:['2026-12-01'],daily_wage:200000}],
  labor_applications:[{id:'a',job_id:'j',user_id:'u',status:'accepted',accepted_daily_wage:280000,accepted_site_id:'s',accepted_work_dates:['2026-11-19']}],
  worker_assignment_wages:[{company_id:'c',worker_id:'w',site_id:'s',work_date:'2026-11-19',daily_wage:270000},
   {company_id:'foreign',worker_id:'w',site_id:'s',work_date:'2026-11-20',daily_wage:999999}]
 });
 const contracts=await loadLaborContracts(db,'c',['w']);
 assert.equal(contractWage(contracts,'w','s','2026-11-19',100000),270000);
 assert.equal(contractWage(contracts,'w','changed','2026-12-01',100000),100000);
 assert.equal(contractWage(contracts,'w','s','2026-11-20',100000),100000);
 assert.equal(contractWage(contracts.filter(c=>!c.snapshot),'w','s','2026-11-19',100000),280000);
});
