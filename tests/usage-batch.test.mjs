import {isOperatorCompany,OPERATOR_COMPANY_ID} from '../lib/operatorCompany.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function harness(planCode='basic') {
 let plans=0;const filters=[];
 const client={from(table){const conditions=[];let rows=[];const q={select(){return q;},eq(k,v){conditions.push([k,v]);return q;},gte(k,v){conditions.push(['gte',k,v]);return q;},lt(k,v){conditions.push(['lt',k,v]);return q;},maybeSingle(){if(table==='subscription_plans')plans++;return Promise.resolve(table==='subscriptions'?{data:{current_period_start:new Date().toISOString()}}:{data:{plan_code:planCode,plan_name:planCode,is_active:true,auto_estimate_limit:3,ai_photo_analysis_limit:5,image_upload_limit:10,storage_mb_limit:100}});},then(ok,bad){if(table==='subscription_plans'){return q.maybeSingle().then(ok,bad);}filters.push(conditions);return Promise.resolve({data:[{quantity:2}]}).then(ok,bad);}};return q;}};
 const source=fs.readFileSync(new URL('../app/utils/serverUsageLimit.js',import.meta.url),'utf8').replace(/^import.*;\n/gm,'').replaceAll('export ','');
 const context={isOperatorCompany,console,createClient:()=>client,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'url',SUPABASE_SERVICE_ROLE_KEY:'test'}}};vm.createContext(context);vm.runInContext(source+'\nglobalThis.api={checkUsageLimit,createUsageCheckContext,loadUsagePlan};',context);
 return {client,api:context.api,filters,get plans(){return plans;}};
}
test('one fresh plan per request; independent quotas and storage still enforced',async()=>{
 const h=harness();const company={id:'mine',subscription_plan:'basic'},context=h.api.createUsageCheckContext();
 const [a,b,storage]=await Promise.all([h.api.checkUsageLimit({company,eventType:'auto_estimate',requestedQuantity:2,supabase:h.client,context}),h.api.checkUsageLimit({company,eventType:'ai_photo_analysis',requestedQuantity:2,supabase:h.client,context}),h.api.loadUsagePlan(h.client,'basic',context)]);
 assert.equal(h.plans,1);assert.equal(a.ok,false);assert.equal(a.status,429);assert.equal(b.ok,true);assert.equal(storage.data.storage_mb_limit,100);
 await h.api.checkUsageLimit({company,eventType:'auto_estimate',supabase:h.client});assert.equal(h.plans,2);
});
test('trial retains lifetime accounting; basic and light retain period filters',async()=>{
 for(const code of ['trial','basic','light']){const h=harness(code);const result=await h.api.checkUsageLimit({company:{id:'mine',subscription_plan:code},eventType:'auto_estimate',supabase:h.client});assert.equal(result.ok,true);assert.equal(h.filters[0].some(f=>f[0]==='gte'),code!=='trial');}
});

test('only the fixed operator company bypasses monthly usage and upload limits',async()=>{
 const h=harness();for(const eventType of ['auto_estimate','image_upload','ai_photo_analysis']){const r=await h.api.checkUsageLimit({company:{id:OPERATOR_COMPANY_ID,subscription_plan:'business',is_active:true},eventType,requestedQuantity:999999,supabase:h.client});assert.equal(r.ok,true);assert.equal(r.unlimited,true);}
 assert.equal(h.plans,0);assert.equal(isOperatorCompany('mine'),false);
});
