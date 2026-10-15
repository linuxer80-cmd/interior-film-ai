const active = ['consulting', 'scheduled', 'in_progress'];
export const koreanToday = (now = new Date()) => now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function initialSiteStatus(form) {
  return form.consultation_quote_seed ? 'consulting' : (form.status || 'scheduled');
}

export function nextSiteStatus(site, report, now = new Date()) {
  if (!active.includes(site.status)) return site.status;
  // A later manual edit/reopening takes precedence over an old report.
  const submitted = Date.parse(report?.completed_at);
  const edited = Date.parse(site.updated_at);
  if (['pending', 'approved'].includes(report?.review_status) && Number.isFinite(submitted) &&
      (!Number.isFinite(edited) || submitted >= edited)) return 'completed';
  if (site.status !== 'scheduled') return site.status;
  const days = Array.isArray(site.work_dates)
    ? site.work_dates.filter(validDay).sort()
    : [validDay(site.schedule_date) ? site.schedule_date :
      (site.schedule_start && !Number.isNaN(Date.parse(site.schedule_start)) ? koreanToday(new Date(site.schedule_start)) : '')].filter(Boolean);
  return days[0] && days[0] <= koreanToday(now) ? 'in_progress' : 'scheduled';
}

async function applyStatus(db, site, report, now) {
  const status = nextSiteStatus(site, report, now);
  if (status === site.status) return 0;
  let query = db.from('sites').update({ status, updated_at: now.toISOString() })
    .eq('id', site.id).eq('company_id', site.company_id).eq('status', site.status);
  query = site.updated_at == null ? query.is('updated_at', null) : query.eq('updated_at', site.updated_at);
  const result = await query.select('id');
  if (result.error) throw result.error;
  return result.data?.length || 0;
}

// Service-side only: callers must authenticate the owner, assigned worker, or cron first.
export async function syncSiteLifecycle(db, { companyId, siteId, now = new Date() } = {}) {
  let cursor = null, changed = 0;
  for (;;) {
    let query = db.from('sites').select('id,company_id,status,updated_at,work_dates,schedule_date,schedule_start')
      .in('status', active).order('id').limit(100);
    if (companyId) query = query.eq('company_id', companyId);
    if (siteId) query = query.eq('id', siteId);
    if (cursor) query = query.gt('id', cursor);
    const {data: sites, error} = await query;
    if (error) throw error;
    if (!sites?.length) break;
    const reports = new Map();
    for (let offset = 0;; offset += 500) {
      let reportQuery = db.from('work_reports').select('id,site_id,company_id,completed_at,updated_at,review_status')
        .in('site_id', sites.map(site => site.id)).order('updated_at', {ascending:false}).order('id').range(offset, offset + 499);
      if (companyId) reportQuery = reportQuery.eq('company_id', companyId);
      const result = await reportQuery;
      if (result.error) throw result.error;
      for (const report of result.data || []) {
        const key = report.company_id + ':' + report.site_id;
        if (!reports.has(key)) reports.set(key, report);
      }
      if ((result.data || []).length < 500) break;
    }
    // Limited batches keep the database load bounded.
    for (let i = 0; i < sites.length; i += 10) {
      const results = await Promise.all(sites.slice(i, i + 10).map(site =>
        applyStatus(db, site, reports.get(site.company_id + ':' + site.id), now)));
      changed += results.reduce((sum, count) => sum + count, 0);
    }
    cursor = sites.at(-1).id;
    if (siteId || sites.length < 100) break;
  }
  return { changed };
}

export async function syncAfterReport(db, companyId, siteId) {
  try {
    await syncSiteLifecycle(db, { companyId, siteId });
    return '';
  } catch (error) {
    console.error('report site status sync', error?.code || error?.message);
    return '완료보고는 저장됐지만 현장 상태 변경이 지연됐습니다. 관리자 현장 목록을 다시 열면 재시도합니다.';
  }
}
