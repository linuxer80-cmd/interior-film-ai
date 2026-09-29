const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const dayMs = 86400000;

export function koreanDay(value = new Date()) {
  if (!value) return null;
  if (typeof value === "string" && dayPattern.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function shiftMonth(month, amount) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + amount, 1)).toISOString().slice(0, 7);
}

export function monthDays(month) {
  const first = `${month}-01`;
  const next = `${shiftMonth(month, 1)}-01`;
  const count = Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / dayMs);
  const days = Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const leading = new Date(`${first}T00:00:00Z`).getUTCDay();
  const cells = [...Array(leading).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  return { days, cells };
}

export function siteStatus(site) {
  return site.site_status || site.status || "scheduled";
}

export function personalDays(site) {
  // Presence of the array is authoritative, including an empty array. Never
  // fill gaps between personal assignments with another worker's dates.
  if (!Array.isArray(site.assigned_dates)) return null;
  const byDay = new Map();
  for (const row of site.assigned_dates) {
    const date = koreanDay(row.work_date);
    if (date && (!byDay.has(date) || row.role === "leader")) byDay.set(date, row.role === "leader" ? "leader" : "member");
  }
  return byDay;
}

function legacyRange(site) {
  const start = koreanDay(site.schedule_start);
  const end = koreanDay(site.schedule_end) || start;
  return start && end >= start ? { start, end } : null;
}

export function isUndated(site) {
  return !Array.isArray(site.assigned_dates) && !legacyRange(site);
}

export function workerMonth(sites, month) {
  const { days, cells } = monthDays(month);
  const byDay = new Map(days.map((day) => [day, []]));
  const siteIds = new Set();
  for (const site of sites) {
    const personal = personalDays(site);
    const range = personal === null ? legacyRange(site) : null;
    for (const day of days) {
      const role = personal !== null ? personal.get(day)
        : range && day >= range.start && day <= range.end ? (site.worker_role || site.my_role || "member") : null;
      if (!role || !site.site_id) continue;
      const entries = byDay.get(day);
      if (entries.some((entry) => entry.site.site_id === site.site_id)) continue;
      entries.push({ site, role });
      siteIds.add(site.site_id);
    }
  }
  return { cells, byDay, siteCount: siteIds.size, workDays: [...byDay.values()].filter((entries) => entries.length).length };
}

export function nextWorkDay(sites, from) {
  let next = null;
  for (const site of sites) {
    const personal = personalDays(site);
    const range = personal === null ? legacyRange(site) : null;
    const candidates = personal !== null ? [...personal.keys()] : range && range.end >= from ? [range.start < from ? from : range.start] : [];
    for (const date of candidates) if (date >= from && (!next || date < next)) next = date;
  }
  return next;
}
