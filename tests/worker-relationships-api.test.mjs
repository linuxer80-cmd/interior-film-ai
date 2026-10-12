import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const id='11111111-1111-4111-8111-111111111111';
function route(auth,result={data:{ok:true}}){
 const calls=[];
 const source=readFileSync(new URL('../app/api/worker-relationships/route.js',import.meta.url),'utf8').replace(/^import .*;\n/m,'').replace(/export /g,'');
 const context=vm.createContext({Response,console:{error(){}},
  privateAuth:async()=>({...auth,db:{rpc:async(name,params)=>{calls.push({name,params});return result;}}}),
  json:(body,status=200)=>Response.json(body,{status}),uuid:v=>typeof v==='string'&&/^[a-f\d-]{36}$/i.test(v)
 });
 vm.runInContext(source+'\nglobalThis.run=POST;',context);
 return {calls,run:body=>context.run({json:async()=>body})};
}
test('relationship API rejects anonymous and unauthenticated callers',async()=>{
 for(const auth of [{error:'로그인 필요',status:401},{user:{id,is_anonymous:true,email_confirmed_at:'now'}}]){
  const r=route(auth);const response=await r.run({action:'list'});
  assert.ok([401,403].includes(response.status));assert.equal(r.calls.length,0);
 }
});
test('relationship API supplies verified identity and email, ignoring forged client claims',async()=>{
 const r=route({user:{id,email:'verified@example.com',email_confirmed_at:'now'}});
 assert.equal((await r.run({action:'accept',code:id,p_actor:'other',verifiedEmail:'forged@example.com',relationshipType:'employee'})).status,200);
 assert.equal(r.calls[0].params.p_actor,id);
 assert.equal(r.calls[0].params.p_body.verifiedEmail,'verified@example.com');
 assert.equal(r.calls[0].params.p_body.p_actor,undefined);
});
test('missing schema produces an actionable setup error without leaking database details',async()=>{
 const r=route({user:{id,email_confirmed_at:'now'}},{error:{code:'PGRST202',message:'private internals'}});
 const response=await r.run({action:'list'});
 assert.equal(response.status,503);const body=await response.json();assert.equal(body.setupRequired,true);assert.ok(!body.error.includes('internals'));
});
