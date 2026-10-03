const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const dayMs = 86400000;

export function koreanDay(value = new Date()) {
  if (!value) return null;

  if (typeof value === "string" && dayPattern.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);

    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    )
      ? value
      : null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) =>
    parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function shiftMonth(month, amount) {
  const [year, number] = month.split("-").map(Number);

  return new Date(
    Date.UTC(year, number - 1 + amount, 1)
  )
    .toISOString()
    .slice(0, 7);
}

export function monthDays(month) {
  const first = `${month}-01`;
  const next = `${shiftMonth(month, 1)}-01`;

  const count = Math.round(
    (
      Date.parse(`${next}T00:00:00Z`) -
      Date.parse(`${first}T00:00:00Z`)
    ) / dayMs
  );

  const days = Array.from(
    { length: count },
    (_, index) =>
      `${month}-${String(index + 1).padStart(2, "0")}`
  );

  const leading = new Date(
    `${first}T00:00:00Z`
  ).getUTCDay();

  const cells = [
    ...Array(leading).fill(null),
    ...days,
  ];

  while (cells.length % 7) {
    cells.push(null);
  }

  return { days, cells };
}

export function siteStatus(site) {
  return site.site_status || site.status || "scheduled";
}

export function personalDays(site) {
  if (!Array.isArray(site.assigned_dates)) {
    // 여러 날짜 방식은 본인 배정 정보가 없으면 표시하지 않습니다.
    // 현장 전체 날짜를 본인의 작업 날짜로 추측하지 않습니다.
    return Array.isArray(site.work_dates)
      ? new Map()
      : null;
  }

  const byDay = new Map();

  for (const row of site.assigned_dates) {
    const date = koreanDay(row.work_date);

    if (
      date &&
      (!byDay.has(date) || row.role === "leader")
    ) {
      byDay.set(
        date,
        row.role === "leader" ? "leader" : "member"
      );
    }
  }

  // 빈 배열도 확정된 배정 정보로 처리합니다.
  return byDay;
}

function legacyRange(site) {
  const start = koreanDay(site.schedule_start);
  const end = koreanDay(site.schedule_end) || start;

  return start && end >= start
    ? { start, end }
    : null;
}

export function isUndated(site) {
  return (
    !Array.isArray(site.assigned_dates) &&
    !Array.isArray(site.work_dates) &&
    !legacyRange(site)
  );
}

export function workerMonth(sites, month) {
  const { days, cells } = monthDays(month);
  const byDay = new Map(
    days.map((day) => [day, []])
  );
  const siteIds = new Set();

  for (const site of sites) {
    const personal = personalDays(site);
    const range =
      personal === null ? legacyRange(site) : null;

    for (const day of days) {
      const role =
        personal !== null
          ? personal.get(day)
          : range && day >= range.start && day <= range.end
            ? site.worker_role || site.my_role || "member"
            : null;

      if (!role || !site.site_id) continue;

      const entries = byDay.get(day);

      if (
        entries.some(
          (entry) => entry.site.site_id === site.site_id
        )
      ) {
        continue;
      }

      entries.push({ site, role });
      siteIds.add(site.site_id);
    }
  }

  return {
    cells,
    byDay,
    siteCount: siteIds.size,
    workDays: [...byDay.values()].filter(
      (entries) => entries.length
    ).length,
  };
}

export function nextWorkDay(sites, from) {
  let next = null;

  for (const site of sites) {
    const personal = personalDays(site);
    const range =
      personal === null ? legacyRange(site) : null;

    const candidates =
      personal !== null
        ? [...personal.keys()]
        : range && range.end >= from
          ? [range.start < from ? from : range.start]
          : [];

    for (const date of candidates) {
      if (
        date >= from &&
        (!next || date < next)
      ) {
        next = date;
      }
    }
  }

  return next;
}
