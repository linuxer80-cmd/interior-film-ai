import test from 'node:test';
import assert from 'node:assert/strict';
import {combineAdminPersonalSites,isPersonalWorkDay,personalCalendarLabel} from '../lib/adminPersonalSites.mjs';
const own={id:'own',company_id:'company',site_name:'우리 현장',work_dates:['2026-10-21','2026-10-22'],contract_amount:1000000,status:'scheduled'};
const personal={site_id:'foreign',company_id:'other',company_name:'제이원',site_name:'지원 현장',site_status:'scheduled',work_dates:['2026-10-21','2026-10-22','2026-10-23'],assigned_dates:[{work_date:'2026-10-22',role:'member'}],my_role:'member'};
test('company calendar and personal assignment merge once without replacing management data',()=>{
 const input=[own],mine=[{...own,site_id:'own',assigned_dates:[{work_date:'2026-10-21',role:'leader'}],my_role:'leader',contract_amount:0},personal,personal];
 const original=JSON.stringify({input,mine});const result=combineAdminPersonalSites(input,mine,'company');assert.equal(result.length,2);assert.equal(result[0].contract_amount,1000000);assert.equal(result[0].personal_role,'leader');assert.equal(result[0].personal_only,undefined);assert.equal(JSON.stringify({input,mine}),original);
 assert(isPersonalWorkDay(result[0],'2026-10-21'));assert(!isPersonalWorkDay(result[0],'2026-10-22'));
});
test('foreign company calendar contains only personally assigned days and shows company name',()=>{
 const result=combineAdminPersonalSites([own],[personal],'company');const external=result.find(s=>s.personal_only);assert.deepEqual(external.work_dates,['2026-10-22']);assert.equal(external.schedule_start,'2026-10-22');assert.equal(external.company_id,'other');assert.equal(personalCalendarLabel(external,'2026-10-22'),'제이원 · 지원 현장');assert.deepEqual(external.site_workers,[]);
});
test('empty explicit assignment never falls back to whole site period; legacy dates remain supported',()=>{
 assert.equal(combineAdminPersonalSites([],[{...personal,assigned_dates:[]}],'company').length,0);
 const legacy={...personal,schedule_start:'2026-10-21',schedule_end:'2026-10-22',work_dates:null};delete legacy.assigned_dates;
 const r=combineAdminPersonalSites([],[legacy],'company')[0];assert.equal(r.work_dates,null);assert.equal(r.schedule_start,'2026-10-21');assert.equal(r.personal_only,true);
});
test('filtered company sites are not reintroduced through worker data; absent identities are ignored',()=>{
 assert.equal(combineAdminPersonalSites([],[{...own,site_id:'own',assigned_dates:[{work_date:'2026-10-21'}]}],'company').length,0);
 assert.deepEqual(combineAdminPersonalSites([],[{site_id:'x'}],'company'),[]);
});
