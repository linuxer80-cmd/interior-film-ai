import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {registrationStatus,similarRegistrationSites,registrationConsultation} from '../lib/siteRegistration.mjs';
import {initialSiteStatus} from '../lib/siteLifecycle.mjs';
const require=createRequire(import.meta.url);
test('explicit confirmation and dates determine status independently of AI input',()=>{
 for(const seed of [null,{items:[]}]) for(const confirmed of [false,true]) for(const dates of [[],['2026-10-28','2026-10-30']]){
 const status=registrationStatus(confirmed,dates);assert.equal(status,confirmed&&dates.length?'scheduled':'consulting');
 assert.equal(initialSiteStatus({registration_flow:true,status,work_dates:dates,consultation_quote_seed:seed}),status);
 }
 assert.equal(initialSiteStatus({consultation_quote_seed:{},status:'scheduled'}),'consulting');
});
test('candidate matching ignores phone formatting and preserves separate units as user choices',()=>{
 const sites=[{id:'one',site_name:'송도 SK뷰',address:'인천 연수구 송도동',address_detail:'101동',customer_phone:'010-1234-5678'},{id:'two',site_name:'다른 현장',address:'서울 서초구',customer_phone:'01099998888'}];
 assert.deepEqual(similarRegistrationSites(sites,{customer_phone:'01012345678'}).map(s=>s.id),['one']);
 assert.deepEqual(similarRegistrationSites(sites,{address:'인천 연수구 송도동',address_detail:'102동'}).map(s=>s.id),['one']);
 assert.equal(similarRegistrationSites(sites,{site_name:'집',address:'인천'}).length,0);
});
test('consultation append includes extracted parts and never fabricates amounts',()=>{
 assert.equal(registrationConsultation({consultation_text:'상담',work_description:'상담',consultation_quote_seed:{items:[{name:'방문',detail:'3개',unit_price:50000}]}}),'상담\n방문 · 3개');
});
const swc=require('next/dist/build/swc');
await swc.loadBindings();
const compiled=(await swc.transform(fs.readFileSync(new URL('../app/hooks/useSites.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript'},target:'es2022'},module:{type:'commonjs'}})).code;
function hook({foreign=false,conflict=false,prepareError=false}={}){
 let existing={id:'site',company_id:foreign?'other':'co',customer_name:'기존 고객',contract_amount:1000000,deposit_amount:200000,status:'in_progress',work_dates:['2026-10-21'],memo:'기존 상담',updated_at:'old'};
 const writes=[];const states=[];
 const React={useCallback:f=>f,useState(value){const i=states.length;states.push(value);return [value,next=>{states[i]=typeof next==='function'?next(states[i]):next;}];}};
 const db={auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},from(table){let operation='',payload,filters=[];const query={select(){return query;},eq(key,value){filters.push([key,value]);return query;},is(key,value){filters.push([key,value]);return query;},update(value){operation='update';payload=value;return query;},insert(value){operation='insert';payload=value;return query;},single(){return query;},maybeSingle(){return query;},then(resolve){let data=null,error=null;if(table==='sites'&&operation==='insert'){data={id:'new',...payload};writes.push({table,payload});}else if(table==='site_materials'&&operation==='insert'){data=payload;writes.push({table,payload});}else if(table==='sites'&&filters.every(([k,v])=>existing[k]===v)){if(operation==='update'){if(!conflict){writes.push({table,payload});existing={...existing,...payload};data=existing;}}else data=existing;}return Promise.resolve({data,error}).then(resolve);}};return query;}};
 const exports={};vm.runInNewContext(compiled,{exports,fetch:async(url,options)=>{if(url==='/api/admin/registration-materials')return Response.json(prepareError?{error:'매입단가 조회 실패'}:{materials:[{brand:'현대보닥',product_code:'ZX103',film_product_id:'product',price_type:'non_fire',quantity:0,unit:'m',unit_price:8400,total_price:0}]},{status:prepareError?500:200});return Response.json({});},console:{error(){}},crypto,Date,require:path=>path==='react'?React:path.includes('supabase')?{supabase:db}:path.includes('siteLifecycle')?{initialSiteStatus}:path.includes('siteRegistration')?{registrationConsultation}:{saveConsultation(){throw Error('legacy merge must not run');}}});
 return {create:exports.default({companyId:'co'}).createSite,writes,states,get site(){return existing;}};
}
const append={registration_flow:true,existing_site_id:'site',registration_request_id:'request',consultation_text:'방문 추가 문의',customer_name:'덮어쓰면 안됨',contract_amount:9,work_dates:['2026-11-01'],materials:[{product_name:'추가 자재'}],request_photos:[{name:'never-upload'}]};
test('append only writes memo with company and revision guards; retries never duplicate',async()=>{
 const h=hook();const result=await h.create(append);assert.equal(result.success,true);assert.equal(result.merged,true);assert.equal(h.writes.length,1);assert.deepEqual(Object.keys(h.writes[0].payload).sort(),['memo','updated_at']);assert.equal(h.site.customer_name,'기존 고객');assert.equal(h.site.contract_amount,1000000);assert.deepEqual(h.site.work_dates,['2026-10-21']);assert.match(h.site.memo,/방문 추가 문의/);
 assert.equal((await h.create(append)).success,true);assert.equal(h.writes.length,1);
});
test('foreign and concurrently edited sites cannot receive consultation appends',async()=>{
 for(const options of [{foreign:true},{conflict:true}]){const h=hook(options);const result=await h.create(append);assert.equal(result.success,false);assert.equal(h.writes.length,0);}
});
test('new confirmed AI site saves explicit status and seed without legacy auto-merge',async()=>{
 const h=hook();const result=await h.create({registration_flow:true,status:'scheduled',work_dates:['2026-10-28','2026-10-30'],site_name:'신규',address:'주소',customer_type:'business',consultation_quote_seed:{items:[{name:'문'}]},materials:[],request_photos:[]});assert.equal(result.success,true);assert.equal(h.writes.length,1);assert.equal(h.writes[0].payload.status,'scheduled');assert.equal(h.writes[0].payload.customer_type,'business');assert.equal(h.writes[0].payload.consultation_quote_seed.items[0].name,'문');assert.equal(h.writes[0].payload.contract_amount,null);
});

test('new registration persists resolved purchase identity and fails before site creation if price lookup fails',async()=>{
 const form={registration_flow:true,status:'consulting',materials:[{brand:'현대',product_code:'Zx103',price_type:'non_fire'}]};
 const h=hook();assert.equal((await h.create(form)).success,true);
 const row=h.writes.find(w=>w.table==='site_materials').payload[0];assert.equal(row.price_type,'non_fire');assert.equal(row.unit_price,8400);assert.equal(row.brand,'현대보닥');assert.equal(row.film_product_id,'product');assert.equal(row.material_type,'planned');
 const failed=hook({prepareError:true});assert.equal((await failed.create(form)).success,false);assert.equal(failed.writes.length,0);
});
