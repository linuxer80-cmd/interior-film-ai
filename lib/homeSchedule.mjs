import { koreanDay, monthDays, siteStatus, workerMonth } from "../app/utils/workerCalendar.js";

export function homeSchedule(sites, month, worker = false) {
  const active = sites.filter(site => siteStatus(site) !== "cancelled");
  if (worker) return workerMonth(active, month);
  const calendar = monthDays(month);
  const byDay = new Map(calendar.days.map(day => [day, []]));
  for (const site of active) {
    const explicit = Array.isArray(site.work_dates)
      ? new Set(site.work_dates.filter(Boolean).map(koreanDay).filter(Boolean)) : null;
    const startValue = site.schedule_start || site.schedule_date;
    const start = startValue ? koreanDay(startValue) : null;
    const end = (site.schedule_end ? koreanDay(site.schedule_end) : null) || start;
    for (const day of calendar.days) {
      if (explicit ? explicit.has(day) : start && end >= start && day >= start && day <= end) byDay.get(day).push({ site });
    }
  }
  return { ...calendar, byDay };
}
