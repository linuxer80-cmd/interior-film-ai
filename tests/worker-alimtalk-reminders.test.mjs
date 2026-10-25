import test from 'node:test';import assert from 'node:assert/strict';
import {workerReminderMessage,assignedReminderWorkers,runWorkerAlimtalkReminders} from '../lib/workerAlimtalkReminders.mjs';
import {solapiConfig} from '../lib/siteAlimtalk.mjs';
const site={id:'site',status:'scheduled',work_dates:['2026-10-26','2026-10-28'],site_name:'현장',address:'서울'},company={company_name:'업체'},worker={id:'worker',name:'시공자',phone:'01012345678',is_active:true};
test('worker gets only the assigned work date using the existing approved worker template',()=>{
 const message=workerReminderMessage(site,company,worker,'2026-10-28');assert.equal(message.kind,'worker_reminder');assert.equal(message.variables['#{시공일}'],'2026-10-28');assert.equal(message.variables['#{시공자명}'],'시공자');assert.equal(message.missing.length,0);
 assert.equal(solapiConfig('worker_reminder',{SOLAPI_TEMPLATE_SITE_ASSIGNED:'worker',SOLAPI_TEMPLATE_CUSTOMER_SCHEDULE:'customer'}).templateId,'worker');
 for(const changed of [{...site,status:'cancelled'},{...site,status:'completed'},{...site,work_dates:[]}])assert.equal(workerReminderMessage(changed,company,worker,'2026-10-28'),null);
 assert.equal(workerReminderMessage(site,company,{...worker,is_active:false},'2026-10-28'),null);
});
test('dated assignments take precedence over legacy assignments even if only another date is assigned',()=>{
 const daily=[{worker_id:'a',work_date:'2026-10-26'},{worker_id:'b',work_date:'2026-10-28'}],legacy=[{worker_id:'c'}];
 assert.deepEqual(assignedReminderWorkers(daily,legacy,'2026-10-26'),['a']);assert.deepEqual(assignedReminderWorkers(daily,legacy,'2026-10-27'),[]);assert.deepEqual(assignedReminderWorkers([],legacy,'2026-10-26'),['c']);
});
test('outside lunch never reads database or calls the messaging provider',async()=>{
 const result=await runWorkerAlimtalkReminders({}, {clock:()=>new Date('2026-10-25T02:59:59Z'),fetcher:()=>{throw Error('must not call');}});assert.equal(result.skipped,'outside_lunch_hour');
});
