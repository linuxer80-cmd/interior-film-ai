export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';
export const CALENDAR_SOURCE = 'filmjang-v1';
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
export function validDay(value) {
  return typeof value === 'string' && dayPattern.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
export function nextDay(day) { return new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10); }
export function calendarWindow(from,to) {
  if(!validDay(from)||!validDay(to)||to<from||(Date.parse(to)-Date.parse(from))/86400000>30) throw Error('조회 기간은 시작일부터 최대 31일로 선택해주세요.');
  return {timeMin:from+'T00:00:00+09:00',timeMax:nextDay(to)+'T00:00:00+09:00'};
}
export function assignedDays(site,from,to) {
  if(site.status==='cancelled'||site.site_status==='cancelled') return [];
  let days;
  if(Array.isArray(site.assigned_dates)) days=site.assigned_dates.map(d=>d.work_date);
  else if(Array.isArray(site.work_dates)) days=site.work_dates;
  else {
    days=[];
    const start=String(site.schedule_start||'').slice(0,10),end=String(site.schedule_end||start).slice(0,10);
    if(validDay(start)&&validDay(end)&&end>=start) for(let day=start>from?start:from;day<=end&&day<=to;day=nextDay(day)) days.push(day);
  }
  return [...new Set(days.filter(d=>validDay(d)&&d>=from&&d<=to))].sort();
}
export async function siteCalendarEvents(sites,userId,from,to,origin,cryptoApi=globalThis.crypto) {
  calendarWindow(from,to);
  const result=new Map();
  for(const site of sites) for(const day of assignedDays(site,from,to)) {
    const siteId=site.site_id;
    if(!siteId)continue;
    const digest=await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(CALENDAR_SOURCE+':'+userId+':'+siteId+':'+day));
    const id='fm'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    result.set(id,{id,summary:'[필름장이] '+(site.site_name||'시공 현장'),location:[site.address,site.address_detail].filter(Boolean).join(' '),
      description:[site.company_name?'업체: '+site.company_name:'',site.work_description||site.work_type||'', '배정: '+(((site.assigned_dates||[]).find(d=>d.work_date===day)?.role||site.my_role)==='leader'?'팀장':'팀원'),new URL('/worker/site/'+encodeURIComponent(siteId),origin).toString()].filter(Boolean).join('\n'),
      start:{date:day},end:{date:nextDay(day)},extendedProperties:{private:{source:CALENDAR_SOURCE,userId,siteId,workDate:day}}});
  }
  return [...result.values()];
}
export function isOwnCalendarEvent(event,userId) {
  const p=event.extendedProperties?.private;
  return p?.source===CALENDAR_SOURCE&&p.userId===userId&&/^fm[0-9a-f]{64}$/.test(event.id||'');
}
export function obsoleteCalendarEvents(events,planned,userId) {
  const ids=new Set(planned.map(e=>e.id));
  return events.filter(e=>e.status!=='cancelled'&&isOwnCalendarEvent(e,userId)&&!ids.has(e.id));
}
export async function calendarApi(token,path='',{method='GET',body,etag,fetcher=fetch}={}) {
  const response=await fetcher('https://www.googleapis.com/calendar/v3/calendars/primary/events'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{}),...(etag?{'If-Match':etag}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok) {
    const error=Object.assign(Error(response.status===401?'구글 연결 시간이 만료됐습니다. 다시 연결해주세요.':response.status===403?'캘린더 권한 또는 Google Calendar API 활성화 설정을 확인해주세요.':response.status===412?'구글 일정이 변경됐습니다. 다시 불러온 뒤 시도해주세요.':'구글 캘린더 요청에 실패했습니다. 잠시 후 다시 시도해주세요.'),{status:response.status});
    throw error;
  }
  return response.status===204?null:response.json();
}
export async function readCalendarEvents(token,from,to,api=calendarApi) {
  const params=new URLSearchParams({...calendarWindow(from,to),singleEvents:'true',orderBy:'startTime',maxResults:'250',timeZone:'Asia/Seoul'});
  const items=[];let summary='';
  for(let page=0;page<20;page++) {
    const result=await api(token,'?'+params);
    items.push(...(result.items||[]));summary=result.summary||summary;
    if(!result.nextPageToken)return {items,summary};
    params.set('pageToken',result.nextPageToken);
  }
  throw Error('일정이 너무 많습니다. 조회 기간을 줄여주세요.');
}
export async function writeCalendarEvent(token,event,userId,api=calendarApi) {
  let current;
  try { current=await api(token,'/'+event.id); } catch(e){if(e.status!==404)throw e;}
  if(current) {
    if(!isOwnCalendarEvent(current,userId)||current.status==='cancelled')throw Error('기존 일정의 소유 표시를 확인할 수 없습니다. 구글 캘린더에서 확인해주세요.');
    const {id,...patch}=event;
    return api(token,'/'+id,{method:'PATCH',body:patch,etag:current.etag});
  }
  try {return await api(token,'',{method:'POST',body:event});}catch(e) {
    if(e.status!==409)throw e;
    current=await api(token,'/'+event.id);
    if(!isOwnCalendarEvent(current,userId)||current.status==='cancelled')throw Error('일정 연결 정보가 변경됐습니다. 다시 불러와주세요.');
    const {id,...patch}=event;
    return api(token,'/'+id,{method:'PATCH',body:patch,etag:current.etag});
  }
}
