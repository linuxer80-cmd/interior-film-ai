import {validateCompanyFileInventory} from './deletionCompanyStorage.mjs';
// Bind to a held server lease, never to a company/path array supplied by a client.
export function createCompanyPhotoReferenceCleanup(db, requestId, lease) {
  if (!requestId || !lease) throw new Error('Company deletion lease required');
  async function call(name, companyId, files) {
    validateCompanyFileInventory(companyId, {companyId, files, chatThreadIds:[]});
    if (!files.length || files.some(f => f.bucket !== 'work-photos')) throw new Error('Work photo references required');
    const {data,error}=await db.rpc(name,{p_request:requestId,p_lease:lease,p_paths:files.map(f=>f.path)});
    if(error)throw error;
    return data===true;
  }
  return {
    detachSharedReferences:(companyId,files)=>call('delete_company_shared_photo_references',companyId,files),
    verifySharedReferences:(companyId,files)=>call('verify_company_shared_photo_references',companyId,files),
  };
}
