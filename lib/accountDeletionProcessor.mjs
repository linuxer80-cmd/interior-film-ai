import {createDeletionDatabaseAdapter} from './accountDeletionDatabaseAdapter.mjs';
import {executeAccountDeletion} from './accountDeletionExecutor.mjs';

import {createCompanyAccountDeletionCleanup} from './accountDeletionCompanyCleanup.mjs';
import {createPersonalDeletionCleanup} from './accountDeletionPersonalCleanup.mjs';

export async function processAccountDeletionRequest({db,userId,requestId}) {
  if(!db||typeof userId!=='string'||!userId||typeof requestId!=='string'||!requestId) {
    throw new Error('Authenticated deletion request required');
  }
  // Bind the request to the authenticated subject before claiming any lease.
  const {data,error}=await db.from('account_deletion_requests').select('id,company_deletion_id')
    .eq('id',requestId).eq('user_id',userId).maybeSingle();
  if(error||data?.id!==requestId)throw new Error('Deletion request ownership not confirmed');
  return executeStoredRequest({db,userId,requestId,companyId:data.company_deletion_id});
}

// Server worker only. Unlike the authenticated route, this can recover the
// durable subject after Auth's FK has set user_id to null. The retry RPC
// atomically enforces failed status, cooldown, attempts and an absent lease.
export async function retryStoredAccountDeletionRequest({db,requestId}) {
  if(!db||typeof requestId!=='string'||!requestId)throw new Error('Stored deletion request required');
  const {data,error}=await db.from('account_deletion_requests')
    .select('id,user_id,subject_id,company_deletion_id,status,identity_verified,scope')
    .eq('id',requestId).maybeSingle();
  if(error)throw error;
  if(data?.id!==requestId||data.status!=='failed'||data.identity_verified!==true||data.scope!=='personal_account')return {status:'busy'};
  const userId=data.subject_id;
  if(typeof userId!=='string'||!userId||(data.user_id!=null&&data.user_id!==userId))throw new Error('Stored deletion subject mismatch');
  return executeStoredRequest({db,userId,requestId,companyId:data.company_deletion_id,retryOnly:true});
}

async function executeStoredRequest({db,userId,requestId,companyId,retryOnly=false}) {
  let lease;
  const cleanup=companyId
    ?createCompanyAccountDeletionCleanup(db,{requestId,userId,companyId,getLease:()=>lease})
    :createPersonalDeletionCleanup(db,{requestId,userId,getLease:()=>lease});
  const adapter=createDeletionDatabaseAdapter(db,cleanup,{retryOnly});
  adapter.preflight=cleanup.preflight;
  if(cleanup.deleteCompany)adapter.deleteCompany=cleanup.deleteCompany;
  const claim=adapter.claim;
  adapter.claim=async id=>{
    const job=await claim(id);
    if(job && job.userId!==userId)throw new Error('Claimed deletion subject mismatch');
    lease=job?.lease;
    return job;
  };
  return executeAccountDeletion(adapter,requestId);
}
