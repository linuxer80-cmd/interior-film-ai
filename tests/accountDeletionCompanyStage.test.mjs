import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteAccountCompany} from '../lib/accountDeletionCompanyStage.mjs';
const id='11111111-1111-4111-8111-111111111111';
function fixture(failure){
 const calls=[];
 const stage=async name=>{calls.push(name);return name!==failure;};
 const options={requestId:id,lease:id,companyId:id,assertLease:async()=>true,
  db:{rpc:async(name,args)=>{if(name==='assert_company_deletion_frozen')return {data:true};
 if(name==='inspect_approved_shared_photo_deletions'){assert.deepEqual(args,{p_request:id});calls.push(name);return {data:failure===name?null:{companyId:id,policy:'delete_original_and_all_references_on_either_company_deletion',files:[]}};}
 assert.deepEqual(args,{p_request:id,p_lease:id});calls.push(name);return {data:name==='freeze_company_calendar_jobs'?{companyId:failure==='scope'?'wrong':id}:name!==failure};}},
  deleteCalendar:()=>stage('calendar'),deleteFiles:()=>stage('files'),verifyExternalCleanup:()=>stage('verify')};
 return {calls,options};
}
const steps=['freeze_company_calendar_jobs','calendar','inspect_approved_shared_photo_deletions','files','verify','delete_frozen_company_business_records','delete_frozen_company_media_records','delete_empty_company_sites','finalize_frozen_empty_company'];
test('company execution orders remote/file verification before record removal',async()=>{
 const {calls,options}=fixture();assert.equal(await deleteAccountCompany(options),true);assert.deepEqual(calls,steps);
});
test('partial stage stops every later stage',async()=>{
 for(const failure of steps.slice(1)){
  const {calls,options}=fixture(failure);await assert.rejects(deleteAccountCompany(options));
  assert.deepEqual(calls,steps.slice(0,steps.indexOf(failure)+1));
 }
});
test('wrong company freeze and lost lease cannot start external cleanup',async()=>{
 const scoped=fixture('scope');await assert.rejects(deleteAccountCompany(scoped.options));assert.deepEqual(scoped.calls,[steps[0]]);
 const expired=fixture();expired.options.assertLease=async()=>false;await assert.rejects(deleteAccountCompany(expired.options));assert.deepEqual(expired.calls,[]);
});
test('company pipeline clears approved shared references and originals before other files and records',async()=>{
 const {options,calls}=fixture();const original=options.db.rpc;let present=true;
 options.db.rpc=async(name,args)=>{
  if(name==='inspect_approved_shared_photo_deletions'){calls.push('approved_inventory');return {data:{companyId:id,policy:'delete_original_and_all_references_on_either_company_deletion',files:[{bucket:'work-photos',path:'customer/shared.jpg',objectId:id,present}]}};}
  if(['delete_approved_shared_photo_references','verify_company_shared_photo_references'].includes(name)){assert.deepEqual(args.p_paths,['customer/shared.jpg']);calls.push(name);return {data:true};}
  return original(name,args);
 };
 options.db.storage={from:()=>({remove:async paths=>{assert.deepEqual(paths,['customer/shared.jpg']);present=false;calls.push('original_removed');return {};}})};
 assert.equal(await deleteAccountCompany(options),true);
 assert.ok(calls.indexOf('delete_approved_shared_photo_references')<calls.indexOf('original_removed'));
 assert.ok(calls.indexOf('original_removed')<calls.indexOf('files'));
 assert.ok(calls.lastIndexOf('verify_company_shared_photo_references')<calls.indexOf('delete_frozen_company_business_records'));
});
test('default company execution resolves server calendar scope and clears ledger without injected calendar callback',async()=>{
 const {options,calls}=fixture();delete options.deleteCalendar;
 const original=options.db.rpc;
 options.db.rpc=async(name,args)=>{
  if(name==='inspect_frozen_company_calendar_scope'){assert.deepEqual(args,{p_request:id,p_lease:id});calls.push(name);return {data:{companyId:id,siteIds:[],userIds:[],sitesComplete:false,usersComplete:false,policy:'verified_app_events_only',knownScopeVerified:true}};}
  if(name==='inspect_company_calendar_deletion_ledger'){calls.push(name);return {data:[]};}
  if(name==='clear_verified_company_calendar_ledger'){assert.deepEqual(args.p_records,[]);calls.push(name);return {data:true};}
  return original(name,args);
 };
 assert.equal(await deleteAccountCompany(options),true);
 assert.ok(calls.indexOf('clear_verified_company_calendar_ledger')<calls.indexOf('files'));
});
test('default calendar integration cannot use another company scope or ignore missing credentials',async()=>{
 for(const mode of ['wrong-company','missing-credentials']){
  const {options,calls}=fixture();delete options.deleteCalendar;const original=options.db.rpc;
  options.db.rpc=async(name,args)=>name==='inspect_frozen_company_calendar_scope'?{data:{companyId:mode==='wrong-company'?'wrong':id,siteIds:[id],userIds:[id],sitesComplete:false,usersComplete:false,policy:'verified_app_events_only',knownScopeVerified:true}}:original(name,args);
  options.db.from=()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null})});
  await assert.rejects(deleteAccountCompany(options));
  assert.ok(!calls.includes('files'));assert.ok(!calls.includes('delete_frozen_company_business_records'));
 }
});
