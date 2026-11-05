import { CALENDAR_SOURCE, isOwnCalendarEvent, validDay } from './googleCalendar.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reads existing ledger entries; never searches by title, customer or address.
// saveBindings must atomically verify and bind the exact existing ledger rows.
export async function recoverLegacyCalendarScope({records,readEvent,resolveSite,saveBindings,assertActive}) {
 if(!Array.isArray(records)||records.length>1000||[readEvent,resolveSite,saveBindings,assertActive].some(f=>typeof f!=='function'))throw new Error('Legacy calendar recovery inputs required');
 const seen=new Set(),bindings=[],unresolved=[];
 const check=async()=>{if(await assertActive()!==true)throw new Error('Calendar recovery authorization changed');};
 for(const row of records){
  const key=row?.user_id+':'+row?.event_id;
  if(!uuid.test(row?.user_id??'')||!/^fm[0-9a-f]{64}$/.test(row?.event_id??'')||!validDay(row?.work_date)||seen.has(key))throw new Error('Invalid legacy calendar ledger');
  seen.add(key);
 }
 await check();
 for(const row of records){
  await check();let event;
  try{event=await readEvent(row);}catch(error){
   if([401,403,404,410].includes(error?.status)) {unresolved.push({user_id:row.user_id,event_id:row.event_id,reason:[401,403].includes(error.status)?'connection_unavailable':'remote_event_unavailable'});continue;}
   throw error; // Transient failure: do not persist a partially read batch.
  }
  const p=event?.extendedProperties?.private;
  if(event?.id!==row.event_id||!isOwnCalendarEvent(event,row.user_id)||!uuid.test(p?.siteId??'')||p.workDate!==row.work_date){
   unresolved.push({user_id:row.user_id,event_id:row.event_id,reason:'ownership_unverified'});continue;
  }
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${CALENDAR_SOURCE}:${row.user_id}:${p.siteId}:${row.work_date}`));
  const expected='fm'+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  if(expected!==row.event_id){unresolved.push({user_id:row.user_id,event_id:row.event_id,reason:'identity_mismatch'});continue;}
  await check();const site=await resolveSite(p.siteId);
  if(site?.id!==p.siteId||!uuid.test(site?.company_id??'')){unresolved.push({user_id:row.user_id,event_id:row.event_id,reason:'site_unavailable'});continue;}
  bindings.push({user_id:row.user_id,event_id:row.event_id,work_date:row.work_date,site_id:site.id,company_id:site.company_id});
 }
 await check();
 if(bindings.length&&await saveBindings(bindings)!==true)throw new Error('Calendar scope recovery not confirmed');
 return {recovered:bindings.length,unresolved,batchComplete:unresolved.length===0};
}
