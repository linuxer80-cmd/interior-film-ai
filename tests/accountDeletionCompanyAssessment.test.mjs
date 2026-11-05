import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCompanyDeletionFiles} from '../lib/accountDeletionCompanyAssessment.mjs';
function fixture(plan={companyId:'company',files:[{path:'private/path'}],sharedFiles:[{path:'private/shared'}],chatThreadIds:['private-thread'],complete:false}) {
 const calls=[];
 const db={from(table){assert.equal(table,'account_deletion_requests');return {select(){return this;},eq(k,v){assert.equal(k,'user_id');assert.equal(v,'verified-user');return this;},async maybeSingle(){return {data:{id:'server-request',company_deletion_id:'company'}};}};},
 rpc:async(name,args)=>{calls.push({name,args});return {data:plan};}};
 return {db,calls};
}
test('diagnostics resolve authenticated request and expose only blocking codes',async()=>{
 const {db,calls}=fixture();const result=await assessCompanyDeletionFiles(db,'verified-user');
 assert.deepEqual(result,{codes:['company_file_ownership_review_required','company_shared_photos_cleanup_required']});
 assert.deepEqual(calls,[{name:'inspect_company_deletion_files',args:{p_request:'server-request'}}]);
 assert.ok(!JSON.stringify(result).includes('private'));
});
test('incomplete empty inventory still needs ownership review',async()=>{
 const {db}=fixture({companyId:'company',files:[],sharedFiles:[],chatThreadIds:[],complete:false});
 assert.deepEqual(await assessCompanyDeletionFiles(db,'verified-user'),{codes:['company_file_ownership_review_required']});
});
test('wrong scope, malformed result and RPC outages are not treated as a clear inventory',async()=>{
 for(const plan of [null,{}, {companyId:'other',files:[],sharedFiles:[],chatThreadIds:[],complete:true}]){
  await assert.rejects(assessCompanyDeletionFiles(fixture(plan).db,'verified-user'));
 }
 const {db}=fixture();db.rpc=async()=>({error:Error('private DB detail')});
 await assert.rejects(assessCompanyDeletionFiles(db,'verified-user'));
});
test('missing owned request reports unavailable without querying a client-selected request',async()=>{
 const {db,calls}=fixture();db.from=()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null})});
 assert.deepEqual(await assessCompanyDeletionFiles(db,'verified-user'),{codes:['company_scope_unavailable']});
 assert.deepEqual(calls,[]);
});
test('complete file inventory alone does not grant execution eligibility',async()=>{
 const {db}=fixture({companyId:'company',files:[],sharedFiles:[],chatThreadIds:[],complete:true});
 assert.deepEqual(await assessCompanyDeletionFiles(db,'verified-user'),{codes:[]});
});
