import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workerDirectory,filterDirectory} from '../lib/superWorkerDirectory.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const fixture={
 users:[{id:'u',email:'worker@example.com',created_at:'2026-10-12',email_confirmed_at:'now',secret:'do not expose'}, {id:'owner'},{id:'pending',email:'unfinished@example.com'}, {id:'super'}, {id:'new',user_metadata:{registration_type:'worker'}}],
 profiles:[{id:'owner',role:'owner',company_id:'c'},{id:'u',name:'기존 이름'}],
 labor:[{user_id:'u',name:'시공자',daily_wage:280000,published:true,seeking:true}],
 workers:[{id:'w1',user_id:'u',company_id:'c',name:'회사 이름',phone:'010-1111-2222',is_active:true},{id:'w2',user_id:'u',company_id:'d',is_active:false},{id:'unlinked',company_id:'c',name:'시공자',phone:'01011112222'}],
 companies:[{id:'c',company_name:'첫 업체'},{id:'d',company_name:'둘째 업체'}],
 relationships:[{worker_id:'w1',user_id:'u',relationship_type:'employee'}],
 personal:[{user_id:'u',phone:'010-9999-8888',bank_name:'secret bank'}],superAdmins:[{user_id:'super'}]
};
test('one account groups memberships, keeps unlinked names separate, and only exposes directory fields',()=>{
 const d=workerDirectory(fixture);
 assert.equal(d.accounts.length,2);const u=d.accounts.find(r=>r.id==='u');assert.equal(u.memberships.length,2);assert.equal(u.memberships[0].relationship,'employee');
 assert.equal(d.unlinked.length,1);assert.equal(d.pending.length,1);assert.equal(d.pending[0].id,'pending');
 assert.equal(u.secret,undefined);assert.equal(u.bank_name,undefined);assert.equal(d.accounts.find(r=>r.id==='new').hasProfile,false);
});
test('search includes personal phone before pagination, and filters company, visibility and unlinked records',()=>{
 const d=workerDirectory(fixture);
 assert.equal(filterDirectory(d,{query:'01099998888'}).length,1);
 assert.equal(filterDirectory(d,{company:'d',status:'seeking'})[0].id,'u');
 assert.equal(filterDirectory(d,{status:'incomplete'})[0].id,'new');
 assert.equal(filterDirectory(d,{kind:'unlinked',query:'시공자'}).length,1);
 assert.equal(filterDirectory(d,{kind:'pending',query:'unfinished'}).length,1);
});
const uid='11111111-1111-4111-8111-111111111111';
function route({authorized=true,authError,conflict=false}={}){
 const calls=[];const tables={profiles:[],labor_profiles:[],workers:[],companies:[],labor_personal_details:[],worker_relationships:[],super_admins:[]};
 const db={from(table){calls.push(table);let updated=false;const q={select(){return q},eq(){return q},order(){return q},update(value){calls.push(value);updated=true;return q},range:async()=>({data:tables[table],error:null}),maybeSingle:async()=>({data:table==='super_admins'?(authorized?{user_id:uid}:null):updated&&!conflict?{user_id:uid}:null,error:null})};return q;},auth:{admin:{listUsers:async()=>{calls.push('auth.users');return {data:{users:[]}};}}}};
 const source=readFileSync(new URL('../app/api/super-admin/workers/route.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/export /g,'');
 const context=vm.createContext({URL,Response,console:{error(){}},workerDirectory,filterDirectory,privateAuth:async()=>authError?{error:'login',status:401}:{db,user:{id:uid}},json:(b,status=200)=>Response.json(b,{status}),uuid:v=>typeof v==='string'&&/^[a-f\d-]{36}$/i.test(v)});
 vm.runInContext(source+'\nglobalThis.get=GET;globalThis.post=POST;',context);
 return {calls,get:()=>context.get({url:'https://app.example/api/super-admin/workers'}),post:body=>context.post({json:async()=>body})};
}
test('non-super-admin and missing login cannot read auth users or worker data or moderate profiles',async()=>{
 for(const config of [{authorized:false},{authError:true}]){
  const r=route(config);assert.ok([401,403].includes((await r.get()).status));assert.ok([401,403].includes((await r.post({action:'unpublish',userId:uid,revision:new Date().toISOString()})).status));
  assert.ok(!r.calls.includes('auth.users'));assert.ok(!r.calls.includes('labor_profiles'));
 }
});
test('super-admin directory is private and stale moderation is rejected',async()=>{
 const r=route();const result=await r.get();assert.equal(result.status,200);assert.ok(r.calls.includes('auth.users'));
 const conflict=route({conflict:true});assert.equal((await conflict.post({action:'unpublish',userId:uid,revision:'2026-10-12T00:00:00Z'})).status,409);
 const ok=route();assert.equal((await ok.post({action:'unpublish',userId:uid,revision:'2026-10-12T00:00:00Z'})).status,200);
 const update=ok.calls.find(c=>typeof c==='object');assert.equal(update.published,false);assert.equal(update.seeking,false);assert.equal(update.daily_wage,undefined);assert.equal(update.is_active,undefined);
});
