import {calendarScopeReady, knownCalendarPolicy} from './deletionCalendarPolicy.mjs';
import { CALENDAR_SOURCE, isOwnCalendarEvent } from './googleCalendar.mjs';
import { deleteCompanyCalendarEvents } from './deletionCompanyCalendar.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Scope must come from durable, server-verified history, including former
// members. Current assignments alone cannot establish usersComplete=true.
export function createCompanyCalendarCleanup({ scope, assertLease, assertFrozen, api }) {
  if (!calendarScopeReady(scope) ||
      typeof scope.companyId !== 'string' || !uuid.test(scope.companyId) ||
      !Array.isArray(scope.siteIds) || !Array.isArray(scope.userIds) ||
      [...scope.siteIds,...scope.userIds].some(id => typeof id !== 'string' || !uuid.test(id)) ||
      scope.siteIds.length > 10000 || scope.userIds.length > 1000 ||
      new Set(scope.siteIds).size !== scope.siteIds.length || new Set(scope.userIds).size !== scope.userIds.length) {
    throw new Error('Complete server calendar scope required');
  }
  if ([assertLease,assertFrozen,api].some(fn => typeof fn !== 'function')) throw new Error('Calendar adapter required');
  const companyId=scope.companyId, siteIds=[...scope.siteIds], userIds=[...scope.userIds], sites=new Set(siteIds);
  const check=async()=>{if(await assertLease()!==true || await assertFrozen()!==true)throw new Error('Calendar scope is not frozen or leased');};
  async function inventory() {
    await check();
    const events=[],seen=new Set();
    let count=0;
    for (const userId of userIds) {
      // Deliberately no timeMin/timeMax: historical or manually moved events
      // must remain discoverable. Query primary, matching the app's writer.
      const params=new URLSearchParams({maxResults:'250',showDeleted:'false',singleEvents:'false'});
      params.append('privateExtendedProperty','source='+CALENDAR_SOURCE);
      params.append('privateExtendedProperty','userId='+userId);
      const pages=new Set();let finished=false;
      for(let page=0;page<100;page++) {
        await check();
        const response=await api(userId,'?'+params);
        if(response?.kind!=='calendar#events' || (response.items!==undefined && !Array.isArray(response.items))) throw new Error('Invalid calendar inventory response');
        for(const event of response.items??[]) {
          if(++count>100000)throw new Error('Calendar inventory exceeds review limit');
          if(event.status==='cancelled')continue;
          if(!isOwnCalendarEvent(event,userId)){if(knownCalendarPolicy(scope))continue;throw new Error('Calendar inventory ownership mismatch');}
          const siteId=event.extendedProperties.private.siteId;
          if(typeof siteId!=='string'||!uuid.test(siteId)){if(knownCalendarPolicy(scope))continue;throw new Error('Unresolved calendar site ownership');}
          if(!sites.has(siteId))continue;
          const key=userId+':'+event.id;
          if(seen.has(key))throw new Error('Duplicate calendar inventory event');
          seen.add(key);events.push({userId,siteId,eventId:event.id});
          if(events.length>10000)throw new Error('Calendar inventory exceeds deletion limit');
        }
        const next=response.nextPageToken;
        if(next===undefined){finished=true;break;}
        if(typeof next!=='string'||!next||pages.has(next))throw new Error('Invalid calendar pagination');
        pages.add(next);params.set('pageToken',next);
      }
      if(!finished)throw new Error('Calendar inventory is incomplete');
    }
    await check();
    return {companyId,siteIds:[...siteIds],events,complete:true};
  }
  return {
    inventory,
    async execute() {
      const result=await deleteCompanyCalendarEvents({inventory,assertLease,assertFrozen,
        read:record=>api(record.userId,'/'+record.eventId),
        remove:(record,{etag})=>api(record.userId,'/'+record.eventId,{method:'DELETE',etag}),
      });
      // Re-list as well as GET-verifying the old manifest. A newly appearing
      // target event must never be silently called a completed deletion.
      if((await inventory()).events.length)throw new Error('Company calendar events remain');
      return result;
    },
  };
}
