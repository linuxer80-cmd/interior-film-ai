// Call after complete, fresh remote verification for the exact frozen scope.
// The DB independently verifies lease, company finalization and local residue.
export async function releaseCompanyCalendarPause({db,requestId,lease,verifyRemote,assertLease}) {
 if(typeof verifyRemote!=='function'||typeof assertLease!=='function'||!requestId||!lease)throw new Error('Calendar release verification required');
 if(await assertLease()!==true)throw new Error('Deletion lease not confirmed');
 if(await verifyRemote()!==true)throw new Error('Remote calendar cleanup not verified');
 if(await assertLease()!==true)throw new Error('Deletion lease not confirmed');
 const {data,error}=await db.rpc('release_company_calendar_jobs',{p_request:requestId,p_lease:lease});
 if(error)throw error;
 if(data!==true)throw new Error('Calendar release not confirmed');
 return true;
}
