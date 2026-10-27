import test from 'node:test';
import assert from 'node:assert/strict';
import {processCustomerScheduleChanges} from '../lib/customerScheduleChanges.mjs';
import {notifyCustomerConfirmation} from '../lib/customerConfirmation.mjs';
import {buildCustomerStageMessage,stageConfig} from '../lib/customerStageAlimtalk.mjs';
import {stageTemplate,stageButton} from '../lib/customerStages.mjs';
import {dispatchSiteMessage,deliveryId} from '../lib/siteAlimtalk.mjs';
const company={id:'company',company_name:'업체',phone:'0212345678'},site={id:'site',company_id:'company',status:'scheduled',site_name:'현장',customer_name:'고객',customer_phone:'01012345678',work_dates:['2099-11-07','2099-11-08']};
const now=new Date('2099-11-01T03:00:00Z');
const event={id:'event',company_id:'company',site_id:'site',status:'pending',new_dates:site.work_dates,expires_at:'2099-11-02T03:00:00Z'};
function fixture(overrides={}){
 const rows=[{...event,...overrides}],sent=[],filters=[];let live={...site},prepared=0;
 const db={from(table){let patch=null;const checks=[];const q={select(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},update(p){patch=p;return q;},eq(k,v){checks.push([k,v,'eq']);filters.push([table,k,v]);return q;},gt(k,v){checks.push([k,v,'gt']);return q;},then(resolve){
  let data;if(table==='sites')data=live;else if(table==='customer_schedule_alerts'){
   data=rows.filter(r=>checks.every(([k,v,op])=>op==='gt'?r[k]>v:r[k]===v));if(patch)for(const row of data)Object.assign(row,patch);
  }else throw Error('unexpected table '+table);
  return Promise.resolve({data}).then(resolve);
 }};return q;}};
 const options={companyId:'company',siteId:'site',actorId:'owner',clock:()=>now,
 context:async(d,co,id,stage)=>{prepared++;assert.equal(co,'company');assert.equal(id,'site');assert.equal(stage,'before');return {site:live,company,reasons:[],message:buildCustomerStageMessage(live,company,'before','signed-token'),config:stageConfig('before',{})};},
 dispatch:async args=>{sent.push(args);rows[0].status='reserved';return {id:'delivery',status:'requested'};}};
 return {db,rows,sent,filters,options,setLive:s=>{live=s;},get prepared(){return prepared;}};
}
test('changed schedule sends approved linked dates once, and requested/unknown outcomes are never retried automatically',async()=>{
 const f=fixture();let result=await processCustomerScheduleChanges(f.db,f.options);
 assert.equal(result.requested,1);assert.equal(result.handled,true);assert.equal(f.rows[0].status,'requested');
 const sent=f.sent[0];assert.equal(sent.customerScheduleEventId,'event');assert.deepEqual(sent.customerScheduleDates,site.work_dates);
 assert.equal(sent.message.variables['#{시공일}'],'2099-11-07, 2099-11-08');assert.equal(sent.message.requiredButton.buttonName,'내 시공 안내 보기');
 assert.equal(sent.message.variables['#{고객페이지토큰}'],'signed-token');assert.equal(sent.config.templateName,'필름장이_고객시공전안내_링크');
 await processCustomerScheduleChanges(f.db,f.options);assert.equal(f.sent.length,1);
 f.rows[0].status='unknown';await processCustomerScheduleChanges(f.db,f.options);assert.equal(f.sent.length,1);
 assert.ok(f.filters.some(([t,k,v])=>t==='customer_schedule_alerts'&&k==='company_id'&&v==='company'));
});
test('expired, superseded, cancelled and past changes do not prepare a portal or dispatch',async()=>{
 for(const mutate of [f=>{f.rows[0].expires_at='2099-10-31';},f=>f.setLive({...site,work_dates:['2099-11-09']}),f=>f.setLive({...site,status:'cancelled'}),f=>{f.setLive({...site,work_dates:['2000-01-01']});f.rows[0].new_dates=['2000-01-01'];}]){
  const f=fixture();mutate(f);await processCustomerScheduleChanges(f.db,f.options);assert.equal(f.sent.length,0);assert.equal(f.prepared,0);assert.ok(['expired','superseded'].includes(f.rows[0].status));
 }
});
test('missing phone/config retains a pending change; successful change skips initial-confirmation fallback',async()=>{
 const f=fixture();f.options.context=async()=>({reasons:['고객 휴대폰 번호를 확인해주세요.']});
 const result=await processCustomerScheduleChanges(f.db,f.options);assert.equal(result.status,'blocked');assert.equal(f.rows[0].status,'pending');assert.equal(f.sent.length,0);
 const expected={handled:true,status:'requested'};
 const output=await notifyCustomerConfirmation({from(){throw Error('must not send initial notice too');}},'company','site','owner',{changes:async(db,args)=>{assert.equal(args.siteId,'site');assert.equal(args.companyId,'company');return expected;}});assert.equal(output,expected);
});
test('in-progress schedule extension still notifies, but an ineligible stage never sends',async()=>{
 const f=fixture();f.setLive({...site,status:'in_progress'});await processCustomerScheduleChanges(f.db,f.options);assert.equal(f.sent.length,1);
 const blocked=fixture();blocked.options.context=async()=>({reasons:['완료 현장']});await processCustomerScheduleChanges(blocked.db,blocked.options);assert.equal(blocked.sent.length,0);
});
test('provider is called only after atomic event reservation with live recipient and dates; rejected reservations never post',async()=>{
 const config={apiKey:'test',secret:'test',pfId:'channel',templateId:'approved'},message=buildCustomerStageMessage(site,company,'before','signed-token');
 for(const accepted of [true,false]){
  const calls=[],rpcs=[];
  const db={rpc:async(name,args)=>{rpcs.push({name,args});return {data:{accepted,reason:'duplicate'}};}};
  const fetcher=async(url,init)=>{calls.push({url,init});return init.method==='GET'?Response.json([{templateId:'approved',channelId:'channel',status:'APPROVED',content:stageTemplate('before'),buttons:[stageButton('before')]}]):Response.json({messageList:[{messageId:'receipt',statusCode:'2000'}]});};
  const result=await dispatchSiteMessage({db,site,company,message,actorId:'owner',config,fetcher,customerScheduleEventId:'event',customerScheduleDates:site.work_dates});
  assert.equal(rpcs[0].name,'reserve_customer_schedule_alert');assert.equal(rpcs[0].args.p_id,deliveryId(['customer_schedule_event','event']));assert.deepEqual(rpcs[0].args.p_dates,site.work_dates);assert.equal(rpcs[0].args.p_phone,'01012345678');
  assert.equal(calls.filter(c=>c.init.method==='POST').length,accepted?1:0);assert.equal(result.status,accepted?'requested':'blocked');
  if(accepted){const body=JSON.parse(calls.at(-1).init.body);assert.equal(body.messages[0].kakaoOptions.variables['#{시공일}'],'2099-11-07, 2099-11-08');assert.equal(body.messages[0].kakaoOptions.disableSms,true);}
 }
});
