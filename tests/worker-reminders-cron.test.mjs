import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {timingSafeEqual} from 'node:crypto';
const source=fs.readFileSync(new URL('../app/api/alimtalk/worker-reminders/route.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replaceAll('export ','');
test('billable worker reminder cron rejects missing and incorrect credentials before database access',async()=>{
 let calls=0;const context=vm.createContext({Response,Buffer,process:{env:{CRON_SECRET:'test-secret'}},timingSafeEqual,console,createClient:()=>{calls++;return {};},runWorkerAlimtalkReminders:async()=>({requested:0})});vm.runInContext(source+'\nglobalThis.get=GET;',context);
 for(const header of ['', 'Bearer wrong', 'Bearer test-secreu'])assert.equal((await context.get(new Request('https://example.test/api/alimtalk/worker-reminders',{headers:{authorization:header}}))).status,401);
 assert.equal(calls,0);assert.equal((await context.get(new Request('https://example.test/api/alimtalk/worker-reminders',{headers:{authorization:'Bearer test-secret'}}))).status,200);assert.equal(calls,1);
});
