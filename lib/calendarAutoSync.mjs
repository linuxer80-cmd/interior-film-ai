import { CALENDAR_SOURCE, calendarApi, siteCalendarEvents, readCalendarEvents, writeCalendarEvent, obsoleteCalendarEvents, isOwnCalendarEvent } from './googleCalendar.mjs';
import { APP_ORIGIN, unseal, seal, googleToken } from './calendarAutoCrypto.mjs';
import { rows } from './workerSiteAssignments.mjs';
import { calendarSites } from './calendarAutoSites.mjs';
export const checked = async query => {const {data,error}=await query;if(error)throw error;return data;};
export function autoWindow(now=new Date()) {
  const from=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const plus=n=>new Date(Date.parse(from+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  return {from,to:plus(89),chunks:[0,31,62].map(n=>({from:plus(n),to:plus(Math.min(n+30,89))}))};
}
// Reads must all succeed before deletion is considered. Only markers owned by
// this app/user or the private server ledger can authorize an event mutation.
export async function reconcileCalendar({token,userId,sites,from,to,chunks,ledger=[],assertActive=async()=>{},remember=async()=>{},forget=async()=>{},api=calendarApi}) {
  const plan=(await Promise.all(chunks.map(w=>siteCalendarEvents(sites,userId,w.from,w.to,APP_ORIGIN)))).flat();
  if(plan.length>1000)throw Error('자동 동기화 일정이 너무 많습니다.');
  const ownedApi=(value,path,options)=>{
    const query=new URLSearchParams(path.slice(1));
    query.append('privateExtendedProperty','source='+CALENDAR_SOURCE);
    query.append('privateExtendedProperty','userId='+userId);
    return api(value,'?'+query,options);
  };
  const remote=(await Promise.all(chunks.map(w=>readCalendarEvents(token,w.from,w.to,ownedApi)))).flatMap(r=>r.items);
  const ids=new Set(plan.map(e=>e.id)),known=new Set(ledger.map(e=>e.event_id));
  let changed=0,skipped=0,removed=0;
  for(const event of plan) {
    await assertActive();
    let current;
    try {current=await api(token,'/'+event.id);}catch(e){if(e.status!==404)throw e;}
    let result;
    if(current?.status==='cancelled' && (known.has(event.id)||isOwnCalendarEvent(current,userId))) {
      if(!current.etag)throw Error('기존 일정 버전을 확인하지 못했습니다.');
      const {id,...body}=event;
      result=await api(token,'/'+id,{method:'PATCH',body:{...body,status:'confirmed'},etag:current.etag});
    } else {
      // Reuse the normal conflict/ownership/ETag handling (and avoid another GET).
      const cachedApi=async(t,path,options)=>path==='/'+event.id&&!options&&current ? current : api(t,path,options);
      result=await writeCalendarEvent(token,event,userId,cachedApi);
    }
    if(result?.skipped)skipped++;else changed++;
    await remember({event_id:event.id,work_date:event.start.date});
  }
  const obsolete=new Map(obsoleteCalendarEvents(remote,plan,userId).map(e=>[e.id,e]));
  // Also find app events moved out of the window by a Google Calendar edit.
  for(const record of ledger)if(record.work_date>=from&&!ids.has(record.event_id))obsolete.set(record.event_id,{id:record.event_id});
  for(const old of obsolete.values()) {
    await assertActive();
    let current;
    try {current=await api(token,'/'+old.id);}catch(e){if(e.status!==404&&e.status!==410)throw e;await forget(old.id);continue;}
    if(current.status!=='cancelled') {
      if(!isOwnCalendarEvent(current,userId)||!current.etag)throw Error('앱 일정 소유 정보를 확인하지 못했습니다.');
      await api(token,'/'+current.id,{method:'DELETE',etag:current.etag});removed++;
    }
    // Keep ledger tombstones: a cancelled date may be assigned again later.
  }
  return {changed,skipped,removed};
}
export async function runAutoSync(db,userId=null,{deadline=Date.now()+220000}={}) {
  const claimed=await checked(db.rpc('calendar_auto_claim',{p_user:userId}));
  const connection=claimed?.[0];
  if(!connection)return {queued:true};
  const user=connection.user_id;
  const filter=query=>query.eq('user_id',user).eq('generation',connection.generation).eq('lease_id',connection.lease_id);
  const assertActive=async()=>{
    if(Date.now()>deadline)throw Error('처리 시간이 길어져 다음 동기화에서 이어갑니다.');
    const row=await checked(filter(db.from('calendar_auto_connections').select('enabled,needs_reconnect,lease_until')).maybeSingle());
    if(!row?.enabled||row.needs_reconnect||Date.parse(row.lease_until)<Date.now())throw Error('자동 동기화 연결이 변경됐습니다.');
  };
  try {
    await assertActive();
    const window=autoWindow();
    const sites=await calendarSites(db,user,window.from,window.to);
    const ledger=await rows(db.from('calendar_auto_events').select('event_id,work_date').eq('user_id',user).gte('work_date',window.from).order('event_id'));
    if(ledger.length>=5000)throw Error('기존 일정 자료가 너무 많습니다.');
    const credentials=await googleToken({grant_type:'refresh_token',refresh_token:unseal(connection.refresh_cipher,'refresh:'+user)});
    if(credentials.refresh_token)await checked(filter(db.from('calendar_auto_connections').update({refresh_cipher:seal(credentials.refresh_token,'refresh:'+user)})));
    const result=await reconcileCalendar({token:credentials.access_token,userId:user,sites,...window,ledger,assertActive,
      remember:record=>checked(db.from('calendar_auto_events').upsert({user_id:user,...record})),
      forget:id=>checked(db.from('calendar_auto_events').delete().eq('user_id',user).eq('event_id',id)),
    });
    await checked(filter(db.from('calendar_auto_connections').update({last_sync_at:new Date().toISOString(),last_error:null,next_run_at:new Date(Date.now()+300000).toISOString(),lease_id:null,lease_until:null})));
    return result;
  } catch(error) {
    const reconnect=error.reconnect===true||error.status===401;
    await checked(filter(db.from('calendar_auto_connections').update({needs_reconnect:reconnect,last_error:reconnect?'구글 연결이 만료되거나 철회되었습니다. 다시 연결해주세요.':'자동 반영에 실패했습니다. 다음 실행에서 다시 시도합니다.',next_run_at:new Date(Date.now()+300000).toISOString(),lease_id:null,lease_until:null})));
    return {failed:true,reconnect};
  }
}
