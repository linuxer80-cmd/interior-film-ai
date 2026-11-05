import test from 'node:test';import assert from 'node:assert/strict';
import {processAccountDeletionRequest} from '../lib/accountDeletionProcessor.mjs';
function fixture({owned=true,busy=false}={}){
 const calls=[];
 const db={from(table){const filters=[];return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},maybeSingle:async()=>{
 calls.push({table,filters});if(table==='account_deletion_requests')return {data:owned?{id:'request'}:null};
 if(table==='profiles')return {data:null};throw Error('unexpected table');}};},rpc:async(name,args)=>{
 calls.push(name);
 if(name==='claim_account_deletion_request')return {data:busy?[]:[{user_id:'user',lease_token:'lease',status:'processing',identity_verified:true,scope:'personal_account'}]};
 if(name==='inspect_minimal_personal_deletion')return {data:{subjectId:'user',eligible:false,codes:['linked_records_require_review'],filesRemaining:0,profileRemaining:false}};
 if(name==='account_deletion_shared_auth_check')return {data:false};
 if(name==='assess_account_deletion_orders')return {data:{dealer_transfer_required:false,open_orders:false,delivery_review_required:false,saved_addresses_review_required:false}};
 if(name==='inspect_account_deletion_references')return {data:[]};
 if(name==='finish_account_deletion_attempt'){assert.equal(args.p_status,'review_required');return {data:true};}
 throw Error('Unexpected destructive RPC: '+name);
 }};
 return {db,calls};
}
test('actual bridge claims own request and returns incomplete scope to review without destructive calls',async()=>{
 const {db,calls}=fixture();assert.deepEqual(await processAccountDeletionRequest({db,userId:'user',requestId:'request'}),{status:'review_required'});
 assert.deepEqual(calls[0],{table:'account_deletion_requests',filters:[['id','request'],['user_id','user']]});
 assert.equal(calls.at(-1),'finish_account_deletion_attempt');
});
test('foreign request cannot acquire a lease',async()=>{
 const {db,calls}=fixture({owned:false});await assert.rejects(processAccountDeletionRequest({db,userId:'user',requestId:'request'}));assert.equal(calls.length,1);
});
test('concurrent request cannot reclaim or release another execution lease',async()=>{
 const {db,calls}=fixture({busy:true});assert.deepEqual(await processAccountDeletionRequest({db,userId:'user',requestId:'request'}),{status:'busy'});assert.equal(calls.length,2);
});
test('changed subject at lease acquisition cannot authorize deletion or release writes',async()=>{
 const {db,calls}=fixture();const rpc=db.rpc;
 db.rpc=async(name,args)=>{const result=await rpc(name,args);if(name==='claim_account_deletion_request')result.data[0].user_id='other';return result;};
 await assert.rejects(processAccountDeletionRequest({db,userId:'user',requestId:'request'}),/subject mismatch/);
 assert.equal(calls.length,2);
});
