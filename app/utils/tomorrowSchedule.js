import { koreanDay, workerMonth, siteStatus } from "./workerCalendar.js";

export function tomorrowDay(now = new Date()) {
  const today = koreanDay(now);
  return new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

export function worksOn(site, date, daily = []) {
  if (!["scheduled", "in_progress"].includes(siteStatus(site))) return false;
  if (Array.isArray(site.work_dates)) return site.work_dates.includes(date);
  const rows = daily.filter(row => row.site_id === site.id);
  if (rows.length) return rows.some(row => row.work_date === date);
  const start = koreanDay(site.schedule_start || site.schedule_date);
  const end = koreanDay(site.schedule_end || start);
  return Boolean(start && end && start <= date && date <= end);
}

export function personalTomorrow(sites, date) {
  return (workerMonth(
    sites.filter(site => ["scheduled", "in_progress"].includes(siteStatus(site))),
    date.slice(0, 7)
  ).byDay.get(date) || [])
    .map(({ site, role }) => ({ ...site, tomorrow_role: role }));
}

export function teamForDay(site, date, daily, legacy, workers) {
  const rows = daily.filter(row =>
    row.site_id === site.id && row.company_id === site.company_id
  );
  const assigned = Array.isArray(site.work_dates) || rows.length
    ? rows.filter(row => row.work_date === date)
    : legacy.filter(row =>
        row.site_id === site.id && row.company_id === site.company_id
      );
  const result = new Map();
  for (const row of assigned) {
    const worker = workers.find(w =>
      w.id === row.worker_id &&
      w.company_id === site.company_id &&
      w.is_active !== false
    );
    if (worker && (!result.has(worker.id) || row.role === "leader")) {
      result.set(worker.id, {
        id: worker.id,
        name: worker.name,
        role: row.role === "leader" ? "leader" : "member"
      });
    }
  }
  return [...result.values()];
}
