import { isOwnCalendarEvent } from './googleCalendar.mjs';

// Server-side stage only. Inventory must be collected before removing sites or
// assignment records. No time-window inference or client-supplied ownership.
export async function deleteCompanyCalendarEvents({ inventory, assertLease, assertFrozen, read, remove }) {
  for (const fn of [inventory, assertLease, assertFrozen, read, remove]) {
    if (typeof fn !== 'function') throw new Error('Calendar deletion implementation required');
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const check = async () => {
    if (await assertLease() !== true || await assertFrozen() !== true) throw new Error('Calendar deletion scope is not frozen or leased');
  };
  await check();
  const plan = await inventory();
  if (plan?.complete !== true || !uuid.test(plan.companyId ?? '') ||
      !Array.isArray(plan.siteIds) || !Array.isArray(plan.events) || plan.events.length > 10000 ||
      plan.siteIds.some(id => !uuid.test(id))) throw new Error('Complete calendar inventory required');
  const sites = new Set(plan.siteIds), seen = new Set();
  const validate = (event, record) => {
    if (!event || event.id !== record.eventId || !isOwnCalendarEvent(event, record.userId) ||
        event.extendedProperties?.private?.siteId !== record.siteId || !event.etag) {
      throw new Error('Calendar event ownership cannot be verified');
    }
  };
  // Validate the entire manifest before any remote request or mutation.
  for (const record of plan.events) {
    const key = `${record?.userId}:${record?.eventId}`;
    if (!uuid.test(record?.userId ?? '') || !sites.has(record?.siteId) ||
        !/^fm[0-9a-f]{64}$/.test(record?.eventId ?? '') || seen.has(key)) {
      throw new Error('Invalid company calendar manifest');
    }
    seen.add(key);
  }
  const get = async record => {
    await check();
    try {
      const event = await read(record);
      // Cancelled tombstones may lack ownership fields. They are already gone
      // and never authorize a delete or any other remote mutation.
      if (event?.id === record.eventId && event.status === 'cancelled') return null;
      validate(event, record);
      return event;
    } catch (error) {
      if (error?.status === 404 || error?.status === 410) return null;
      throw error;
    }
  };
  // Fail before all writes if any initial read fails or reveals foreign data.
  for (const record of plan.events) await get(record);
  let removed = 0;
  for (const record of plan.events) {
    const event = await get(record); // Recheck ownership/ETag after the first pass.
    if (!event) continue;
    await check();
    await remove(record, { etag: event.etag });
    removed++;
  }
  for (const record of plan.events) {
    if (await get(record)) throw new Error('Calendar deletion not verified');
  }
  await check();
  return { verified: true, removed };
}
