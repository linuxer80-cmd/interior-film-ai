export const REPORT_REMINDER_TYPE = 'work_report_reminder';
export const koreaDay = (now = new Date()) => now.toLocaleDateString('sv-SE', {timeZone:'Asia/Seoul'});
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
function dateOnly(value) {
  if(validDay(value)) return value;
  if(!value || Number.isNaN(Date.parse(value))) return null;
  return koreaDay(new Date(value));
}
export function reminderWindow(now = new Date()) {
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'}).format(now));
  return hour === 18;
}
export function finalWorkDay(site, daily = []) {
  if(Array.isArray(site.work_dates)) {
    return site.work_dates.filter(validDay).sort().at(-1) || null;
  }
  const dates=daily.filter(row=>row.site_id===site.id && row.company_id===site.company_id)
    .map(row=>row.work_date).filter(validDay);
  // Do not mistake a partially assigned earlier day for the site end date.
  const scheduled=dateOnly(site.schedule_end) || dateOnly(site.schedule_date) || dateOnly(site.schedule_start);
  return [...dates,...(scheduled?[scheduled]:[])].sort().at(-1) || null;
}
export function reportReminderLeaders({site,daily=[],legacy=[],workers=[],report,date}) {
  if(!['scheduled','in_progress','completed'].includes(site.status)) return [];
  if(finalWorkDay(site,daily)!==date) return [];
  if(report && ['pending','approved','accepted'].includes(report.review_status || 'pending')) return [];
  const scoped=rows=>rows.filter(row=>row.site_id===site.id && row.company_id===site.company_id);
  const dated=scoped(daily);
  const assignments=Array.isArray(site.work_dates) || dated.length
    ? dated.filter(row=>row.work_date===date) : scoped(legacy);
  const ids=new Set(assignments.filter(row=>row.role==='leader').map(row=>row.worker_id));
  const users=new Map();
  for(const worker of workers) {
    if(worker.company_id===site.company_id && worker.is_active===true && worker.user_id && ids.has(worker.id)) {
      if(!users.has(worker.user_id)) users.set(worker.user_id,worker);
    }
  }
  return [...users.values()];
}
export function reportReminderNotice(site,worker,date) {
  return {
    company_id:site.company_id,recipient_type:'worker',recipient_worker_id:worker.id,
    recipient_user_id:worker.user_id,type:REPORT_REMINDER_TYPE,priority:'normal',
    title:'완료보고를 작성해주세요',
    message:`${site.site_name || '현장'}의 마지막 시공일입니다. 작업 내용을 확인하고 완료보고를 제출해주세요.`,
    link:`/worker/site/${site.id}?section=report`,reference_type:'site',reference_id:site.id,
    dedupe_key:`work-report-reminder:${site.company_id}:${site.id}:${date}:${worker.user_id}`,
    is_read:false,push_sent:false,
  };
}
const take = result => {if(result.error) throw result.error; return result.data;};
export async function reminderRows(query) {
  const result=[];
  for(let offset=0;offset<50000;offset+=500) {
    const page=take(await query.range(offset,offset+499)) || [];
    result.push(...page);
    if(page.length<500) return result;
  }
  throw Error('완료보고 알림 조회 범위를 초과했습니다.');
}
export async function currentReportReminder(db,siteId,date) {
  const site=take(await db.from('sites')
    .select('id,company_id,site_name,status,work_dates,schedule_start,schedule_end,schedule_date')
    .eq('id',siteId).maybeSingle());
  if(!site) return {site:null,leaders:[]};
  const company=take(await db.from('companies').select('is_active').eq('id',site.company_id).maybeSingle());
  if(company?.is_active!==true) return {site,leaders:[]};
  const scope=table=>db.from(table).select('*').eq('company_id',site.company_id).eq('site_id',site.id).order('id');
  const [daily,legacy,report]=await Promise.all([
    reminderRows(scope('site_daily_assignments')),
    reminderRows(scope('site_workers')),
    db.from('work_reports').select('review_status').eq('company_id',site.company_id).eq('site_id',site.id)
      .order('updated_at',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle().then(take),
  ]);
  const ids=[...new Set([...daily,...legacy].filter(row=>row.role==='leader').map(row=>row.worker_id))];
  const workers=[];
  for(let i=0;i<ids.length;i+=100) workers.push(...await reminderRows(db.from('workers')
    .select('id,company_id,user_id,is_active').eq('company_id',site.company_id)
    .eq('is_active',true).in('id',ids.slice(i,i+100)).order('id')));
  let leaders=reportReminderLeaders({site,daily,legacy,workers,report,date});
  if(leaders.length) {
    const profiles=take(await db.from('profiles').select('id,is_active').in('id',leaders.map(w=>w.user_id))) || [];
    const disabled=new Set(profiles.filter(p=>p.is_active===false).map(p=>p.id));
    leaders=leaders.filter(w=>!disabled.has(w.user_id));
  }
  return {site,leaders};
}
export async function queueReportReminder(db,notice) {
  // Existing notifications.dedupe_key unique index arbitrates concurrent cron runs.
  // The existing INSERT webhook delivers this notification through /api/send-push.
  const {error}=await db.from('notifications').insert(notice);
  if(!error) return true;
  if(error.code==='23505') {
    const existing=take(await db.from('notifications').select('id').eq('dedupe_key',notice.dedupe_key).maybeSingle());
    if(existing) return false;
  }
  throw error;
}
