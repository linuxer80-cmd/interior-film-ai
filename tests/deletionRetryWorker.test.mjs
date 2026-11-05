import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {handleDeletionRetry} from '../lib/accountDeletionRetryWorker.mjs';
import {retryStoredAccountDeletionRequest,processAccountDeletionRequest} from '../lib/accountDeletionProcessor.mjs';

test('worker cannot query without authentication or explicit activation; caller cannot select target',async()=>{
 let queried=false;const calls=[];const q={};
 for(const method of ['select','eq','is','gte','lt','lte','order'])q[method]=(...args)=>{calls.push([method,...args]);return q;};
 q.limit=async n=>{assert.equal(n,1);return {data:[{id:'stored'}]};};
 const options={secret:'worker-secret',enabled:true,createDb:()=>{queried=true;return {from:()=>q};},processRequest:async args=>{
  assert.equal(args.requestId,'stored');assert.equal(args.userId,undefined);return {status:'completed'};
 }};
 for(const [header,secret] of [[null,'worker-secret'],['Bearer wrong','worker-secret'],['Bearer undefined',undefined]]){
  const r=await handleDeletionRetry(new Request('https://example.invalid',{headers:header?{authorization:header}:{}}),{...options,secret});
  assert.equal(r.status,401);assert.equal(queried,false);
 }
 const request=new Request('https://example.invalid?requestId=foreign',{headers:{authorization:'Bearer worker-secret'}});
 assert.equal((await (await handleDeletionRetry(request,{...options,enabled:false})).json()).status,'disabled');assert.equal(queried,false);
 const result=await handleDeletionRetry(request,options);
 assert.deepEqual(await result.json(),{status:'completed'});assert.equal(result.headers.get('Cache-Control'),'no-store');
 assert.ok(calls.some(x=>JSON.stringify(x)===JSON.stringify(['eq','status','failed'])));
 assert.ok(calls.some(x=>JSON.stringify(x)===JSON.stringify(['is','lease_token',null])));
});

function missingAuthFixture({residue=false,authError='user_not_found',subject='user',status='failed'}={}) {
 const calls=[];
 const db={from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'request',user_id:null,subject_id:subject,status,identity_verified:true,scope:'personal_account'}})}),
 auth:{admin:{getUserById:async()=>({error:{code:authError}})}},rpc:async(name)=>{
  calls.push(name);
  if(name==='claim_account_deletion_retry')return {data:[{user_id:null,subject_id:'user',lease_token:'lease',status:'processing',identity_verified:true,scope:'personal_account'}]};
  if(name==='inspect_minimal_personal_deletion')return {data:{subjectId:'user',eligible:true,codes:[],filesRemaining:residue?1:0,profileRemaining:false}};
  if(name==='inspect_account_deletion_references')return {data:[]};
  if(name==='verify_account_deletion_core')return {data:Object.fromEntries(['sessions_clear','refresh_tokens_clear','push_clear','labor_profile_clear','labor_private_clear','directory_consent_clear','worker_private_clear','worker_details_clear'].map(k=>[k,true]))};
  if(['assert_account_deletion_lease','complete_account_deletion','finish_account_deletion_attempt'].includes(name))return {data:true};
  throw Error('Unexpected destructive operation: '+name);
 }};return {db,calls};
}
test('real processor completes a failed receipt after Auth removal without rerunning destructive operations',async()=>{
 const {db,calls}=missingAuthFixture();
 assert.deepEqual(await retryStoredAccountDeletionRequest({db,requestId:'request'}),{status:'completed'});
 assert.equal(calls[0],'claim_account_deletion_retry');assert.equal(calls.at(-1),'complete_account_deletion');
 assert.equal(calls.includes('block_account_deletion_access'),false);
});
test('missing Auth cannot hide file residue, API failures, mismatched subject or unapproved review',async()=>{
 for(const options of [{residue:true},{authError:'unexpected_failure'},{subject:'foreign'}]){
  const {db,calls}=missingAuthFixture(options);
  await assert.rejects(retryStoredAccountDeletionRequest({db,requestId:'request'}));assert.equal(calls.includes('complete_account_deletion'),false);
 }
 const {db,calls}=missingAuthFixture({status:'review_required'});
 assert.equal((await retryStoredAccountDeletionRequest({db,requestId:'request'})).status,'busy');assert.deepEqual(calls,[]);
});
test('public processor still binds to the logged-in user; only worker can use subject_id',async()=>{
 const filters=[];const db={from:()=>({select(){return this;},eq(k,v){filters.push([k,v]);return this;},maybeSingle:async()=>({data:null})})};
 await assert.rejects(processAccountDeletionRequest({db,userId:'foreign',requestId:'request'}),/ownership/);
 assert.deepEqual(filters,[['id','request'],['user_id','foreign']]);
});

test('atomic retry claim enforces cooldown, attempts, verification and never steals even expired leases',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table account_deletion_requests(id uuid primary key,user_id uuid,subject_id uuid,status text,identity_verified boolean,scope text,lease_token uuid,lease_until timestamptz,attempts int,updated_at timestamptz);`);
  await db.exec(await readFile(new URL('../database/account_deletion_retry_worker.sql',import.meta.url),'utf8'));
  const id='00000000-0000-4000-8000-000000000001',subject='00000000-0000-4000-8000-000000000002';
  const reset=async()=>{await db.exec('truncate account_deletion_requests');await db.query(`insert into account_deletion_requests values($1,null,$2,'failed',true,'personal_account',null,null,1,clock_timestamp()-interval '6 minutes')`,[id,subject]);};
  const claim=async()=>(await db.query('select * from claim_account_deletion_retry($1)',[id])).rows;
  for(const update of ["status='review_required'","status='completed'","status='processing'","identity_verified=false","scope='other'","subject_id=null","user_id=gen_random_uuid()","attempts=0","attempts=5","updated_at=clock_timestamp()","lease_token=gen_random_uuid(),lease_until=clock_timestamp()-interval '1 hour'"]){
   await reset();await db.exec('update account_deletion_requests set '+update);assert.equal((await claim()).length,0,update);
  }
  await reset();const rows=await claim();assert.equal(rows.length,1);assert.equal(rows[0].attempts,2);assert.equal(rows[0].user_id,null);assert.equal(rows[0].subject_id,subject);
  assert.equal((await claim()).length,0);
  for(const role of ['anon','authenticated'])assert.equal((await db.query(`select has_function_privilege('${role}','claim_account_deletion_retry(uuid)','execute') allowed`)).rows[0].allowed,false);
 }finally{await db.close();}
});
