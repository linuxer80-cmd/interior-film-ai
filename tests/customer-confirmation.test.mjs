import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyCustomerConfirmation} from '../lib/customerConfirmation.mjs';
import {buildCustomerStageMessage,stageConfig} from '../lib/customerStageAlimtalk.mjs';
function fixture(status='scheduled',prior=false){
 const filters=[],sent=[];
 const site={id:'site',company_id:'company',status,work_dates:['2099-11-01'],site_name:'현장',customer_phone:'01012345678',address:'주소'};
 const company={id:'company',company_name:'업체',phone:'0212345678',is_active:true};
 const db={from(table){const q={select(){return q},eq(k,v){filters.push([table,k,v]);return q},limit(){return q},maybeSingle(){return q},then(resolve){return Promise.resolve({data:table==='sites'?site:prior?[{id:'old'}]:[]}).then(resolve)}};return q;}};
 const context=async(d,co,id,stage)=>{assert.equal(d,db);assert.equal(co,'company');assert.equal(id,'site');assert.equal(stage,'before');return {site,company,reasons:[],message:buildCustomerStageMessage(site,company,stage,'signed-token'),config:stageConfig(stage,{SOLAPI_TEMPLATE_CUSTOMER_SCHEDULE:'old-template'})};};
 return {db,filters,sent,context,changes:async()=>({handled:false}),dispatch:async args=>{sent.push(args);return {status:'requested'};}};
}
test('confirmation always uses link template and same reservation as manual schedule sends',async()=>{
 const f=fixture();assert.equal((await notifyCustomerConfirmation(f.db,'company','site','owner',f)).status,'requested');
 assert.equal(f.sent.length,1);const call=f.sent[0];assert.equal(call.actorId,'owner');assert.equal(call.expectedLatest,null);
 assert.equal(call.message.kind,'customer_schedule');assert.equal(call.message.to,'01012345678');
 assert.equal(call.message.variables['#{고객페이지토큰}'],'signed-token');assert.equal(call.message.requiredButton.buttonName,'내 시공 안내 보기');
 assert.equal(call.config.templateId,undefined);assert.equal(call.config.templateName,'필름장이_고객시공전안내_링크');
 assert.ok(f.filters.some(([t,k,v])=>t==='sites'&&k==='company_id'&&v==='company'));
});
test('consulting, cancelled, completed, in-progress and already-notified sites do not automatically send again',async()=>{
 for(const status of ['consulting','cancelled','completed','in_progress']){const f=fixture(status);await notifyCustomerConfirmation(f.db,'company','site','owner',f);assert.equal(f.sent.length,0);}
 const f=fixture('scheduled',true);assert.equal((await notifyCustomerConfirmation(f.db,'company','site','owner',f)).status,'already_sent');assert.equal(f.sent.length,0);
});
test('confirmation does not fall back to legacy template when link preparation is blocked',async()=>{
 const f=fixture();f.context=async()=>({reasons:['고객페이지를 확인해주세요.']});
 assert.equal((await notifyCustomerConfirmation(f.db,'company','site','owner',f)).status,'blocked');assert.equal(f.sent.length,0);
});
