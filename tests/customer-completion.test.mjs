import test from 'node:test';
import assert from 'node:assert/strict';
import {completionMessage,completionConfig} from '../lib/customerCompletion.mjs';
const company={company_name:'업체',phone:'01012345678'},site={site_name:'현장',customer_name:'고객',customer_phone:'01011112222'};
test('customer completion includes registered contract amount and company account without subtracting deposit',()=>{
 const m=completionMessage({...site,contract_amount:1200000,deposit_amount:300000},company,'은행 123-456 예금주','2026-10-26');
 assert.equal(m.variables['#{계약금액}'],'1,200,000원');assert.match(m.text,/■ 계약금액: 1,200,000원/);assert.match(m.text,/은행 123-456 예금주/);assert.equal(m.missing.length,0);
});
test('unknown amount removes the whole amount line; zero remains an explicit contract amount',()=>{
 for(const amount of [null,undefined,'']){const m=completionMessage({...site,contract_amount:amount},company,'은행 계좌','2026-10-26');assert.equal(m.hasAmount,false);assert.ok(!m.text.includes('계약금액'));assert.ok(!Object.hasOwn(m.variables,'#{계약금액}'));}
 assert.match(completionMessage({...site,contract_amount:0},company,'은행 계좌','2026-10-26').text,/계약금액: 0원/);
});
test('missing customer name uses site, missing account or recipient blocks send',()=>{
 const m=completionMessage({...site,customer_name:'',customer_phone:''},company,'','2026-10-26');assert.equal(m.variables['#{고객명}'],'현장');assert.ok(m.missing.includes('입금계좌'));assert.ok(m.missing.includes('고객 휴대폰 번호'));
});
test('different reviewed templates are required for amount/account variants',()=>{
 const env={SOLAPI_TEMPLATE_CUSTOMER_COMPLETION_AMOUNT:'amount',SOLAPI_TEMPLATE_CUSTOMER_COMPLETION_ACCOUNT:'account',SOLAPI_TEMPLATE_CUSTOMER_SCHEDULE:'schedule'};
 assert.equal(completionConfig(true,env).templateId,'amount');assert.equal(completionConfig(false,env).templateId,'account');assert.equal(completionConfig(false,{}).templateId,undefined);
});

test('completion dispatch uses separate reservation and a duplicate never sends twice',async()=>{
 const {dispatchSiteMessage}=await import('../lib/siteAlimtalk.mjs');
 const message=completionMessage({...site,contract_amount:100},company,'은행 계좌','2026-10-26');
 const config={apiKey:'key',secret:'secret',pfId:'channel',templateId:'template'};let reserved=false,sends=0;const calls=[];
 const db={rpc:async(name,args)=>{calls.push(name);if(name==='reserve_customer_completion'){const accepted=!reserved;reserved=true;return {data:{accepted,reason:'duplicate'}};}return {data:{found:true}};}};
 const fetcher=async(url)=>{if(url.includes('sendable'))return Response.json([{templateId:'template',channelId:'channel',status:'APPROVED',content:message.text}]);sends++;return Response.json({messageList:[{messageId:'M123456789012345',statusCode:'2000'}]});};
 const args={db,site:{id:'site'},company:{...company,id:'company'},message,config,actorId:'owner',fetcher};
 assert.equal((await dispatchSiteMessage(args)).status,'requested');assert.equal((await dispatchSiteMessage(args)).status,'blocked');assert.equal(sends,1);assert.equal(calls[0],'reserve_customer_completion');
});
