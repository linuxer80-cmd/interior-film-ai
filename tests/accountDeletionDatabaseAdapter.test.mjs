import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeletionDatabaseAdapter} from '../lib/accountDeletionDatabaseAdapter.mjs';
const methods=['blockAccess','revokeSessions','deletePrivateFiles','scrubPersonalData','verifyBeforeAuthDeletion','deleteAuthUser','verifyComplete','complete'];
function fixture(){const calls=[];const cleanup=Object.fromEntries(methods.map(n=>[n,async()=>true]));const db={rpc:async(name)=>{calls.push(name);return name==='claim_account_deletion_request'?{data:[{user_id:'user',lease_token:'lease',status:'processing'}]}:{data:true};}};db.from=()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{lease_until:'2126-01-01T00:00:00Z'}})})})})});db.auth={admin:{updateUserById:async id=>({data:{user:{id,banned_until:'2126-01-01T00:00:00Z'}}})}};return {calls,cleanup,db};}
test('missing cleanup implementation fails before database mutation',()=>{assert.throws(()=>createDeletionDatabaseAdapter({},{}),/Missing/);});
test('processing status does not establish identity verification',async()=>{const {db,cleanup}=fixture();const job=await createDeletionDatabaseAdapter(db,cleanup).claim('request');assert.equal(job.identityVerified,false);assert.equal(job.scope,undefined);});
test('successful completion must not be followed by a failure write',async()=>{const {db,cleanup,calls}=fixture();const a=createDeletionDatabaseAdapter(db,cleanup);await a.claim('request');await a.complete('request','lease');await a.release('request','lease');assert.deepEqual(calls,['claim_account_deletion_request','complete_account_deletion']);});
test('access block uses claimed request and lease only',async()=>{
 const {db,cleanup}=fixture();const calls=[];
 const original=db.rpc;
 db.rpc=async(name,args)=>{calls.push({name,args});return original(name,args);};
 const a=createDeletionDatabaseAdapter(db,cleanup);await a.claim('request');
 await assert.rejects(a.blockAccess('other-user','request','lease'),/mismatch/);
 await a.blockAccess('user','request','lease');
 assert.deepEqual(calls.at(-1),{name:'block_account_deletion_access',args:{p_request:'request',p_lease:'lease'}});
});
test('access block refuses an unconfirmed database result',async()=>{
 const {db,cleanup}=fixture();const original=db.rpc;
 db.rpc=async(name,args)=>name==='block_account_deletion_access'?{data:false}:original(name,args);
 const a=createDeletionDatabaseAdapter(db,cleanup);await a.claim('request');
 await assert.rejects(a.blockAccess('user','request','lease'),/not confirmed/);
});
test('failed login ban stops access blocking completion',async()=>{
 const {db,cleanup}=fixture();db.auth.admin.updateUserById=async()=>({error:new Error('ban failed')});
 const a=createDeletionDatabaseAdapter(db,cleanup);await a.claim('request');
 await assert.rejects(a.blockAccess('user','request','lease'),/ban failed/);
});
test('login ban must return the same user with future expiry',async()=>{
 const {db,cleanup}=fixture();db.auth.admin.updateUserById=async()=>({data:{user:{id:'user',banned_until:null}}});
 const a=createDeletionDatabaseAdapter(db,cleanup);await a.claim('request');
 await assert.rejects(a.blockAccess('user','request','lease'),/Login blocking not confirmed/);
});
test('avatar removal failure prevents remaining file cleanup',async()=>{
 const {db,cleanup}=fixture();let furtherCleanup=false;
 const id='00000000-0000-4000-8000-000000000001';
 db.rpc=async(name)=>name==='assert_account_deletion_lease'?{data:true}:name==='inspect_account_deletion_audio'?{data:[]}:{data:[{user_id:id,lease_token:'lease',status:'processing'}]};
 db.storage={from:bucket=>{assert.equal(bucket,'labor-avatars');return {list:async()=>({error:new Error('storage unavailable')})};}};
 cleanup.deletePrivateFiles=async()=>{furtherCleanup=true;};
 const a=createDeletionDatabaseAdapter(db,cleanup);await a.claim('request');
 await assert.rejects(a.deletePrivateFiles(id,{}),/storage unavailable/);assert.equal(furtherCleanup,false);
});
test('avatar cleanup does not skip the remaining private file inventory',async()=>{
 const {db,cleanup}=fixture();let furtherCleanup=false;
 const id='00000000-0000-4000-8000-000000000001';
 db.rpc=async(name)=>name==='assert_account_deletion_lease'?{data:true}:name==='inspect_account_deletion_audio'?{data:[]}:{data:[{user_id:id,lease_token:'lease',status:'processing'}]};
 db.storage={from:bucket=>{assert.equal(bucket,'labor-avatars');return {list:async()=>({data:[]})};}};
 cleanup.deletePrivateFiles=async(subject)=>{assert.equal(subject,id);furtherCleanup=true;};
 const a=createDeletionDatabaseAdapter(db,cleanup);await a.claim('request');await a.deletePrivateFiles(id,{});assert.equal(furtherCleanup,true);
});
test('worker cleanup passes the claimed lease and continues remaining cleanup',async()=>{
 const {db,cleanup}=fixture();const original=db.rpc;let rest=false;
 db.rpc=async(name,args)=>{if(name==='scrub_account_worker_details'){assert.deepEqual(args,{p_request:'request',p_lease:'lease'});return {data:{workers_scrubbed:2}};}return original(name,args);};
 cleanup.scrubPersonalData=async(id)=>{assert.equal(id,'user');rest=true;};
 const a=createDeletionDatabaseAdapter(db,cleanup);await a.claim('request');await a.scrubPersonalData('user',{});assert.equal(rest,true);
});
test('worker cleanup failure prevents remaining cleanup',async()=>{
 const {db,cleanup}=fixture();const original=db.rpc;let rest=false;
 db.rpc=async(name,args)=>name==='scrub_account_worker_details'?{error:new Error('lease expired')}:original(name,args);
 cleanup.scrubPersonalData=async()=>{rest=true;};
 const a=createDeletionDatabaseAdapter(db,cleanup);await a.claim('request');await assert.rejects(a.scrubPersonalData('user',{}),/lease expired/);assert.equal(rest,false);
});
test('invalid worker cleanup result is not accepted as success',async()=>{
 const {db,cleanup}=fixture();const original=db.rpc;
 db.rpc=async(name,args)=>name==='scrub_account_worker_details'?{data:null}:original(name,args);
 const a=createDeletionDatabaseAdapter(db,cleanup);await a.claim('request');await assert.rejects(a.scrubPersonalData('user',{}),/not confirmed/);
});
test('remaining personal cleanup failure prevents profile detachment',async()=>{
 const {db,cleanup}=fixture();const original=db.rpc;let detached=false;
 db.rpc=async(name,args)=>{if(name==='scrub_account_worker_details')return {data:{workers_scrubbed:0}};if(name==='detach_deleted_account_profile'){detached=true;return {data:true};}return original(name,args);};
 cleanup.scrubPersonalData=async()=>{throw new Error('remaining data not cleaned');};
 const a=createDeletionDatabaseAdapter(db,cleanup);await a.claim('request');await assert.rejects(a.scrubPersonalData('user',{}),/remaining data/);assert.equal(detached,false);
});
test('profile detachment failure propagates instead of reporting success',async()=>{
 const {db,cleanup}=fixture();const original=db.rpc;
 db.rpc=async(name,args)=>{if(name==='scrub_account_worker_details')return {data:{workers_scrubbed:0}};if(name==='detach_deleted_account_profile')return {data:false};return original(name,args);};
 const a=createDeletionDatabaseAdapter(db,cleanup);await a.claim('request');await assert.rejects(a.scrubPersonalData('user',{}),/detachment not confirmed/);
});
test('unconfirmed payment cleanup stops before invitations and profile detachment',async()=>{
 const {db,cleanup,calls}=fixture();const original=db.rpc;
 db.rpc=async(name,args)=>name==='scrub_account_payment_actors'?{data:false}:original(name,args);
 const a=createDeletionDatabaseAdapter(db,cleanup);await a.claim('request');
 await assert.rejects(a.scrubPersonalData('user',{}),/Payment actor cleanup not confirmed/);
 assert.equal(calls.includes('scrub_account_invitations'),false);
 assert.equal(calls.includes('detach_deleted_account_profile'),false);
});

