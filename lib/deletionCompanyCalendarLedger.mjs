import {calendarScopeReady, knownCalendarPolicy} from './deletionCalendarPolicy.mjs';
import {isOwnCalendarEvent} from './googleCalendar.mjs';
// Remote absence must be checked for every ledger entry, including events whose
// app marker was edited and therefore disappeared from the filtered list.
export async function clearVerifiedCompanyCalendarLedger({db,requestId,lease,scope,api,assertLease,assertFrozen}) {
  if(!calendarScopeReady(scope)||!Array.isArray(scope.siteIds)||!Array.isArray(scope.userIds)||
    typeof api!=='function'||typeof assertLease!=='function'||typeof assertFrozen!=='function')throw new Error('Complete calendar scope required');
  const users=new Set(scope.userIds),sites=new Set(scope.siteIds),records=[],seen=new Set();
  const guard=async()=>{if(await assertLease()!==true||await assertFrozen()!==true)throw new Error('Calendar ledger guard failed');};
  await guard();
  const snapshot=await db.rpc('inspect_company_calendar_deletion_ledger',{p_request:requestId,p_lease:lease});
  if(snapshot.error)throw snapshot.error;
  if(!Array.isArray(snapshot.data)||snapshot.data.length>10000)throw new Error('Invalid calendar ledger');
  for(const row of snapshot.data){
    const key=row?.user_id+':'+row?.event_id;
    if(!row||row.company_id!==scope.companyId||!users.has(row.user_id)||!sites.has(row.site_id)||!/^fm[0-9a-f]{64}$/.test(row.event_id)||seen.has(key))throw new Error('Calendar ledger scope mismatch');
    seen.add(key);records.push(row);
  }
  // Validate all remote records before deleting any local evidence.
  for(const row of records){
    await guard();let absent=false;
    try{
      const event=await api(row.user_id,'/'+row.event_id);
      absent=event?.id===row.event_id&&event.status==='cancelled';
      if(!absent && knownCalendarPolicy(scope) && event?.id===row.event_id &&
         (!isOwnCalendarEvent(event,row.user_id)||event.extendedProperties?.private?.siteId!==row.site_id)) {
        // Preserve the remote event; drop only this app's stale local association.
        absent=true;
      }
    }
    catch(error){if([404,410].includes(error?.status))absent=true;else throw error;}
    if(!absent)throw new Error('Calendar ledger event still exists');
  }
  await guard();
  const {data,error}=await db.rpc('clear_verified_company_calendar_ledger',{
    p_request:requestId,p_lease:lease,p_records:records,
  });
  if(error)throw error;
  if(data!==true)throw new Error('Calendar ledger cleanup not confirmed');
  return true;
}
