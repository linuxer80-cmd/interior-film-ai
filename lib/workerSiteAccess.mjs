// Service-role callers must pass the user ID returned by auth.getUser().
const deny = () => Object.assign(new Error('현재 로그인 계정에 배정된 현장만 이용할 수 있습니다.'), { status: 403 });
const take = result => {
  if (result.error) throw result.error;
  return result.data;
};
async function rows(query) {
  const data = [];
  for (let offset = 0; offset < 50000; offset += 500) {
    const page = take(await query.range(offset, offset + 499)) || [];
    data.push(...page);
    if (page.length < 500) return data;
  }
  throw new Error('현장 배정 조회 범위를 초과했습니다.');
}

export async function resolveWorkerSite(db, userId, siteId) {
  if (typeof siteId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)) throw deny();
  const profile = take(await db.from('profiles').select('is_active').eq('id', userId).maybeSingle());
  if (profile?.is_active === false) throw deny();
  const site = take(await db.from('sites')
    .select('id,company_id,site_name,customer_name,status,work_dates')
    .eq('id', siteId).maybeSingle());
  if (!site) throw deny();
  const company = take(await db.from('companies').select('id,is_active')
    .eq('id', site.company_id).maybeSingle());
  if (!company || company.is_active === false) throw deny();
  const workers = await rows(db.from('workers').select('id,company_id,name,phone,user_id,is_active')
    .eq('user_id', userId).eq('company_id', site.company_id).eq('is_active', true).order('id'));
  if (!workers.length) throw deny();
  const ids = new Set(workers.map(w => w.id));
  const scoped = table => db.from(table).select('*')
    .eq('company_id', site.company_id).eq('site_id', siteId).order('id');
  const [daily, legacy] = await Promise.all([
    rows(scoped('site_daily_assignments')),
    rows(scoped('site_workers')),
  ]);
  const explicit = Array.isArray(site.work_dates);
  const assignments = explicit || daily.length
    ? daily.filter(a => !explicit || site.work_dates.includes(a.work_date))
    : legacy;
  const mine = assignments.filter(a => ids.has(a.worker_id));
  if (!mine.length) throw deny();
  // A stale legacy team-leader row must not override current daily assignments.
  const assignment = mine.find(a => a.role === 'leader') || mine[0];
  return {
    site,
    worker: workers.find(w => w.id === assignment.worker_id),
    assignment,
    canSubmit: mine.some(a => a.role === 'leader') || !assignments.some(a => a.role === 'leader'),
  };
}
