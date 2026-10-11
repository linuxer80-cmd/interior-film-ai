export const publicProfileFields =
  "user_id,name,age,daily_wage,region,skills,experience_years,introduction,available_dates,seeking,published,photo_path,updated_at";

export const dayInKorea = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });

function text(value, max, required = false) {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  ) {
    throw fail("입력 내용을 확인해주세요.");
  }
  return value.trim();
}

function integer(value, min, max) {
  if (
    value === "" ||
    value === null ||
    typeof value === "boolean"
  ) {
    throw fail("숫자를 입력해주세요.");
  }

  const n = Number(value);

  if (!Number.isInteger(n) || n < min || n > max) {
    throw fail(`숫자는 ${min}~${max} 범위로 입력해주세요.`);
  }

  return n;
}

export function validDay(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

function skills(value) {
  if (!Array.isArray(value) || value.length > 15) {
    throw fail("전문 분야는 15개까지 입력해주세요.");
  }
  return [...new Set(value.map(v => text(v, 40, true)))];
}

export function cleanProfile(body) {
  if (
    typeof body.published !== "boolean" ||
    typeof body.seeking !== "boolean"
  ) {
    throw fail("공개 설정을 확인해주세요.");
  }

  if (
    !Array.isArray(body.available_dates) ||
    body.available_dates.length > 90 ||
    body.available_dates.some(d => !validDay(d))
  ) {
    throw fail("가능한 날짜를 확인해주세요.");
  }

  const result = {
    name: text(body.name, 60, true),
    age:
      body.age === "" || body.age === null
        ? null
        : integer(body.age, 18, 100),
    daily_wage: integer(body.daily_wage, 0, 2000000),
    region: text(body.region, 100),
    skills: skills(body.skills),
    experience_years: integer(body.experience_years, 0, 70),
    introduction: text(body.introduction, 1500),
    available_dates: [...new Set(body.available_dates)].sort(),
    published: body.published,
    seeking: body.seeking,
  };

  if (
    result.seeking &&
    (
      !result.published ||
      !result.region ||
      !result.daily_wage ||
      !result.skills.length ||
      !result.available_dates.some(d => d >= dayInKorea())
    )
  ) {
    throw fail(
      "구직 공개에는 지역·희망 일당·전문 분야·앞으로 가능한 날짜가 필요합니다."
    );
  }

  return result;
}

export function cleanJob(body) {
  if (body.publish_address !== true) {
    throw fail("현장 주소 공개에 동의해주세요.");
  }

  if (
    !validDay(body.work_date) ||
    !validDay(body.end_date) ||
    body.work_date < dayInKorea() ||
    body.end_date < body.work_date
  ) {
    throw fail("오늘 이후의 작업 날짜를 확인해주세요.");
  }

  return {
    title: text(body.title, 100, true),
    region: text(body.region, 100, true),
    address: text(body.address, 300, true),
    work_content: text(body.work_content, 2000, true),
    work_date: body.work_date,
    end_date: body.end_date,
    daily_wage: integer(body.daily_wage, 1, 2000000),
    headcount: integer(body.headcount, 1, 100),
    skills: skills(body.skills),
    min_experience: integer(body.min_experience, 0, 70),
  };
}

export function nextApplication(current, action, manager) {
  if (
    manager &&
    action === "invite" &&
    (!current || ["withdrawn", "rejected"].includes(current))
  ) {
    return "invited";
  }

  if (
    !manager &&
    action === "apply" &&
    (!current || ["invited", "withdrawn"].includes(current))
  ) {
    return "applied";
  }

  if (
    !manager &&
    action === "withdraw" &&
    ["invited", "applied", "accepted"].includes(current)
  ) {
    return "withdrawn";
  }

  if (manager && action === "accept" && current === "applied") {
    return "accepted";
  }

  if (
    manager &&
    action === "reject" &&
    ["invited", "applied"].includes(current)
  ) {
    return "rejected";
  }

  throw fail("현재 상태에서는 처리할 수 없습니다.", 409);
}
