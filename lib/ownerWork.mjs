export const ownerWorkDefaults = {
  mode: "manage",
  include_labor: false,
  daily_wage: 0,
};
export function koreaDay(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function scheduledOn(site, day = koreaDay()) {
  if (Array.isArray(site.work_dates)) return site.work_dates.includes(day);
  const start = site.schedule_start && koreaDay(site.schedule_start);
  const end = site.schedule_end ? koreaDay(site.schedule_end) : start;
  return Boolean(start && day >= start && day <= end);
}
export function isOwnerParticipant(settings, site, override) {
  if (
    ["consulting", "cancelled"].includes(site.status) ||
    settings.mode === "manage"
  )
    return false;
  return override
    ? override.participating === true
    : settings.mode === "solo" &&
        ["scheduled", "in_progress"].includes(site.status);
}
export function ownerWorkSettings(body) {
  if (
    !["solo", "mixed", "manage"].includes(body.mode) ||
    typeof body.include_labor !== "boolean" ||
    typeof body.daily_wage !== "number" ||
    !Number.isSafeInteger(body.daily_wage) ||
    body.daily_wage < 0 ||
    body.daily_wage > 10000000
  ) {
    throw Object.assign(Error("운영 방식과 대표 일당을 확인해주세요."), {
      status: 400,
    });
  }
  return {
    mode: body.mode,
    include_labor: body.include_labor,
    daily_wage: body.daily_wage,
  };
}
export const ownerWorkSchemaMissing = (error) =>
  ["42P01", "PGRST205"].includes(error?.code);
export async function ownerWorkRows(query) {
  const rows = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    const result = await query.range(offset, offset + 499);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
    if ((result.data || []).length < 500) return rows;
  }
  throw Error("조회 범위를 초과했습니다. 관리자에게 문의해주세요.");
}
