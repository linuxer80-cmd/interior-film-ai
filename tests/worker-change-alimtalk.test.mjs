import test from 'node:test';import assert from 'node:assert/strict';
import {buildWorkerChangeMessage} from '../lib/workerChangeAlimtalk.mjs';import {solapiConfig} from '../lib/siteAlimtalk.mjs';
const site={id:'site',site_name:'서울현장',address:'서울',address_detail:'101호'},company={company_name:'필름장이'},worker={name:'시공자',phone:'01012345678'};
test('change and partial cancellation render the registered templates with exact affected dates',()=>{
 const event={kind:'worker_schedule_changed',old_dates:['2026-10-27','2026-10-28'],new_dates:['2026-10-28','2026-10-29'],removed_dates:['2026-10-27']};
 const m=buildWorkerChangeMessage(event,site,company,worker);assert.equal(m.missing.length,0);assert.equal(m.variables['#{변경전시공일}'],'2026-10-27, 2026-10-28');assert.equal(m.variables['#{현장ID}'],'site');assert.match(m.text,/서울 101호/);
 const cancel=buildWorkerChangeMessage({...event,kind:'worker_canceled'},site,company,worker);assert.equal(cancel.variables['#{취소시공일}'],'2026-10-27');assert.ok(!cancel.text.includes('2026-10-28'));assert.ok(!('#{현장ID}' in cancel.variables));
 assert.ok(buildWorkerChangeMessage(event,site,company,{...worker,phone:'bad'}).missing.length);
 assert.equal(solapiConfig('worker_schedule_changed',{SOLAPI_TEMPLATE_WORKER_SCHEDULE_CHANGED:'change'}).templateId,'change');assert.equal(solapiConfig('worker_canceled',{SOLAPI_TEMPLATE_WORKER_CANCELED:'cancel'}).templateId,'cancel');
});
