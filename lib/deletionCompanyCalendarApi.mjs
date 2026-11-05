import {calendarApi} from './googleCalendar.mjs';
import {googleToken, unseal, seal} from './calendarAutoCrypto.mjs';

// Server-only. userIds must be the complete frozen scope, never request input.
// Read disabled connections too: disabling sync does not remove remote events.
export function createDeletionCalendarApi({db, userIds, assertLease, assertFrozen,
  refresh = googleToken, decrypt = unseal, encrypt = seal, api = calendarApi,
  now = Date.now}) {
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!Array.isArray(userIds) || userIds.some(id=>!uuid.test(id)) ||
      new Set(userIds).size!==userIds.length || userIds.length>1000 ||
      typeof assertLease!=='function' || typeof assertFrozen!=='function') {
    throw new Error('Verified calendar credential scope required');
  }
  const users=new Set(userIds), cache=new Map();
  const guard=async()=>{
    if(await assertLease()!==true || await assertFrozen()!==true)throw new Error('Calendar deletion guard failed');
  };
  return async (userId,path,options={})=>{
    if(!users.has(userId))throw new Error('Calendar user outside deletion scope');
    const method=options.method??'GET';
    // This adapter is intentionally incapable of creating or modifying events.
    if(!['GET','DELETE'].includes(method) || typeof path!=='string' ||
      !(path.startsWith('?') || /^\/fm[0-9a-f]{64}$/.test(path)) ||
      (method==='DELETE' && (!/^\/fm[0-9a-f]{64}$/.test(path) || typeof options.etag!=='string' || !options.etag))) {
      throw new Error('Invalid deletion calendar operation');
    }
    await guard();
    const connection=await db.from('calendar_auto_connections')
      .select('user_id,refresh_cipher,needs_reconnect,lease_id').eq('user_id',userId).maybeSingle();
    if(connection.error)throw new Error('Calendar credentials unavailable');
    const row=connection.data;
    if(row?.user_id!==userId || typeof row.refresh_cipher!=='string' || !row.refresh_cipher ||
       row.needs_reconnect!==false || row.lease_id!==null)throw new Error('Calendar reconnection or sync shutdown required');
    let credential=cache.get(userId);
    if(!credential || credential.cipher!==row.refresh_cipher || credential.until<=now()){
      await guard();
      const result=await refresh({grant_type:'refresh_token',refresh_token:decrypt(row.refresh_cipher,'refresh:'+userId)});
      if(typeof result?.access_token!=='string' || !result.access_token ||
        !Number.isFinite(result.expires_in) || result.expires_in<=60)throw new Error('Invalid calendar token response');
      let cipher=row.refresh_cipher;
      if(result.refresh_token!==undefined){
        if(typeof result.refresh_token!=='string'||!result.refresh_token)throw new Error('Invalid calendar refresh token');
        await guard();
        cipher=encrypt(result.refresh_token,'refresh:'+userId);
        const saved=await db.from('calendar_auto_connections').update({refresh_cipher:cipher})
          .eq('user_id',userId).eq('refresh_cipher',row.refresh_cipher).is('lease_id',null)
          .select('user_id').maybeSingle();
        if(saved.error || saved.data?.user_id!==userId)throw new Error('Calendar token rotation not persisted');
      }
      credential={token:result.access_token,cipher,until:now()+(result.expires_in-60)*1000};
      cache.set(userId,credential);
    }
    await guard();
    return api(credential.token,path,{method,...(method==='DELETE'?{etag:options.etag}:{})});
  };
}

// Composition entry point used by the company stage's deleteCalendar callback.
export async function createAuthenticatedCompanyCalendarCleanup(options) {
  const {createCompanyCalendarCleanup}=await import('./deletionCompanyCalendarInventory.mjs');
  const {scope,assertLease,assertFrozen}=options;
  const api=createDeletionCalendarApi({...options,userIds:scope?.userIds});
  const stage=createCompanyCalendarCleanup({scope,assertLease,assertFrozen,api});
  return {...stage, async executeAndClearLedger() {
    const {clearVerifiedCompanyCalendarLedger}=await import('./deletionCompanyCalendarLedger.mjs');
    const result=await stage.execute();
    await clearVerifiedCompanyCalendarLedger({...options,api});
    if((await stage.inventory()).events.length)throw new Error('Company calendar events reappeared');
    return result;
  }};
}

// Resolve scope from a leased request on the server. Callers cannot replace it
// with a client-supplied user/site list or completeness flag.
export async function createRequestedCompanyCalendarCleanup({db,requestId,lease,companyId,assertLease,assertFrozen}) {
  if(typeof assertLease!=='function'||typeof assertFrozen!=='function')throw new Error('Calendar request guards required');
  if(await assertLease()!==true||await assertFrozen()!==true)throw new Error('Calendar request is not frozen');
  const {data,error}=await db.rpc('inspect_frozen_company_calendar_scope',{p_request:requestId,p_lease:lease});
  if(error)throw error;
  if(data?.companyId!==companyId)throw new Error('Calendar request company mismatch');
  return createAuthenticatedCompanyCalendarCleanup({db,requestId,lease,scope:data,assertLease,assertFrozen});
}
