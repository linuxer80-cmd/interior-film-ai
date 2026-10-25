import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {buildSiteMessage,workDates,phoneNumber,authHeader,dispatchSiteMessage,providerResult,refreshDeliveries} from '../lib/siteAlimtalk.mjs';
const site={id:'30000000-0000-4000-8000-000000000001',site_name:'테스트 현장',customer_name:'테스트 고객',customer_phone:'010-1234-5678',address:'테스트 주소',address_detail:'테스트 동',status:'scheduled',work_dates:['2026-10-28','2026-10-26','2026-10-28']};
const company={id:'10000000-0000-4000-8000-000000000001',company_name:'테스트 업체',phone:'02-123-4567'};
const config={apiKey:'test-key',secret:'test-secret',pfId:'test-pf',templateId:'test-template'};
const message=buildSiteMessage(site,company);
function provider(options={}){
  const calls=[];
  const fetcher=async(url,init)=>{calls.push({url,init});
    if(url.includes('sendable'))return Response.json([{templateId:config.templateId,channelId:config.pfId,status:'APPROVED',content:options.content||message.text}]);
    if(options.timeout)throw Error('timeout');
    return Response.json(options.result||{messageList:[{messageId:'M123456789012345',statusCode:'2000'}],failedMessageList:[]});
  };return {calls,fetcher};
}
function dbStub(accepted=true){const calls=[];return {calls,rpc:async(name,args)=>{calls.push({name,args});return {data:name==='reserve_site_alimtalk'?{accepted,reason:'duplicate'}:{found:true}};}};}
test('actual site values, non-contiguous dates, detail address and customer phone populate all variables',()=>{
  assert.deepEqual(workDates(site),['2026-10-26','2026-10-28']);assert.equal(message.to,'01012345678');assert.deepEqual(message.missing,[]);
  assert.match(message.text,/테스트 고객님/);assert.match(message.text,/테스트 주소 테스트 동/);assert.equal(message.variables['#{업체전화번호}'],'02-123-4567');
  assert.notEqual(buildSiteMessage({...site,customer_phone:'01099998888'},company).contentHash,message.contentHash);
  assert.deepEqual(workDates({...site,work_dates:[]}),[]);
  assert.deepEqual(workDates({schedule_start:'2026-10-25T15:00:00Z',schedule_end:'2026-10-26T15:00:00Z'}),['2026-10-26','2026-10-27']);
});
test('missing fields and unsafe telephone values block sends',async()=>{
  assert.equal(phoneNumber('+82 10-1234-5678'),'01012345678');assert.equal(phoneNumber('01012345678<script>'),'');
  const broken=buildSiteMessage({...site,customer_name:'',customer_phone:'112'},company);assert.ok(broken.missing.includes('고객명'));
  const result=await dispatchSiteMessage({message:broken});assert.equal(result.status,'blocked');
  assert.ok(buildSiteMessage({...site,status:'cancelled'},company).missing.length);
});
test('HMAC uses date+salt and never serializes secret',()=>{
  const date='2026-10-25T01:00:00Z',salt='0123456789abcdef';const header=authHeader(config,date,salt);
  assert.match(header,new RegExp(createHmac('sha256',config.secret).update(date+salt).digest('hex')));assert.ok(!header.includes(config.secret));
});
test('unapproved template, mismatched body and duplicate reservations never send',async()=>{
  let count=0;const db=dbStub(false);let p=provider();
  await dispatchSiteMessage({db,site,company,message,config,fetcher:async()=>{count++;return Response.json([]);}});assert.equal(db.calls.length,0);assert.equal(count,1);
  p=provider({content:'다른 템플릿'});await dispatchSiteMessage({db,site,company,message,config,fetcher:p.fetcher});assert.equal(db.calls.length,0);
  p=provider();await dispatchSiteMessage({db,site,company,message,config,fetcher:p.fetcher});assert.equal(p.calls.length,1);
});
test('accepted sends reserve once, pass exact variables and disable paid SMS fallback',async()=>{
  const db=dbStub(),p=provider();const result=await dispatchSiteMessage({db,site,company,message,config,actorId:'actor',fetcher:p.fetcher});
  assert.equal(result.status,'requested');assert.deepEqual(db.calls.map(c=>c.name),['reserve_site_alimtalk','settle_alimtalk']);
  const body=JSON.parse(p.calls[1].init.body);assert.equal(body.showMessageList,true);assert.equal(body.messages[0].kakaoOptions.disableSms,true);assert.deepEqual(body.messages[0].kakaoOptions.variables,message.variables);
  assert.ok(!JSON.stringify(body).includes(config.secret));assert.equal(db.calls[1].args.p_status,'requested');
});
test('timeouts and malformed responses remain reserved; explicit rejection refunds',async()=>{
  const db=dbStub(),p=provider({timeout:true});const result=await dispatchSiteMessage({db,site,company,message,config,fetcher:p.fetcher});
  assert.equal(result.status,'unknown');assert.equal(db.calls[1].args.p_status,'unknown');
  assert.equal(providerResult({ok:true,status:200,data:{}}).status,'unknown');
  assert.equal(providerResult({ok:false,status:503,data:{}}).status,'unknown');
  assert.equal(providerResult({ok:true,status:200,data:{failedMessageList:[{statusCode:'3040'}]}}).status,'rejected');
});
test('only final ATA receipts settle; pending and missing receipts stay reserved',async()=>{
  const db=dbStub(),rows=[{id:'a',receipt_id:'M1',accounting:'reserved'},{id:'b',receipt_id:'M2',accounting:'reserved'},{id:'c',receipt_id:'M3',accounting:'reserved'},{id:'d',accounting:'reserved'}];
  await refreshDeliveries(db,rows,config,async()=>Response.json({messageList:{M1:{type:'ATA',status:'COMPLETE',statusCode:'4000'},M2:{type:'ATA',status:'COMPLETE',statusCode:'4040'},M3:{type:'ATA',status:'SENDING',statusCode:'2000'}}}));
  assert.deepEqual(db.calls.map(c=>[c.args.p_id,c.args.p_status]),[['a','success'],['b','failed']]);
});

