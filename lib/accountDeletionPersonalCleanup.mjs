// Concrete supported scope, not a fixture/user allowlist. The DB inventories
// actual data on every call and rejects anything beyond the implemented contract.
export function createPersonalDeletionCleanup(db,{requestId,userId,getLease}) {
 const inspect=async()=>{
  const lease=getLease();if(!lease)throw new Error('Personal deletion lease required');
  const {data,error}=await db.rpc('inspect_minimal_personal_deletion',{p_request:requestId,p_lease:lease});
  if(error)throw error;
  if(data?.subjectId!==userId||typeof data.eligible!=='boolean'||!Array.isArray(data.codes)||
   !Number.isSafeInteger(data.filesRemaining)||data.filesRemaining<0||typeof data.profileRemaining!=='boolean')throw new Error('Invalid personal deletion inventory');
  return data;
 };
 const verify=async(requireDetached)=>{
  const state=await inspect();
  return state.eligible && state.codes.length===0 && state.filesRemaining===0 && (!requireDetached||!state.profileRemaining);
 };
 return {
  async preflight(){const state=await inspect();return {complete:state.eligible&&state.codes.length===0,blockers:state.codes,sharedAuth:false,soleOwner:false};},
  // Avatar deletion and all installed personal scrub RPCs run in the database
  // adapter first. Verify their residue here; never silently skip unknown data.
  async deletePrivateFiles(){if(!await verify(false))throw new Error('Personal files remain');},
  async scrubPersonalData(){if(!await verify(false))throw new Error('Unsupported personal records remain');},
  verifyBeforeAuthDeletion:()=>verify(true),
  verifyComplete:()=>verify(true),
 };
}