for (const name of ['scrub_account_notifications','scrub_account_badges','scrub_account_team_chat','scrub_account_document_actors','scrub_account_extra_work_actors','scrub_account_alimtalk_actors','scrub_account_referrals','scrub_account_order_actors']) {
 for (const failure of ['unconfirmed','error']) test(`${name} ${failure} stops subsequent cleanup and preserves profile linkage`,async()=>{
  const {db,cleanup,calls}=fixture();const original=db.rpc;let further=false;
  db.rpc=async(rpc,args)=>{
   if(rpc===name){assert.deepEqual(args,{p_request:'request',p_lease:'lease'});calls.push(rpc);return failure==='error'?{error:Error('cleanup failed')}:{data:false};}
   return original(rpc,args);
  };
  cleanup.scrubPersonalData=async()=>{further=true;};
  const a=createDeletionDatabaseAdapter(db,cleanup);await a.claim('request');
  await assert.rejects(a.scrubPersonalData('user',{}),failure==='error'?/cleanup failed/:/not confirmed/);
  assert.equal(calls.at(-1),name);assert.equal(further,false);
  assert.equal(calls.includes('detach_deleted_account_profile'),false);
 });
}

test('execution lease uses database verdict and rejects mismatches and uncertain replies',async()=>{
 const {db,cleanup}=fixture();const original=db.rpc;let result={data:true};let args;
 db.rpc=async(name,input)=>{if(name==='assert_account_deletion_lease'){args=input;return result;}return original(name,input);};
 const a=createDeletionDatabaseAdapter(db,cleanup);await a.claim('request');
 assert.equal(await a.assertExecutionLease('request','lease'),true);
 assert.deepEqual(args,{p_request:'request',p_lease:'lease',p_subject:'user'});
 await assert.rejects(a.assertExecutionLease('request','other'),/mismatch/);
 for(const data of [false,null,'true',{}]){result={data};await assert.rejects(a.assertExecutionLease('request','lease'),/no longer valid/);}
 result={error:Error('database unavailable')};await assert.rejects(a.assertExecutionLease('request','lease'),/database unavailable/);
});
