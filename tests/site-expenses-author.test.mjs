import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), swc=require('next/dist/build/swc');
await swc.loadBindings();
const source=(await swc.transform(fs.readFileSync(new URL('../app/api/site-expenses/route.js',import.meta.url),'utf8'),{jsc:{parser:{syntax:'ecmascript'}},module:{type:'commonjs'}})).code;
const ids={company:'11111111-1111-4111-8111-111111111111',site:'22222222-2222-4222-8222-222222222222',worker:'33333333-3333-4333-8333-333333333333',other:'44444444-4444-4444-8444-444444444444',user:'55555555-5555-4555-8555-555555555555',expense:'66666666-6666-4666-8666-666666666666'};
function harness({assigned=true}={}){
 let inserted;
 const db={auth:{getUser:async()=>({data:{user:{id:ids.user}}})},from(table){
  let filters={},action='select';
  const q={select(){return q},eq(k,v){filters[k]=v;return q},in(k,v){filters[k]=v;return q},like(){return q},order(){return q},range(){return q},limit(){return q},insert(v){inserted=v;action='insert';return q},
   maybeSingle:async()=>({data: table==='profiles'?{company_id:ids.company,role:'owner',is_active:true}:table==='sites'?{id:ids.site,company_id:ids.company,status:'in_progress',work_dates:null}:table==='companies'?{id:ids.company,is_active:true}:table==='workers'?{id:ids.other}:null,error:null}),
   single:async()=>({data:inserted,error:null}),
   then(resolve){const rows=table==='workers'?[{id:ids.worker}]:table==='site_workers'&&assigned?[{id:'a'}]:[];return Promise.resolve({data:rows,error:null}).then(resolve)}};
  return q;
 }};
 const exports={};vm.runInNewContext(source,{exports,require:()=>({createClient:()=>db}),Response,URL,Intl,Date,Number,Object,console:{error(){}},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'x',SUPABASE_SERVICE_ROLE_KEY:'x'}}});
 return {post:async body=>exports.POST({method:'POST',headers:new Headers({authorization:'Bearer token'}),json:async()=>({siteId:ids.site,id:ids.expense,expense_type:'meal',amount:'12000',expense_date:'2026-01-01',description:'점심',...body})}),get inserted(){return inserted}};
}
test('owner acting as worker has their own expense assigned to their worker record',async()=>{
 const h=harness();const response=await h.post({view:'worker',reimbursementWorkerId:ids.other});
 assert.equal(response.status,201);assert.equal(h.inserted.reimbursement_worker_id,ids.worker);assert.equal(h.inserted.created_by,ids.user);
});
test('worker view cannot use owner rights to bypass assignment',async()=>{
 const h=harness({assigned:false});const response=await h.post({view:'worker'});
 assert.equal(response.status,403);assert.equal(h.inserted,undefined);
});
test('admin entry retains explicit recipient selection',async()=>{
 const h=harness();const response=await h.post({reimbursementWorkerId:ids.other});
 assert.equal(response.status,201);assert.equal(h.inserted.reimbursement_worker_id,ids.other);
});
