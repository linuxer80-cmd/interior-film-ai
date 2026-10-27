import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildCustomerStageMessage,stageConfig} from '../lib/customerStageAlimtalk.mjs';

const site={id:'30000000-0000-4000-8000-000000000001',company_id:'10000000-0000-4000-8000-000000000001',site_name:'테스트',customer_name:'고객',customer_phone:'01012345678',address:'주소',work_dates:['2026-10-26'],status:'scheduled'};
const company={id:site.company_id,company_name:'업체',phone:'0212345678'};
const source=fs.readFileSync(new URL('../app/api/admin/site-alimtalk/route.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replaceAll('export ','');
function fixture({unauthorized=false,foreign=false}={}){
 const sends=[];
 const db={from(table){const checks=[];const q={select(){return q;},eq(k,v){checks.push([k,v]);return q;},maybeSingle:async()=>({data:table==='sites'?(!foreign&&checks.some(([k,v])=>k==='company_id'&&v===site.company_id)?site:null):company}),single:async()=>({data:company})};return q;}};
 const context=vm.createContext({Request,Response,URL,console:{error(){}},json:(data,status=200)=>Response.json(data,{status}),uuid:value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value),
  privateAuth:async()=>unauthorized?{error:'로그인 필요',status:401}:{db,companyId:company.id,user:{id:'owner'}},customerStageContext:async(db,companyId,siteId,stage)=>{assert.equal(companyId,company.id);assert.equal(siteId,site.id);assert.equal(stage,'before');if(foreign)throw Object.assign(Error('현장을 찾을 수 없습니다.'),{status:404});return {site,company,message:buildCustomerStageMessage(site,company,'before','signed-token'),config:stageConfig('before',{}),reasons:[]};},
  dispatchSiteMessage:async args=>{sends.push(args);return {status:'requested'};}});
 vm.runInContext(source+'\nglobalThis.post=POST;',context);
 const payload={siteId:site.id,contentHash:buildCustomerStageMessage(site,company,'before','signed-token').contentHash,latestId:null,operationId:'40000000-0000-4000-8000-000000000001'};
 return {sends,payload,call:body=>context.post(new Request('https://example.test/api/admin/site-alimtalk',{method:'POST',body:JSON.stringify(body||payload)}))};
}
test('customer route rejects unauthenticated, foreign-site and stale preview writes before provider dispatch',async()=>{
 for(const [options,status] of [[{unauthorized:true},401],[{foreign:true},404]]){const h=fixture(options);assert.equal((await h.call()).status,status);assert.equal(h.sends.length,0);}
 const h=fixture();assert.equal((await h.call({...h.payload,contentHash:'a'.repeat(64)})).status,409);assert.equal(h.sends.length,0);
});
test('customer route requires explicit resend confirmation and ignores injected recipient or template',async()=>{
 const h=fixture(),latestId='40000000-0000-4000-8000-000000000002';assert.equal((await h.call({...h.payload,latestId})).status,409);assert.equal(h.sends.length,0);
 assert.equal((await h.call({...h.payload,to:'01099998888',companyId:'foreign',templateId:'injected'})).status,200);
 assert.equal(h.sends[0].message.to,'01012345678');assert.equal(h.sends[0].company.id,company.id);assert.equal(h.sends[0].actorId,'owner');assert.equal(h.sends[0].message.requiredButton.buttonName,'내 시공 안내 보기');assert.equal(h.sends[0].config.templateName,'필름장이_고객시공전안내_링크');assert.equal(h.sends[0].message.variables['#{고객페이지토큰}'],'signed-token');
});
