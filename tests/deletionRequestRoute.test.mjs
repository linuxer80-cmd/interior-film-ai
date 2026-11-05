import {handleDeletionRequest} from '../lib/accountDeletionRequestHandler.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/api/account/deletion/route.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
function fixture({status='review_required',submitError=false,readError=false,assessmentError=false,unauthorized=false}={}){
 const calls=[];let assessments=0;const record={id:'request',status,requested_at:'2026-11-04',updated_at:'2026-11-04'};
 const db={auth:{getUser:async()=>unauthorized?{error:Error('auth')}:{data:{user:{id:'verified-user'}}}},rpc:async(name,args)=>{calls.push({name,args});return submitError?{error:Error('private database detail')}:{data:true};},from(name){assert.equal(name,'account_deletion_requests');const q={select(){return q},eq(k,v){assert.equal(k,'user_id');assert.equal(v,'verified-user');return q},async maybeSingle(){return readError?{error:Error('private database detail')}:{data:record}}};return q;}};
 const assessment=async()=>{assessments++;if(assessmentError)throw Error('private database detail');return {code:'delivery_privacy_review_required',executable:false};};
 const routes=new Function('createClient','assessDeletionRequest','handleDeletionRequest','processAccountDeletionRequest',source+';return {GET,POST};')(()=>db,assessment,handleDeletionRequest,async()=>({status:'review_required'}));
 const request=(body={confirmation:'계정 삭제 요청',userId:'forged-user'})=>new Request('https://example.test/api/account/deletion',{method:'POST',headers:{authorization:'Bearer token','content-type':'application/json'},body:JSON.stringify(body)});
 return {routes,request,calls,record,db,assessment,get assessments(){return assessments;}};
}
test('assessment outage retains successful submission and never trusts supplied user identity',async()=>{
 const f=fixture({assessmentError:true});const response=await f.routes.POST(f.request());
 assert.equal(response.status,202);assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.json();assert.deepEqual(body.request,f.record);assert.deepEqual(body.assessment,{code:'assessment_unavailable',executable:false});
 assert.deepEqual(f.calls,[{name:'submit_account_deletion_request',args:{p_user:'verified-user'}}]);assert.ok(!JSON.stringify(body).includes('private database detail'));
});
test('status refresh recovers assessment without resubmitting deletion',async()=>{
 const f=fixture();const response=await f.routes.GET(f.request());assert.equal(response.status,200);
 assert.equal((await response.json()).assessment.code,'delivery_privacy_review_required');assert.equal(f.calls.length,0);
});
for(const failure of ['submitError','readError'])test(`${failure} still returns failure rather than claiming confirmed submission`,async()=>{
 const f=fixture({[failure]:true});const response=await f.routes.POST(f.request());assert.equal(response.status,503);assert.equal(f.assessments,0);
});
for(const status of ['processing','failed','completed'])test(`${status} is preserved without re-running preflight`,async()=>{
 const f=fixture({status,assessmentError:true});const response=await f.routes.GET(f.request());const body=await response.json();assert.equal(body.request.status,status);assert.equal(body.assessment,null);assert.equal(f.assessments,0);
});
test('unauthorized and unconfirmed requests never submit',async()=>{
 const f=fixture({unauthorized:true});assert.equal((await f.routes.POST(f.request())).status,401);assert.equal(f.calls.length,0);
 const g=fixture();assert.equal((await g.routes.POST(g.request({confirmation:'wrong'}))).status,400);assert.equal(g.calls.length,0);
});

test('trusted processor receives the authenticated subject and returns completion even after Auth removal',async()=>{
 const f=fixture();let seen;
 const response=await handleDeletionRequest(f.request(),true,{authenticate:async()=>({db:f.db,userId:'verified-user'}),assessDeletionRequest:f.assessment,processRequest:async value=>{seen=value;return {status:'completed'};}});
 assert.equal(response.status,200);assert.equal((await response.json()).request.status,'completed');
 assert.equal(seen.userId,'verified-user');assert.equal(seen.requestId,'request');assert.equal(f.assessments,0);
});
test('GET cannot execute deletion and client fields cannot install a processor',async()=>{
 const f=fixture();let count=0;
 await handleDeletionRequest(f.request(),false,{authenticate:async()=>({db:f.db,userId:'verified-user'}),assessDeletionRequest:f.assessment,processRequest:async()=>{count++;}});
 assert.equal(count,0);
 const response=await f.routes.POST(f.request({confirmation:'계정 삭제 요청',processRequest:'execute',execute:true}));assert.equal(response.status,202);
});
test('processor failure cannot produce a completion receipt or leak internal errors',async()=>{
 const f=fixture();const response=await handleDeletionRequest(f.request(),true,{authenticate:async()=>({db:f.db,userId:'verified-user'}),assessDeletionRequest:f.assessment,processRequest:async()=>{throw Error('private error');}});
 assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private error'));
});

test('busy processor returns fresh processing status without stale assessment',async()=>{
 const f=fixture();let reads=0;
 f.db.from=()=>({select(){return this;},eq(k,v){assert.equal(k,'user_id');assert.equal(v,'verified-user');return this;},async maybeSingle(){return {data:{...f.record,status:++reads===1?'review_required':'processing'}};}});
 const response=await handleDeletionRequest(f.request(),true,{authenticate:async()=>({db:f.db,userId:'verified-user'}),assessDeletionRequest:f.assessment,processRequest:async()=>({status:'busy'})});
 const body=await response.json();assert.equal(body.request.status,'processing');assert.equal(body.assessment,null);assert.equal(f.assessments,0);assert.equal(reads,2);
});
test('processor returning review assesses the new review status',async()=>{
 const f=fixture({status:'processing'});let reads=0;
 f.db.from=()=>({select(){return this;},eq(){return this;},async maybeSingle(){return {data:{...f.record,status:++reads===1?'processing':'review_required'}};}});
 const response=await handleDeletionRequest(f.request(),true,{authenticate:async()=>({db:f.db,userId:'verified-user'}),assessDeletionRequest:f.assessment,processRequest:async()=>({status:'review_required'})});
 assert.equal((await response.json()).request.status,'review_required');assert.equal(f.assessments,1);
});
test('lost, changed or unreadable post-processing receipt never returns stale success',async()=>{
 for(const latest of [{data:null},{error:Error('private')},{data:{id:'other-request',status:'completed'}}]){
  const f=fixture();let reads=0;
  f.db.from=()=>({select(){return this;},eq(){return this;},async maybeSingle(){return ++reads===1?{data:f.record}:latest;}});
  const response=await handleDeletionRequest(f.request(),true,{authenticate:async()=>({db:f.db,userId:'verified-user'}),assessDeletionRequest:f.assessment,processRequest:async()=>({status:'busy'})});
  assert.equal(response.status,503);assert.equal(f.assessments,0);assert.ok(!(await response.text()).includes('private'));
 }
});
test('missing processor outcome is an error, not a successful submission result',async()=>{
 const f=fixture();const response=await handleDeletionRequest(f.request(),true,{authenticate:async()=>({db:f.db,userId:'verified-user'}),assessDeletionRequest:f.assessment,processRequest:async()=>undefined});
 assert.equal(response.status,503);
});
