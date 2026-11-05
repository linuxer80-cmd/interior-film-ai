import {deleteApprovedLegacyPhotos} from './deletionApprovedLegacyPhotos.mjs';
// Server-only orchestration. Callbacks must use a complete, trusted inventory;
// neither request bodies nor uploader IDs establish ownership.
export async function deleteAccountCompany({db, requestId, lease, companyId,
  assertLease, deleteCalendar, deleteFiles, verifyExternalCleanup}) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (![requestId, lease, companyId].every(value => uuid.test(value ?? '')) ||
      ![assertLease, deleteFiles, verifyExternalCleanup].every(fn => typeof fn === 'function') ||
      (deleteCalendar!==undefined && typeof deleteCalendar!=='function')) {
    throw new Error('Complete company deletion implementation required');
  }
  const guard = async () => {
    if (await assertLease() !== true) throw new Error('Company execution lease not confirmed');
  };
  const rpc = async name => {
    await guard();
    const {data, error} = await db.rpc(name, {p_request: requestId, p_lease: lease});
    if (error) throw error;
    return data;
  };
  const frozen = await rpc('freeze_company_calendar_jobs');
  if (frozen?.companyId !== companyId) throw new Error('Company freeze scope mismatch');
  await guard();
  let calendarStage;
  if(deleteCalendar===undefined){
    const {createRequestedCompanyCalendarCleanup}=await import('./deletionCompanyCalendarApi.mjs');
    calendarStage=await createRequestedCompanyCalendarCleanup({db,requestId,lease,companyId,assertLease,
      assertFrozen:async()=>await rpc('assert_company_deletion_frozen')===true});
    if((await calendarStage.executeAndClearLedger())?.verified!==true)throw new Error('Company calendar cleanup not confirmed');
  }else if(await deleteCalendar(companyId)!==true)throw new Error('Company calendar cleanup not confirmed');
  await guard();
  await deleteApprovedLegacyPhotos({db,requestId,lease,companyId,assertLease,
    assertFrozen:async()=>await rpc('assert_company_deletion_frozen')===true});
  await guard();
  if (await deleteFiles(companyId) !== true) throw new Error('Company file cleanup not confirmed');
  // Preserve business rows if remote/file cleanup was partial or ambiguous.
  await guard();
  if(calendarStage && (await calendarStage.inventory()).events.length)throw new Error('Company calendar events reappeared');
  if (await verifyExternalCleanup(companyId) !== true) throw new Error('External company cleanup not verified');
  for (const name of ['delete_frozen_company_business_records',
    'delete_frozen_company_media_records', 'delete_empty_company_sites',
    'finalize_frozen_empty_company']) {
    if (await rpc(name) !== true) throw new Error(`Company stage not confirmed: ${name}`);
  }
  await guard();
  // Calendar pause release follows personal calendar disconnection separately.
  return true;
}
