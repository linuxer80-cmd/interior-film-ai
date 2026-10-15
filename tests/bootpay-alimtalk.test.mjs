import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {configuration,normalizePhone,verifyWebhook,bootpayRequest} from '../lib/bootpayAlimtalk.mjs';
const env={BOOTPAY_ALIMTALK_ENABLED:'true',BOOTPAY_COMMERCE_CLIENT_KEY:'client',BOOTPAY_COMMERCE_SECRET_KEY:'secret',BOOTPAY_ALIMTALK_WEBHOOK_SECRET:'webhook',BOOTPAY_ALIMTALK_SENDER_KEY:'sender',BOOTPAY_ALIMTALK_TEMPLATE_TEST:'BT_TEST'};
test('disabled by default, requires webhook and sender credentials',()=>{assert.equal(configuration({}).ready,false);assert.equal(configuration(env).ready,true);assert.equal(configuration({...env,BOOTPAY_ALIMTALK_WEBHOOK_SECRET:''}).ready,false);});
test('normalize local mobile number only',()=>{assert.equal(normalizePhone('+82 10-1234-5678'),'01012345678');assert.equal(normalizePhone('010-1234-5678'),'01012345678');assert.equal(normalizePhone('1234'),'');});
test('webhook raw signature, stale/future/tampered rejection',()=>{
 const now=1800000000000,ts=String(now/1000),raw='{"event":"test"}';
 const headers=new Headers({'x-bootpay-timestamp':ts,'x-bootpay-signature':'sha256='+createHmac('sha256','key').update(`${ts}.${raw}`).digest('hex')});
 assert.equal(verifyWebhook(raw,headers,'key',now),true);assert.equal(verifyWebhook(raw+' ',headers,'key',now),false);assert.equal(verifyWebhook(raw,headers,'key',now+301000),false);assert.equal(verifyWebhook(raw,headers,'key',now-301000),false);assert.equal(verifyWebhook(raw,headers,'other',now),false);
});
test('uses current message host and stable id, basic auth',async()=>{
 const result=await bootpayRequest('/alimtalk/send',{ref_id:'stable',to:'01012345678'},{env,fetchImpl:async(url,options)=>{assert.equal(url,'https://message.bootapi.com/alimtalk/send');assert.equal(options.headers.Authorization,'Basic '+Buffer.from('client:secret').toString('base64'));assert.equal(JSON.parse(options.body).ref_id,'stable');return Response.json({receipt_id:'receipt',status:'requested'});}});assert.equal(result.status,'requested');
});
test('timeouts/5xx uncertain; confirmed 400 rejected; malformed success uncertain',async()=>{
 for(const status of [400,408,429,500])await assert.rejects(()=>bootpayRequest('/alimtalk/send',{}, {env,fetchImpl:async()=>Response.json({error_code:'BAD'},{status})}),e=>e.rejected===(status===400));
 await assert.rejects(()=>bootpayRequest('/alimtalk/send',{}, {env,fetchImpl:async()=>Response.json({})}),/응답 확인/);
});
const serviceSource=readFileSync(new URL('../lib/alimtalkService.js',import.meta.url),'utf8').replace("'./bootpayAlimtalk.mjs'",JSON.stringify(new URL('../lib/bootpayAlimtalk.mjs',import.meta.url).href));
const service=await import('data:text/javascript;base64,'+Buffer.from(serviceSource).toString('base64'));
test('not configured or invalid recipient never reserves funds',async()=>{
 const db={rpc(){throw Error('unexpected mutation');}};
 assert.equal((await service.sendDelivery(db,{kind:'TEST',phone:'01012345678'},{})).reason,'not_configured');
 assert.equal((await service.sendDelivery(db,{kind:'TEST',phone:'bad'},env)).reason,'invalid_phone');
});
test('duplicate/insufficient requests never call provider',async()=>{
 for(const reason of ['duplicate','insufficient','disabled'])assert.equal((await service.sendDelivery({rpc:async()=>({data:{accepted:false,reason}})},{id:'id',companyId:'company',kind:'TEST',phone:'01012345678'},env)).reason,reason);
});
test('owner route scopes delivery lookup and test phone to authenticated company',()=>{
 const s=readFileSync(new URL('../app/api/admin/alimtalk/route.js',import.meta.url),'utf8');
 assert.match(s,/authenticateAdmin\(request\)/);assert.match(s,/eq\('id',b.id\).eq\('company_id',auth.companyId\)/);assert.match(s,/phone:c.phone/);assert.doesNotMatch(s,/phone:b.phone/);
});
test('send reserves once, holds unknown, refunds only explicit rejection',async()=>{
 const original=globalThis.fetch;
 try {
  for(const scenario of ['success','rejected','uncertain']){
   const calls=[];const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='reserve_alimtalk'?{accepted:true}:{found:true}};}};
   globalThis.fetch=async()=>scenario==='success'?Response.json({receipt_id:'receipt',status:'requested'}):scenario==='rejected'?Response.json({error_code:'TEMPLATE_NOT_APPROVED'},{status:400}):Promise.reject(Error('timeout'));
   const r=await service.sendDelivery(db,{id:'stable',companyId:'company',kind:'TEST',phone:'01012345678',variables:{}},env);
   assert.equal(calls.length,2);assert.equal(calls[0].name,'reserve_alimtalk');assert.equal(calls[1].args.p_status,scenario==='success'?'requested':scenario==='rejected'?'rejected':'unknown');
  }
 }finally{globalThis.fetch=original;}
});
test('owner API rejects unauthenticated and cross-company result reads',async()=>{
 const source=readFileSync(new URL('../app/api/admin/alimtalk/route.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const make=new AsyncFunction('authenticateAdmin','configuration','bootpayRequest','sendDelivery','settleDelivery',source.replace(/export /g,'')+'\nreturn {GET,POST};');
 let auth={success:false,status:401,error:'login'};
 const api=await make(async()=>auth,configuration,()=>{throw Error('provider must not be called');},()=>{},()=>{});
 assert.equal((await api.GET(new Request('https://app/api'))).status,401);
 const filters=[];const chain={select(){return this;},eq(k,v){filters.push([k,v]);return this;},async maybeSingle(){return {data:null};}};
 auth={success:true,companyId:'own-company',db:{from(){return chain;}}};
 const r=await api.POST(new Request('https://app/api',{method:'POST',body:JSON.stringify({action:'refresh',id:'11111111-1111-4111-8111-111111111111'})}));
 assert.equal(r.status,404);assert.deepEqual(filters[1],['company_id','own-company']);
});
