import { nextSiteStatus, koreanToday } from './siteLifecycle.mjs';

export const shiftDay = (day, amount) => new Date(Date.parse(day + 'T00:00:00Z') + amount * 86400000).toISOString().slice(0, 10);
const validDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const localDay = v => !v ? null : validDay(v) ? v : Number.isFinite(Date.parse(v)) ? koreanToday(new Date(v)) : null;
const byRecent = (a,b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')) || String(b.id).localeCompare(String(a.id));
export function scheduledDays(site, from, to) {
  if (Array.isArray(site.work_dates)) return [...new Set(site.work_dates.filter(d => validDay(d) && d >= from && d <= to))].sort();
  const start = localDay(site.schedule_start) || localDay(site.schedule_date);
  const end = localDay(site.schedule_end) || start;
  if (!start || !end || end < start || end < from || start > to) return [];
  const days=[];
  for(let d=start > from ? start : from; d<=end && d<=to; d=shiftDay(d,1)) days.push(d);
  return days;
}
export function summarizeOperations({company,sites,workers,daily,legacy,reports}, {days=30,now=new Date(),workerIds=null}={}) {
  const today=koreanToday(now), from=shiftDay(today,-days), until=shiftDay(today,13);
  const workerMap=new Map(workers.filter(w=>w.company_id===company.id).map(w=>[w.id,w]));
  const own=workerIds ? new Set(workerIds) : null;
  const latest=new Map();
  for(const r of [...reports].filter(r=>r.company_id===company.id).sort(byRecent)) if(!latest.has(r.site_id)) latest.set(r.site_id,r);
  const groupBySite = rows => {
    const map=new Map();
    for(const row of rows) if(row.company_id===company.id) { const list=map.get(row.site_id)||[];list.push(row);map.set(row.site_id,list); }
    return map;
  };
  const dailyBySite=groupBySite(daily), legacyBySite=groupBySite(legacy);
  const upcoming=[],past=[],siteRows=[];
  for(const s of sites.filter(s=>s.company_id===company.id)) {
    const report=latest.get(s.id), status=nextSiteStatus(s,report,now);
    const allDaily=(dailyBySite.get(s.id)||[]);
    const validDaily=allDaily.filter(a=>!Array.isArray(s.work_dates)||s.work_dates.includes(a.work_date));
    const old=(legacyBySite.get(s.id)||[]);
    const useDaily=Array.isArray(s.work_dates)||allDaily.length>0;
    if(own && !(useDaily?validDaily:old).some(a=>own.has(a.worker_id))) continue;
    const end=Array.isArray(s.work_dates)?s.work_dates.filter(validDay).sort().at(-1):localDay(s.schedule_end)||localDay(s.schedule_start)||localDay(s.schedule_date);
    const overdue=['scheduled','in_progress'].includes(status) && !!end && end<today && !['pending','approved'].includes(report?.review_status);
    const stalePending=report?.review_status==='pending' && Number.isFinite(Date.parse(report.updated_at)) && Date.parse(report.updated_at)<now.getTime()-7*86400000;
    siteRows.push({id:s.id,companyId:company.id,companyName:company.company_name,name:s.site_name||'현장명 미등록',status,reportStatus:report?.review_status||null,reportUpdatedAt:report?.updated_at||null,updatedAt:s.updated_at||s.created_at||null,createdAt:s.created_at||null,overdue,stalePending});
    if(status==='cancelled') continue;
    const daySet=new Set(scheduledDays(s,from,until));
    // On legacy sites, explicitly assigned days remain observable even without an overall schedule.
    if(!Array.isArray(s.work_dates)) for(const a of validDaily) if(validDay(a.work_date)&&a.work_date>=from&&a.work_date<=until) daySet.add(a.work_date);
    for(const day of [...daySet].sort()) {
      const candidates=(useDaily?validDaily.filter(a=>a.work_date===day):old).filter(a=>workerMap.get(a.worker_id)?.is_active!==false && workerMap.has(a.worker_id));
      const selected=own?candidates.filter(a=>own.has(a.worker_id)):candidates;
      if(own&&!selected.length) continue;
      const people=new Map();
      for(const a of selected) {
        const w=workerMap.get(a.worker_id), key=w.user_id||w.id, prev=people.get(key);
        if(!prev||a.role==='leader') people.set(key,{id:key,workerId:w.id,name:w.name||'이름 미등록',role:a.role==='leader'?'leader':'member'});
      }
      const row={key:company.id+':'+s.id+':'+day,date:day,siteId:s.id,siteName:s.site_name||'현장명 미등록',companyId:company.id,companyName:company.company_name,people:[...people.values()],legacy:!useDaily};
      if(day>=today && !['completed','cancelled'].includes(status)) upcoming.push(row);
      if(day<today) past.push(row);
    }
  }
  const live=siteRows.filter(s=>s.status!=='cancelled');
  const pending=live.filter(s=>s.reportStatus==='pending');
  const recent=siteRows.filter(s=>s.updatedAt&&Date.parse(s.updatedAt)>=now.getTime()-days*86400000);
  const pastDays=[...new Set(past.filter(r=>r.people.length).map(r=>r.date))];
  const leaderDays=[...new Set(past.filter(r=>r.people.some(p=>p.role==='leader')).map(r=>r.date))];
  return {company,period:{days,from,today,until},summary:{sites:siteRows.length,consulting:live.filter(s=>s.status==='consulting').length,scheduled:live.filter(s=>s.status==='scheduled').length,inProgress:live.filter(s=>s.status==='in_progress').length,completed:live.filter(s=>s.status==='completed').length,cancelled:siteRows.filter(s=>s.status==='cancelled').length,pending:pending.length,stalePending:pending.filter(s=>s.stalePending).length,rejected:live.filter(s=>s.reportStatus==='rejected').length,overdue:live.filter(s=>s.overdue).length,recentlyUpdated:recent.length,unassigned:upcoming.filter(r=>!r.people.length).length,noLeader:upcoming.filter(r=>r.people.length&&!r.people.some(p=>p.role==='leader')).length,pastAssignmentDays:pastDays.length,pastLeaderDays:leaderDays.length,upcomingDays:new Set(upcoming.map(r=>r.date)).size,workers:workers.length,activeWorkers:workers.filter(w=>w.is_active!==false).length,unlinkedWorkers:workers.filter(w=>!w.user_id).length},sites:siteRows.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))||a.id.localeCompare(b.id)),upcoming:upcoming.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key)),pastDays,leaderDays};
}
export function scheduleConflicts(groups) {
  const slots=new Map();
  for(const row of groups.flatMap(g=>g.upcoming)) for(const person of row.people) {
    const key=row.date+':'+person.id;
    if(!slots.has(key)) slots.set(key,{date:row.date,name:person.name,sites:new Map()});
    slots.get(key).sites.set(row.companyId+':'+row.siteId,{name:row.siteName,companyName:row.companyName});
  }
  return [...slots.values()].filter(r=>r.sites.size>1).map(r=>({...r,sites:[...r.sites.values()]})).sort((a,b)=>a.date.localeCompare(b.date));
}
