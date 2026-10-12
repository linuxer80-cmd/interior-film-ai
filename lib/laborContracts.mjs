// Service-role callers must scope company and worker IDs after authentication.
async function rows(query) {
  const result = [];
  for (let offset = 0; offset < 50000; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < 500) return result;
  }
  throw new Error('구인 계약 조회 범위를 초과했습니다.');
}
export async function loadLaborContracts(db, companyId, workerIds) {
  if (!workerIds.length) return [];
  const workers = await rows(db.from('workers').select('id,user_id').eq('company_id', companyId).in('id', workerIds).order('id'));
  const userIds = [...new Set(workers.map(w => w.user_id).filter(Boolean))];
  let snapshots = [];
  try {
    snapshots = await rows(db.from('worker_assignment_wages').select('*').eq('company_id',companyId).in('worker_id',workerIds).order('worker_id').order('site_id').order('work_date'));
  } catch(error) {
    if (!['42P01','PGRST205'].includes(error.code)) throw error;
  }
  const contracts = snapshots.map(s=>({workerId:s.worker_id,siteId:s.site_id,dates:[s.work_date],amount:s.daily_wage,snapshot:true}));
  if (!userIds.length) return contracts;
  const jobs = await rows(db.from('labor_jobs').select('id,site_id,work_dates,daily_wage').eq('company_id', companyId).order('id'));
  for (let offset = 0; offset < jobs.length; offset += 100) {
    const batch = jobs.slice(offset, offset + 100);
    const applications = await rows(db.from('labor_applications').select('*').in('job_id', batch.map(j => j.id)).in('user_id', userIds).eq('status', 'accepted').order('id'));
    for (const a of applications) {
      const job = batch.find(j => j.id === a.job_id);
      const amount = a.accepted_daily_wage ?? job.daily_wage;
      if (amount == null) continue; // 새 계약은 등록 일당, 기존 계약은 종전 기준을 보존합니다.
      for (const w of workers.filter(w => w.user_id === a.user_id)) {
        contracts.push({workerId:w.id,siteId:a.accepted_site_id ?? job.site_id,dates:a.accepted_work_dates ?? job.work_dates ?? [],amount});
      }
    }
  }
  return contracts;
}
export function contractWage(contracts, workerId, siteId, date, fallback) {
  let matches = contracts.filter(c => c.workerId === workerId && c.siteId === siteId && c.dates.includes(date));
  if (!matches.length) return fallback;
  if (matches.some(c=>c.snapshot)) matches=matches.filter(c=>c.snapshot);
  const amounts = [...new Set(matches.map(c => Number(c.amount)))];
  return amounts.length === 1 && Number.isSafeInteger(amounts[0]) && amounts[0] >= 0 && amounts[0] <= 100000000 ? amounts[0] : null;
}
export async function attachAssignmentState(db, applications, jobs) {
  const accepted = applications.filter(a => a.status === 'accepted');
  const jobMap = new Map(jobs.map(j => [j.id,j]));
  for (let offset = 0; offset < accepted.length; offset += 100) {
    const batch = accepted.slice(offset,offset+100);
    const siteIds = [...new Set(batch.map(a => jobMap.get(a.job_id)?.site_id).filter(Boolean))];
    const userIds = [...new Set(batch.map(a => a.user_id))];
    const sites = siteIds.length ? await rows(db.from('sites').select('id,company_id,status,work_dates').in('id',siteIds).order('id')) : [];
    const workers = await rows(db.from('workers').select('id,company_id,user_id,is_active').in('user_id',userIds).order('id'));
    const daily = siteIds.length ? await rows(db.from('site_daily_assignments').select('id,site_id,company_id,worker_id,work_date').in('site_id',siteIds).order('id')) : [];
    for (const a of batch) {
      const job = jobMap.get(a.job_id);
      const site = sites.find(s => s.id === job?.site_id && s.company_id === job?.company_id);
      const own = new Set(workers.filter(w => w.user_id === a.user_id && w.company_id === job?.company_id && w.is_active === true).map(w => w.id));
      const dates = site && site.status !== 'cancelled' ? [...new Set(daily.filter(d => d.site_id === site.id && d.company_id === site.company_id && own.has(d.worker_id) && (!Array.isArray(site.work_dates) || site.work_dates.includes(d.work_date))).map(d => d.work_date))].sort() : [];
      const booked = job?.work_dates || [];
      a.assigned_dates = dates;
      a.has_site_access = dates.length > 0;
      a.assignment_status = !dates.length ? 'unassigned' : booked.length && booked.every(d => dates.includes(d)) ? 'assigned' : 'changed';
    }
  }
}
