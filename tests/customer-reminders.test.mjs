import test from 'node:test';import assert from 'node:assert/strict';
import {reminderWindow,reminderMessage,runCustomerReminders} from '../lib/customerReminders.mjs';
const company={company_name:'업체',phone:'02-123-4567'},site={status:'scheduled',site_name:'현장',customer_name:'고객',customer_phone:'01012345678',address:'서울',work_dates:['2026-10-28','2026-10-26','2026-10-27']};
test('Korea lunch window and next date across month/year boundaries',()=>{assert.deepEqual(reminderWindow(new Date('2026-12-31T03:00:00Z')),{open:true,tomorrow:'2027-01-01'});assert.equal(reminderWindow(new Date('2026-10-25T02:59:59Z')).open,false);assert.equal(reminderWindow(new Date('2026-10-25T03:59:59Z')).open,true);assert.equal(reminderWindow(new Date('2026-10-25T04:00:00Z')).open,false);});
test('only first construction date gets reminder; link template uses the original separate reminder reservation',()=>{const m=reminderMessage(site,company,'2026-10-26','signed-token');assert.equal(m.kind,'customer_reminder');assert.equal(m.missing.length,0);assert.equal(m.requiredButton.buttonName,'내 시공 안내 보기');assert.equal(m.variables['#{고객페이지토큰}'],'signed-token');assert.equal(reminderMessage(site,company,'2026-10-27'),null);for(const status of ['cancelled','completed','draft'])assert.equal(reminderMessage({...site,status},company,'2026-10-26'),null);assert.equal(reminderMessage({...site,work_dates:[]},company,'2026-10-26'),null);assert.ok(reminderMessage({...site,customer_phone:'bad'},company,'2026-10-26').missing.length);});

test('cron uses link template, signed page token and independent reminder reservation after rechecking the date',async()=>{
 const previous={...process.env};Object.assign(process.env,{SOLAPI_API_KEY:'test',SOLAPI_API_SECRET:'test',SOLAPI_KAKAO_PF_ID:'channel'});delete process.env.SOLAPI_TEMPLATE_CUSTOMER_BEFORE;
 try{
  const {stageTemplate,stageButton,CUSTOMER_TEMPLATE_NAMES}=await import('../lib/customerStages.mjs');
  const now=new Date('2026-10-25T03:00:00Z'),calls=[];let page=0;
  const candidate={...site,id:'site',company_id:'company'};
  const db={from(table){assert.equal(table,'sites');const q={select(){return q},in(){return q},or(){return q},order(){return q},limit(){return q},gt(){return q},then(resolve){return Promise.resolve({data:page++===0?[candidate]:[]}).then(resolve);}};return q;}};
  const fetcher=async()=>Response.json([{templateId:'new-before',name:CUSTOMER_TEMPLATE_NAMES.before,channelId:'channel',status:'APPROVED',content:stageTemplate('before'),buttons:[stageButton('before')]}]);
  const context=async(d,co,id,stage)=>{assert.equal(co,'company');assert.equal(id,'site');assert.equal(stage,'before');return {site:candidate,company:{...company,id:'company'},reasons:[],message:{variables:{'#{고객페이지토큰}':'signed-token'}}};};
  const options={clock:()=>now,context,dispatch:async args=>{calls.push(args);return {status:'requested'};}};
  const result=await runCustomerReminders(db,now,fetcher,options);assert.equal(result.requested,1);assert.equal(calls[0].message.kind,'customer_reminder');assert.equal(calls[0].reminderDate,'2026-10-26');assert.equal(calls[0].message.variables['#{고객페이지토큰}'],'signed-token');assert.equal(calls[0].approval.template.templateId,'new-before');
  page=0;calls.length=0;options.context=async()=>({site:{...candidate,work_dates:['2026-10-30']},company,reasons:[],message:{variables:{'#{고객페이지토큰}':'signed-token'}}});
  await runCustomerReminders(db,now,fetcher,options);assert.equal(calls.length,0);
  page=0;options.context=async()=>({reasons:['취소 현장']});assert.equal((await runCustomerReminders(db,now,fetcher,options)).blocked,1);assert.equal(calls.length,0);
 }finally{for(const key of Object.keys(process.env))if(!Object.hasOwn(previous,key))delete process.env[key];Object.assign(process.env,previous);}
});
