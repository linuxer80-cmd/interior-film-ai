import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const server=fs.readFileSync('lib/materialPilotServer.js','utf8');
test('verified Kakao without email is accepted; unverified email and forged metadata are rejected',async()=>{
 const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.test';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 try{
  for(const [user,allowed] of [
   [{id:'a',identities:[{provider:'kakao'}]},true],
   [{id:'a',email_confirmed_at:'2026-01-01'},true],
   [{id:'a',identities:[{provider:'email'}]},false],
   [{id:'a',user_metadata:{provider:'kakao'}},false]
  ]){
   const identity=new Function('createClient',server.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+';return pilotIdentity;')(()=>({auth:{getUser:async()=>({data:{user}})}}));
   const attempt=identity(new Request('https://example.test',{headers:{authorization:'Bearer test'}}));
   if(allowed)assert.equal((await attempt).user.id,'a');else await assert.rejects(attempt,{status:401});
  }
 }finally{
  if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
 }
});
const callback=fs.readFileSync('app/auth/kakao/page.js','utf8');
const complete=callback.slice(callback.indexOf('async function complete()'),callback.indexOf('    complete().catch'));
test('dealer callback returns to dealer without owner or worker registration; existing routes preserved',async()=>{
 for(const role of ['dealer','owner','worker']){
  let destination,companyCalls=0,workerCalls=0;
  const run=new Function('supabase','window','workerProfileRequirements','setRoleContext','setNeedsCompany',
   'const active=true;'+complete+';return complete();');
  await run({
   auth:{getSession:async()=>({data:{session:{}}}),getUser:async()=>({data:{user:{id:'a'}}})},
   rpc:async()=>{companyCalls++;return {data:[{company_id:'c',role:'owner'}]}}
  },{location:{search:'?role='+role,hash:'',replace:v=>destination=v},history:{replaceState(){}}},
  async()=>{workerCalls++;return {authenticated:true,complete:true}},()=>{},()=>{});
  assert.equal(destination,{dealer:'/dealer',owner:'/admin',worker:'/worker'}[role]);
  assert.equal(companyCalls,role==='owner'?1:0);assert.equal(workerCalls,role==='worker'?1:0);
 }
});