test('reminder uses separate atomic reservation and stable identity across phone changes',async()=>{
 const ids=[];
 for(const to of ['01012345678','01099998888']){
  const calls=[],db={rpc:async(name,args)=>{calls.push({name,args});return {data:{accepted:true}};}},p=provider();
  await dispatchSiteMessage({db,site,company,message:{...message,kind:'customer_reminder',to},config,reminderDate:'2026-10-26',fetcher:p.fetcher});
  assert.equal(calls[0].name,'reserve_customer_reminder');assert.equal(calls[0].args.p_work_date,'2026-10-26');ids.push(calls[0].args.p_id);
 }
 assert.equal(ids[0],ids[1]);
});
test('worker reminder reservation is separate from immediate assignment and customer reminders',async()=>{
 const ids=[];for(const workerId of ['worker-a','worker-b']){
  const calls=[],db={rpc:async(name,args)=>{calls.push({name,args});return {data:{accepted:true}};}},p=provider();
  const result=await dispatchSiteMessage({db,site,company,message:{...message,kind:'worker_reminder'},workerId,config,reminderDate:'2026-10-26',fetcher:p.fetcher});
  assert.equal(result.status,'requested');assert.equal(calls[0].name,'reserve_worker_reminder');assert.equal(calls[0].args.p_worker,workerId);ids.push(calls[0].args.p_id);
 }assert.notEqual(ids[0],ids[1]);
});
test('change event identity is reserved atomically and a retry never reaches the provider',async()=>{
 const p=provider(),calls=[];let accepted=true;
 const db={rpc:async(name,args)=>{calls.push({name,args});if(name==='reserve_worker_change_alert'){const result={data:{accepted,reason:'duplicate'}};accepted=false;return result;}return {data:{found:true}};}};
 const args={db,site,company,message:{...message,kind:'worker_schedule_changed'},workerId:'worker',changeEventId:'alert-id',config,fetcher:p.fetcher};
 assert.equal((await dispatchSiteMessage(args)).status,'requested');assert.equal((await dispatchSiteMessage(args)).status,'blocked');
 assert.equal(calls[0].name,'reserve_worker_change_alert');assert.equal(calls[0].args.p_event,'alert-id');assert.equal(p.calls.filter(c=>c.url.includes('/send-many/')).length,1);
});
