import { rows } from './workerSiteAssignments.mjs';

// Called only with sites already authorized for this user and company.
export async function loadCalendarTeams(db, companyId, sites) {
  const result = new Map();
  for (let offset = 0; offset < sites.length; offset += 100) {
    const batch = sites.slice(offset, offset + 100);
    const siteIds = batch.map(site => site.site_id);
    const scope = (table, fields) => db.from(table).select(fields)
      .eq('company_id', companyId).in('site_id', siteIds).order('id');
    const [daily, legacy] = await Promise.all([
      rows(scope('site_daily_assignments', 'id,site_id,worker_id,work_date,role'), true),
      rows(scope('site_workers', 'id,site_id,worker_id,role')),
    ]);
    const selected = [];
    for (const site of batch) {
      const perDay = daily.filter(row => row.site_id === site.site_id);
      const allowed = Array.isArray(site.assigned_dates)
        ? new Set(site.assigned_dates.map(row => row.work_date))
        : null;
      // Explicit schedules use daily assignments even when the daily list is empty.
      const chosen = Array.isArray(site.work_dates) || perDay.length
        ? perDay.filter(row => !allowed || allowed.has(row.work_date))
        : legacy.filter(row => row.site_id === site.site_id);
      selected.push(...chosen);
    }
    const ids = [...new Set(selected.map(row => row.worker_id).filter(Boolean))];
    const people = [];
    for (let i = 0; i < ids.length; i += 100) {
      people.push(...await rows(db.from('workers').select('id,name')
        .eq('company_id', companyId).in('id', ids.slice(i, i + 100)).order('id')));
    }
    const names = new Map(people.map(person => [person.id, String(person.name || '').trim() || '이름 미등록']));
    for (const site of batch) {
      const seen = new Set();
      const team = [];
      for (const row of selected.filter(item => item.site_id === site.site_id)) {
        const key = (row.work_date || '') + ':' + row.worker_id;
        if (seen.has(key) || !names.has(row.worker_id)) continue;
        seen.add(key);
        team.push({work_date: row.work_date || null, name: names.get(row.worker_id), role: row.role});
      }
      team.sort((a,b) => (a.work_date || '').localeCompare(b.work_date || '') ||
        Number(b.role === 'leader') - Number(a.role === 'leader') || a.name.localeCompare(b.name, 'ko'));
      result.set(site.site_id, team);
    }
  }
  return result;
}
