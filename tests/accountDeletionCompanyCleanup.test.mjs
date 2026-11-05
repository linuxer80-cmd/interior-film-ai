import test from 'node:test';import assert from 'node:assert/strict';
import {createCompanyAccountDeletionCleanup} from '../lib/accountDeletionCompanyCleanup.mjs';
const company='00000000-0000-4000-8000-000000000001';
function fixture(){
 let record={company_deletion_id:company,user_id:'user',company_record_deleted_at:null};
 let inventory={subjectId:'user',companyId:company,eligible:true,codes:[],manifest:{companyId:company,files:[],chatThreadIds:[],sharedFiles:[],complete:true}};
 const calls=[];const db={from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:record})};},rpc:async(name,args)=>{
 calls.push([name,args]);if(name==='inspect_supported_company_deletion')return {data:inventory};
 if(name==='inspect_minimal_personal_deletion')return {data:{subjectId:'user',eligible:true,codes:[],filesRemaining:0,profileRemaining:true}};
 if(name==='assert_account_deletion_lease'){assert.equal(args.p_subject,'user');return {data:true};}
 if(name==='release_company_calendar_jobs')return {data:true};throw Error('Unexpected RPC');}};
 return {cleanup:createCompanyAccountDeletionCleanup(db,{companyId:company,userId:'user',requestId:'req',getLease:()=> 'lease'}),calls,setRecord:x=>record=x,setInventory:x=>inventory=x,inventory,record};
}
test('company support uses trusted inventory; unknown/inconsistent scopes cannot enable execution',async()=>{
 const f=fixture();assert.equal((await f.cleanup.preflight()).soleOwner,true);
 f.setInventory({...f.inventory,eligible:false,codes:['unknown'],manifest:{...f.inventory.manifest,complete:false}});
 assert.equal((await f.cleanup.preflight()).complete,false);
 f.setInventory({...f.inventory,eligible:false});await assert.rejects(f.cleanup.preflight(),/Inconsistent/);
 f.setInventory({...f.inventory,companyId:'foreign'});await assert.rejects(f.cleanup.preflight(),/Invalid/);
});
test('finalized company is reassessed as personal and calendar pause releases only after finalization',async()=>{
 const f=fixture();await assert.rejects(f.cleanup.scrubPersonalData(),/finalization/);
 f.setRecord({...f.record,company_record_deleted_at:'date'});
 assert.equal((await f.cleanup.preflight()).soleOwner,false);await f.cleanup.scrubPersonalData();
 assert.ok(f.calls.some(([n])=>n==='release_company_calendar_jobs'));
 f.setRecord({...f.record,user_id:'other'});await assert.rejects(f.cleanup.preflight(),/scope changed/);
});
