import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), swc=require('next/dist/build/swc');
await swc.loadBindings();
const compile=async path=>(await swc.transform(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true}},module:{type:'commonjs'}})).code;
const workerCode=await compile('app/utils/workerSites.js'), loginCode=await compile('app/utils/unifiedLogin.js');
const id='12345678-1234-1234-1234-123456789abc';
function setup({company=null, companyError=null, worker=null, workerError=null, recent=null}={}){
 const supabase={rpc:async()=>({data:company,error:companyError})};
 const workerExports={};vm.runInNewContext(workerCode,{exports:workerExports,require:()=>({supabase})});
 const exports={};vm.runInNewContext(loginCode,{exports,localStorage:{getItem:()=>recent},require:p=>p.includes('workerSites')?{workerDestination:workerExports.workerDestination,loadMyWorkerSites:async()=>{if(workerError)throw workerError;return {worker};}}:{supabase}});
 return exports;
}
test('existing owner, worker and dual accounts are routed only after capability checks',async()=>{
 const owner={company_id:'c',role:'owner',is_active:true},worker={worker_id:'w',worker_is_active:true};
 assert.equal(await setup({company:owner}).resolveLoginDestination({userId:'u'}),'/admin');
 assert.equal(await setup({worker}).resolveLoginDestination({userId:'u'}),'/worker');
 assert.equal(await setup({company:owner,worker,recent:'worker'}).resolveLoginDestination({userId:'u'}),'/worker');
 assert.equal(await setup({company:owner,worker,recent:'owner'}).resolveLoginDestination({userId:'u'}),'/admin');
 assert.equal(await setup({company:owner,worker,recent:'worker'}).resolveLoginDestination({userId:'u',preference:'owner'}),'/admin');
 assert.equal(await setup({company:{...owner,is_active:false}}).resolveLoginDestination({userId:'u'}),null);
 assert.equal(await setup({company:{company_id:'c',role:'worker'},workerError:{status:403}}).resolveLoginDestination({userId:'u',preference:'owner'}),null);
});
test('invitation links survive login and other redirects are strictly constrained',async()=>{
 const h=setup();
 for(const path of [`/worker/connect/${id}`,`/worker/direct-invite/${id}`,`/worker/invite/${id}`]){
  assert.equal(h.invitationDestination(path),path);
  assert.equal(await h.resolveLoginDestination({next:path,userId:'u'}),path);
 }
 for(const path of ['https://evil.test','//evil.test','/worker/connect/../../admin','/worker/direct-invite/abc','/worker?next=https://evil.test','/worker/%2f%2fevil.test','/admin']) assert.equal(h.loginDestination(path),null);
 assert.equal(await h.resolveLoginDestination({next:`/worker/site/${id}`,userId:'u'}),null);
});
test('lookup failures are not confused with an unregistered account',async()=>{
 await assert.rejects(setup({companyError:Error('offline')}).resolveLoginDestination({userId:'u'}),/offline/);
 await assert.rejects(setup({workerError:{status:500}}).resolveLoginDestination({userId:'u'}));
});
test('legacy invite requires an explicit accept click after authentication',()=>{
 const source=fs.readFileSync(new URL('../app/worker/invite/[code]/WorkerInviteSignup.js',import.meta.url),'utf8');
 assert.equal((source.match(/await acceptInvite\(\)/g)||[]).length,1);
 assert.match(source,/onClick=\{async \(\) => \{/);
 assert.match(source,/\/login\?next=/);
});
