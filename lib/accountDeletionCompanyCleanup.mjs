import {createPersonalDeletionCleanup} from './accountDeletionPersonalCleanup.mjs';
import {deleteAccountCompany} from './accountDeletionCompanyStage.mjs';
import {deleteCompanyFiles,validateCompanyFileInventory} from './deletionCompanyStorage.mjs';
import {createCompanyPhotoReferenceCleanup} from './deletionCompanyPhotoReferences.mjs';

// All identity/scope comes from the authenticated request and leased DB inventory.
export function createCompanyAccountDeletionCleanup(db,{requestId,userId,companyId,getLease}) {
 const personal=createPersonalDeletionCleanup(db,{requestId,userId,getLease});
 const rpc=async name=>{
  const lease=getLease();if(!lease)throw Error('Company deletion lease required');
  const {data,error}=await db.rpc(name,{p_request:requestId,p_lease:lease,...(name==='assert_account_deletion_lease'?{p_subject:userId}:{})});if(error)throw error;return data;
 };
 const guard=async()=>await rpc('assert_account_deletion_lease')===true;
 const state=async()=>{
  const {data,error}=await db.from('account_deletion_requests').select('company_deletion_id,company_record_deleted_at,subject_id,user_id').eq('id',requestId).maybeSingle();
  if(error)throw error;
  if(data?.company_deletion_id!==companyId||(data.user_id??data.subject_id)!==userId)throw Error('Company request scope changed');
  return data;
 };
 const inventory=async()=>{
  const data=await rpc('inspect_supported_company_deletion');
  if(data?.subjectId!==userId||data.companyId!==companyId||typeof data.eligible!=='boolean'||!Array.isArray(data.codes))throw Error('Invalid company support inventory');
  validateCompanyFileInventory(companyId,data.manifest);
  if(data.manifest.complete!==data.eligible||data.eligible!==(data.codes.length===0))throw Error('Inconsistent company support inventory');
  return data;
 };
 return {
  ...personal,
  async preflight(){
   if((await state()).company_record_deleted_at)return personal.preflight();
   const data=await inventory();return {complete:data.eligible,blockers:data.codes,sharedAuth:data.codes.includes('shared_auth'),soleOwner:true};
  },
  async deleteCompany(){
   if((await state()).company_record_deleted_at)throw Error('Company already finalized');
   const lease=getLease();
   return deleteAccountCompany({db,requestId,lease,companyId,assertLease:guard,
    deleteFiles:async()=>{
     const result=await deleteCompanyFiles({storage:db.storage,companyId,inventory:async()=> (await inventory()).manifest,
      assertLease:guard,assertFrozen:async()=>await rpc('assert_company_deletion_frozen')===true,
      ...createCompanyPhotoReferenceCleanup(db,requestId,lease)});
     return result.verified===true;
    },
    verifyExternalCleanup:async()=>{const data=await inventory();return data.eligible&&data.manifest.files.length===0&&data.manifest.sharedFiles.length===0;},
   });
  },
  async scrubPersonalData(){
   // The finalized marker is written only after verified calendar/file stages;
   // durable company guards prohibit new writes throughout retries.
   if(!(await state()).company_record_deleted_at||await guard()!==true)throw Error('Company finalization not confirmed');
   if(await rpc('release_company_calendar_jobs')!==true)throw Error('Company calendar release not confirmed');
   await personal.scrubPersonalData();
  },
 };
}
