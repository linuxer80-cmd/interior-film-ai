import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedTemplate,dispatchSiteMessage} from '../lib/siteAlimtalk.mjs';
import {stageConfig,buildCustomerStageMessage,notifyCustomerStage} from '../lib/customerStageAlimtalk.mjs';
import {stageTemplate,stageButton,CUSTOMER_TEMPLATE_NAMES} from '../lib/customerStages.mjs';
const env={SOLAPI_API_KEY:'test-key',SOLAPI_API_SECRET:'test-secret',SOLAPI_KAKAO_PF_ID:'channel',SOLAPI_TEMPLATE_CUSTOMER_SCHEDULE:'legacy'};
const site={id:'site',site_name:'테스트 현장',customer_name:' ',customer_phone:'01012345678',work_dates:['2099-01-03']},company={id:'company',company_name:'필름장이',phone:'0212345678'};
const template=stage=>({templateId:'approved-'+stage,name:CUSTOMER_TEMPLATE_NAMES[stage],channelId:'channel',status:'APPROVED',content:stageTemplate(stage),buttons:[stageButton(stage)]});
test('all four approved link templates resolve by exact name within the configured channel and send verified IDs',async()=>{
 for(const stage of Object.keys(CUSTOMER_TEMPLATE_NAMES)){
  const config=stageConfig(stage,env),calls=[],rpcs=[];
  const fetcher=async(url,init)=>{calls.push({url,init});if(init.method==='GET')return Response.json([template(stage),{...template(stage),channelId:'other',templateId:'foreign'},{...template(stage),status:'INSPECTING',templateId:'pending'}]);return Response.json({messageList:[{messageId:'receipt',statusCode:'2000'}]});};
  const db={rpc:async(name,args)=>{rpcs.push({name,args});return {data:{accepted:true}};}};
  const message=buildCustomerStageMessage(site,company,stage,'site-specific-signed-token');
  const result=await dispatchSiteMessage({db,site,company,message,config,actorId:'owner',fetcher});
  assert.equal(result.status,'requested');assert.equal(config.templateId,undefined);
  assert.ok(!calls[0].url.includes('templateId=undefined'));assert.ok(!calls[0].url.includes('legacy'));
  assert.equal(rpcs[0].args.p_template,'approved-'+stage);
  assert.equal(rpcs[0].name,stage==='before'?'reserve_site_alimtalk':'reserve_customer_stage');
  const sent=JSON.parse(calls[1].init.body).messages[0];assert.equal(sent.kakaoOptions.templateId,'approved-'+stage);
  assert.equal(sent.kakaoOptions.variables['#{고객페이지토큰}'],'site-specific-signed-token');assert.equal(sent.kakaoOptions.variables['#{고객명}'],'테스트 현장');assert.equal(sent.kakaoOptions.disableSms,true);
 }
});
test('explicit stage ID is honored and never falls back to old schedule configuration',async()=>{
 const config=stageConfig('before',{...env,SOLAPI_TEMPLATE_CUSTOMER_BEFORE:'specific'});
 const result=await approvedTemplate(config,async url=>{assert.match(url,/templateId=specific/);return Response.json([{...template('before'),templateId:'specific'}]);});assert.equal(result.ready,true);
});
test('unapproved, hidden, missing, duplicate names or wrong button never reserve or send',async()=>{
 const t=template('before'),config=stageConfig('before',env),message=buildCustomerStageMessage(site,company,'before','signed-token');
 for(const templates of [[],[{...t,status:'INSPECTING'}],[{...t,isHidden:true}],[{...t,dormant:true}],[t,{...t,templateId:'duplicate'}],[{...t,buttons:[]}],[{...t,buttons:[{...stageButton('before'),linkMo:'https://wrong.example'}]}],[{...t,content:'old content'}]]){
  let requests=0,reservations=0;const result=await dispatchSiteMessage({db:{rpc:async()=>{reservations++;}},site,company,message,config,fetcher:async()=>{requests++;return Response.json(templates);}});
  assert.equal(result.status,'blocked');assert.equal(reservations,0);assert.equal(requests,1);
 }
});
test('missing customer token is blocked before contacting Solapi',async()=>{
 const message=buildCustomerStageMessage(site,company,'before','');let requests=0;
 const result=await dispatchSiteMessage({message,fetcher:async()=>{requests++;}});assert.equal(result.status,'blocked');assert.equal(requests,0);
});
test('automatic completion and payment notices are not gated on manually copied template IDs',async()=>{
 for(const stage of ['complete','care']){
  const calls=[];const context=async()=>({site,company,reasons:[],config:stageConfig(stage,env),message:buildCustomerStageMessage(site,company,stage,'signed-token')});
  const result=await notifyCustomerStage({},company.id,site.id,'owner',stage,{context,dispatch:async c=>{calls.push(c);return {status:'requested'};}});
  assert.equal(result.status,'requested');assert.equal(calls.length,1);assert.equal(calls[0].config.templateName,CUSTOMER_TEMPLATE_NAMES[stage]);
 }
});

test('production preflight validates all approved texts and buttons using only GET requests',async()=>{
 const {checkCustomerTemplateLinks}=await import('../scripts/check-customer-template-links.mjs');let requests=0;
 const result=await checkCustomerTemplateLinks(env,async(url,init)=>{assert.equal(init.method,'GET');assert.equal(init.body,undefined);requests++;return Response.json(Object.keys(CUSTOMER_TEMPLATE_NAMES).map(template));});
 assert.equal(requests,4);assert.equal(result.length,4);assert.ok(result.every(r=>r.ready));assert.ok(!JSON.stringify(result).includes('test-secret'));
 const mismatch=await checkCustomerTemplateLinks(env,async()=>Response.json(Object.keys(CUSTOMER_TEMPLATE_NAMES).map(s=>({...template(s),buttons:[]}))));assert.ok(mismatch.every(r=>!r.ready));
});
