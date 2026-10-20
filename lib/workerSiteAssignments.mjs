import { nextSiteStatus } from "./siteLifecycle.mjs";

export const siteFields = [
  "id",
  "company_id",
  "site_name",
  "customer_name",
  "customer_phone",
  "status",
  "schedule_start",
  "schedule_end",
  "work_dates",
  "region",
  "address",
  "address_detail",
  "work_type",
  "work_description",
].join(",");

export async function rows(query, optionalDailyTable = false) {
  const result = [];

  for (let offset = 0; offset < 50000; offset += 500) {
    const { data, error } = await query.range(
      offset,
      offset + 499
    );

    if (
      optionalDailyTable &&
      ["42P01", "PGRST205"].includes(error?.code)
    ) {
      return [];
    }

    if (error) throw error;

    result.push(...(data || []));

    if (!data || data.length < 500) return result;
  }

  throw new Error("배정 자료가 너무 많습니다.");
}

export function localDay(value) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
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

export async function companySites(
  db,
  companyId,
  workerIds,
  requestedSiteId,
  includeMemo = false
) {
  const ownIds = new Set(workerIds);

  const scoped = (table, fields) => {
    let query = db
      .from(table)
      .select(fields)
      .eq("company_id", companyId)
      .in("worker_id", workerIds)
      .order("id");

    if (requestedSiteId) {
      query = query.eq("site_id", requestedSiteId);
    }

    return query;
  };

  const [legacy, ownDaily] = await Promise.all([
    rows(
      scoped(
        "site_workers",
        "id,site_id,worker_id,role"
      )
    ),
    rows(
      scoped(
        "site_daily_assignments",
        "id,site_id,worker_id,work_date,role"
      ),
      true
    ),
  ]);

  const ids = [
    ...new Set(
      [...legacy, ...ownDaily].map(
        (item) => item.site_id
      )
    ),
  ];

  const result = [];

  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);

    const [sites, daily] = await Promise.all([
      rows(
        db
          .from("sites")
          .select(
            (requestedSiteId || includeMemo)
              ? `${siteFields},memo`
              : siteFields
          )
          .eq("company_id", companyId)
          .in("id", batch)
          .order("id")
      ),
      rows(
        db
          .from("site_daily_assignments")
          .select(
            "id,site_id,worker_id,work_date,role"
          )
          .eq("company_id", companyId)
          .in("site_id", batch)
          .order("id"),
        true
      ),
    ]);

    for (const site of sites) {
      const allDates = daily.filter(
        (item) => item.site_id === site.id
      );

      const explicit = Array.isArray(site.work_dates);

      const allowed = explicit
        ? new Set(site.work_dates)
        : null;

      const myDates = allDates.filter(
        (item) =>
          ownIds.has(item.worker_id) &&
          (!allowed || allowed.has(item.work_date))
      );

      const myLegacy = legacy.filter(
        (item) => item.site_id === site.id
      );

      if (explicit && !myDates.length) continue;
      if (allDates.length && !myDates.length) continue;
      if (!myDates.length && !myLegacy.length) continue;

      const byDate = new Map();

      for (const day of myDates) {
        const previous = byDate.get(day.work_date);

        if (!previous || day.role === "leader") {
          byDate.set(day.work_date, {
            work_date: day.work_date,
            role: day.role,
          });
        }
      }

      const dates = [...byDate.values()].sort(
        (a, b) =>
          a.work_date.localeCompare(b.work_date)
      );

      const role = (
        dates.length ? dates : myLegacy
      ).some((row) => row.role === "leader")
        ? "leader"
        : "member";

      const start = localDay(site.schedule_start);
      const end = localDay(site.schedule_end) || start;

      const scheduleNotice = dates.some(
        (day) =>
          (start && day.work_date < start) ||
          (end && day.work_date > end)
      )
        ? "현장 기간과 내 배정 날짜가 다릅니다. 관리자에게 작업 날짜를 확인해주세요."
        : null;

      result.push({
        ...site,
        status: nextSiteStatus(site),
        work_dates: explicit
          ? dates.map((day) => day.work_date)
          : null,
        site_id: site.id,
        worker_id: (myDates.find(day => day.role === "leader") || myDates[0] || myLegacy.find(item => item.role === "leader") || myLegacy[0]).worker_id,
        site_status: nextSiteStatus(site),
        worker_role: role,
        my_role: role,
        ...(dates.length
          ? {
              assigned_dates: dates,
              schedule_start: dates[0].work_date,
              schedule_end:
                dates[dates.length - 1].work_date,
            }
          : {}),
        schedule_notice: scheduleNotice,
      });
    }
  }

  return result;
}

