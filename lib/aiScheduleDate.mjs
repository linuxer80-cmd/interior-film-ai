export function koreanToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (type) =>
    parts.find((part) => part.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function validAiDate(value) {
  if (
    typeof value !== "string" ||
    !/^20\d{2}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

// AI가 반환한 과거 일정은 연도를 임의로 바꾸지 않고
// 확인 대상으로 남깁니다.
// 관리자가 직접 입력하는 과거 날짜에는 적용하지 않습니다.
export function reviewAiSchedule(
  data,
  today = koreanToday()
) {
  const result = { ...data };

  const dates = Array.isArray(data.work_dates)
    ? data.work_dates
    : [data.date];

  const rejected = [
    ...new Set(
      dates.filter(
        (date) =>
          date &&
          (!validAiDate(date) || date < today)
      )
    ),
  ];

  const accepted = [
    ...new Set(
      dates.filter(
        (date) =>
          validAiDate(date) &&
          date >= today
      )
    ),
  ].sort();

  if (Array.isArray(data.work_dates)) {
    result.work_dates = accepted;
  }

  if (Object.hasOwn(data, "date")) {
    result.date = accepted[0] || "";

    if (!result.date) {
      result.start_time = "";
      result.end_time = "";
    }
  }

  if (rejected.length) {
    const warning =
      `AI 일정 확인 필요: ${rejected.join(", ")}은 ` +
      "과거 날짜이거나 올바르지 않은 날짜입니다. " +
      "자동 반영에서 제외했습니다. 원문과 연도를 확인한 뒤 " +
      "등록창에서 날짜를 직접 선택해주세요.";

    result.warnings = [
      ...new Set([
        ...(Array.isArray(data.warnings)
          ? data.warnings
          : []),
        warning,
      ]),
    ];

    result.memo = [data.memo, warning]
      .filter(Boolean)
      .join("\n");
  }

  return result;
}
