import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const load=(path,context,name)=>{const source=fs.readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replaceAll('export ','');vm.createContext(context);vm.runInContext(source+`\nglobalThis.run = ${name}`,context);return context.run;};
test('tracking rejects foreign origins, bots and malformed identifiers before writing',async()=>{
 let writes=0;
 const run=load('../app/api/landing-visit/route.js',{URL,Response,process:{env:{}},uuid:v=>v==='valid',createClient:()=>({from:()=>({upsert:async()=>{writes++;return {};}})})},'POST');
 const request=(origin,id='valid',ua='Mozilla')=>new Request('https://app.example/api/landing-visit',{method:'POST',headers:{origin,'user-agent':ua},body:JSON.stringify({visitorId:id})});
 assert.equal((await run(request('https://evil.example'))).status,403);
 assert.equal((await run(request('https://app.example','valid','facebookexternalhit'))).status,204);
 assert.equal((await run(request('https://app.example','bad'))).status,400);
 assert.equal(writes,0);
 assert.equal((await run(request('https://app.example'))).status,204);
 assert.equal(writes,1);
});
test('statistics require an active super admin and preserve database failures',async()=>{
 for(const role of ['missing','normal','inactive','super','failure']){
  let reads=0;
  const q={select(){return q;},eq(k,v){if(k==='is_active')assert.equal(v,true);return q;},async maybeSingle(){return {data:role==='super'||role==='failure'?{user_id:'u'}:null};}};
  const run=load('../app/api/super-admin/landing-stats/route.js',{privateJson:(body,status=200)=>({body,status}),privateAuth:async()=>role==='missing'?{error:'login',status:401}:{user:{id:'u'},db:{from:()=>q,rpc:async()=>{reads++;return role==='failure'?{error:Error('db')}:{data:{today:2}};}}}},'GET');
  const result=await run({});
  assert.equal(result.status,role==='missing'?401:role==='super'?200:role==='failure'?503:403);
  assert.equal(reads,['super','failure'].includes(role)?1:0);
 }
});
