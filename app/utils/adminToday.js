import { koreanDay } from "./workerCalendar.js";

const activeStatuses = new Set(["scheduled", "in_progress"]);
const day = (value) => value ? koreanDay(value) : null;
const bySite = (rows) => {
  const result = new Map();
  for (const row of rows) {
    if (!result.has(row.site_id)) result.set(row.site_id, []);
    result.get(row.site_id).push(row);
  }
  return result;
};
const time = (row) => Date.parse(row.updated_at || row.created_at || "") || 0;

export function buildAdminToday({ sites = [], reports = [], assignments = [], daily = [], workers = [] }, today = koreanDay()) {
  const latest = new Map();
  for (const report of reports) {
    const previous = latest.get(report.site_id);
    if (!previous || time(report) > time(previous) || (time(report) === time(previous) && report.id > previous.id)) latest.set(report.site_id, report);
  }
  const activeWorkers = new Set(workers.filter((w) => w.is_active !== false).map((w) => w.id));
  const legacyBySite = bySite(assignments);
  const dailyBySite = bySite(daily);
  const tasks = [], todaySites = [];
  for (const site of sites) {
    if (site.status === "cancelled") continue;
    const start = day(site.schedule_start) || day(site.schedule_date);
    const end = day(site.schedule_end) || start;
    const validRange = start && end >= start;
    const allDaily = dailyBySite.get(site.id) || [];
    const dated = allDaily.filter((d) => validRange && d.work_date >= start && d.work_date <= end);
    const validTeam = (rows) => rows.filter((a) => activeWorkers.has(a.worker_id));
    const legacy = validTeam(legacyBySite.get(site.id) || []);
    const base = { siteId: site.id, name: site.site_name || site.customer_name || "이름 없는 현장", region: site.region || "", workType: site.work_type || "", start, end };
    const report = latest.get(site.id);
    const reviewStatus = report && (report.review_status || "pending");

    if (site.status === "completed" && !report) {
      tasks.push({ ...base, id: `${site.id}:missing`, kind: "missing", date: day(site.updated_at) || end,
        section: "report-write", reason: "시공은 완료되었지만 완료보고가 없습니다. 보고서를 작성하거나 팀장의 제출을 확인해주세요." });
    }

    if (reviewStatus === "pending" || reviewStatus === "rejected") {
      tasks.push({ ...base, id: `${site.id}:report`, kind: reviewStatus === "pending" ? "review" : "revision",
        date: day(report.updated_at || report.created_at), section: "report",
        reason: reviewStatus === "pending" ? "등록된 완료보고를 검수해주세요." : "시공자에게 요청한 보완 진행 상황을 확인해주세요." });
    }
    if (!activeStatuses.has(site.status)) continue;

    const todayTeam = allDaily.length ? validTeam(dated.filter((d) => d.work_date === today)) : legacy;
    const worksToday = allDaily.length ? dated.some((d) => d.work_date === today) : validRange && start <= today && end >= today;
    if (worksToday) todaySites.push({ ...base, status: site.status, workerCount: new Set(todayTeam.map((a) => a.worker_id)).size,
      hasLeader: todayTeam.some((a) => a.role === "leader") });

    // A submitted/reviewed report means the work has already reached reporting.
    // Do not ask to assign a crew again for that same job.
    if (report) continue;
    let reason = "", date = start;
    if (!validRange) reason = "시공 일정을 먼저 확인해주세요.";
    else if (allDaily.length) {
      // Explicit daily schedules are authoritative: gaps can be non-working days.
      const days = [...new Set(dated.map((d) => d.work_date))].filter((d) => d >= today).sort();
      const missing = days.find((day) => !validTeam(dated.filter((d) => d.work_date === day)).some((a) => a.role === "leader"));
      if (missing) { date = missing; reason = `${missing.slice(5).replace("-", "/")} 작업일의 책임 팀장을 배정해주세요.`; }
      else if (!dated.length) reason = "변경된 시공 일정에 맞춰 날짜별 배정을 확인해주세요.";
    } else if (!legacy.length) reason = "담당 시공자가 배정되지 않았습니다.";
    else if (!legacy.some((a) => a.role === "leader")) reason = "책임 팀장이 배정되지 않았습니다.";
    if (reason) tasks.push({ ...base, id: `${site.id}:assignment`, kind: "assignment", date, section: validRange ? "assignment" : "schedule", reason,
      overdue: Boolean(validRange && end < today) });
  }
  const rank = (task) => task.kind === "assignment" && task.date && task.date <= today ? 0 : task.kind === "review" ? 1 : task.kind === "missing" ? 2 : task.kind === "assignment" ? 3 : 4;
  tasks.sort((a, b) => rank(a) - rank(b) || (a.date || "9999").localeCompare(b.date || "9999") || a.id.localeCompare(b.id));
  todaySites.sort((a, b) => a.name.localeCompare(b.name, "ko") || a.siteId.localeCompare(b.siteId));
  return { today, counts: { assignment: tasks.filter((t) => t.kind === "assignment").length,
    review: tasks.filter((t) => t.kind === "review").length, revision: tasks.filter((t) => t.kind === "revision").length,
    missing: tasks.filter((t) => t.kind === "missing").length }, tasks, todaySites };
}
