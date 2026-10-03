import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validDay(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function localDay(value) {
  if (!value) return null;
  if (validDay(value)) return value;

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

function siteDates(site) {
  if (Array.isArray(site.work_dates)) {
    return [...new Set(site.work_dates.filter(validDay))].sort();
  }

  // 기존 현장은 시작일·종료일 방식과 호환합니다.
  const first = localDay(site.schedule_start);
  const last = localDay(site.schedule_end) || first;

  if (!first || last < first) return [];

  const days = [];
  const cursor = new Date(`${first}T00:00:00Z`);

  while (days.length < 366) {
    const date = cursor.toISOString().slice(0, 10);
    if (date > last) break;

    days.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

async function context(request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];

  if (!token) {
    return { error: "로그인이 필요합니다.", status: 401 };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return { error: "서버 설정을 확인해주세요.", status: 503 };
  }

  const db = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await db.auth.getUser(token);

  if (error || !data?.user) {
    return {
      error: "로그인이 만료되었습니다. 다시 로그인해주세요.",
      status: 401,
    };
  }

  const user = data.user;

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("company_id,role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  if (!profile?.company_id || profile.is_active !== true) {
    return {
      error: "활성 업체 계정을 확인해주세요.",
      status: 403,
    };
  }

  const { data: company, error: companyError } = await db
    .from("companies")
    .select("id,is_active")
    .eq("id", profile.company_id)
    .maybeSingle();

  if (companyError) throw companyError;

  if (!company || company.is_active !== true) {
    return {
      error: "이용 가능한 업체가 아닙니다.",
      status: 403,
    };
  }

  return { db, user, profile };
}

async function siteFor(db, companyId, siteId) {
  const { data, error } = await db
    .from("sites")
    .select(
      "id,company_id,status,schedule_start,schedule_end,work_dates"
    )
    .eq("id", siteId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function readAssignments(
  db,
  companyId,
  siteId,
  workerIds = null
) {
  const rows = [];

  for (let offset = 0; ; offset += 500) {
    let query = db
      .from("site_daily_assignments")
      .select("id,work_date,worker_id,role")
      .eq("company_id", companyId)
      .eq("site_id", siteId)
      .order("work_date")
      .order("id")
      .range(offset, offset + 499);

    if (workerIds) {
      query = query.in("worker_id", workerIds);
    }

    const { data, error } = await query;

    if (error) throw error;

    rows.push(...(data || []));

    if (!data || data.length < 500) return rows;

    if (rows.length >= 50000) {
      throw new Error("배정 자료가 너무 많습니다.");
    }
  }
}

export async function GET(request) {
  try {
    const auth = await context(request);

    if (auth.error) {
      return reply({ error: auth.error }, auth.status);
    }

    const { db, user, profile } = auth;
    const siteId = new URL(request.url).searchParams.get("siteId");

    if (!uuidPattern.test(siteId || "")) {
      return reply({ error: "올바른 현장을 선택해주세요." }, 400);
    }

    const site = await siteFor(db, profile.company_id, siteId);

    if (!site) {
      return reply({ error: "현장을 찾을 수 없습니다." }, 404);
    }

    const dates = siteDates(site);
    const allowed = new Set(dates);

    let workerIds = null;

    if (profile.role !== "owner") {
      const { data: workers, error } = await db
        .from("workers")
        .select("id")
        .eq("company_id", profile.company_id)
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (error) throw error;

      workerIds = (workers || []).map((worker) => worker.id);

      if (!workerIds.length) {
        return reply({ error: "시공자 계정이 아닙니다." }, 403);
      }
    }

    const assignments = (
      await readAssignments(
        db,
        profile.company_id,
        siteId,
        workerIds
      )
    ).filter((row) => allowed.has(row.work_date));

    if (workerIds) {
      if (!assignments.length) {
        if (Array.isArray(site.work_dates)) {
          return reply(
            { error: "배정된 시공 날짜가 없습니다." },
            403
          );
        }

        const { count, error } = await db
          .from("site_daily_assignments")
          .select("id", { head: true, count: "exact" })
          .eq("company_id", profile.company_id)
          .eq("site_id", siteId);

        if (error) throw error;

        if (count > 0) {
          return reply(
            { error: "배정된 시공 날짜가 없습니다." },
            403
          );
        }

        const legacy = await db
          .from("site_workers")
          .select("id")
          .eq("company_id", profile.company_id)
          .eq("site_id", siteId)
          .in("worker_id", workerIds)
          .limit(1);

        if (legacy.error) throw legacy.error;

        if (!legacy.data?.length) {
          return reply({ error: "배정된 현장이 아닙니다." }, 403);
        }

        return reply({
          success: true,
          assignments: [],
          hasDailySchedule: false,
          site: { id: siteId },
          dates,
        });
      }

      const personalDates = [
        ...new Set(assignments.map((row) => row.work_date)),
      ].sort();

      return reply({
        success: true,
        assignments,
        hasDailySchedule: true,
        site: { id: siteId },
        dates: personalDates,
      });
    }

    return reply({
      success: true,
      assignments,
      hasDailySchedule:
        Array.isArray(site.work_dates) || assignments.length > 0,
      site,
      dates,
    });
  } catch (error) {
    console.error("날짜별 배정 조회 오류:", error);

    return reply(
      { error: "날짜별 배정을 불러오지 못했습니다." },
      500
    );
  }
}

export async function POST(request) {
  try {
    const auth = await context(request);

    if (auth.error) {
      return reply({ error: auth.error }, auth.status);
    }

    const { db, profile } = auth;

    if (profile.role !== "owner") {
      return reply({ error: "관리자 권한이 필요합니다." }, 403);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return reply(
        { error: "배정 요청 형식이 올바르지 않습니다." },
        400
      );
    }

    const { siteId, days } = body || {};

    if (
      !uuidPattern.test(siteId || "") ||
      !Array.isArray(days) ||
      days.length < 1 ||
      days.length > 366
    ) {
      return reply({ error: "날짜별 배정을 확인해주세요." }, 400);
    }

    const site = await siteFor(db, profile.company_id, siteId);

    if (!site) {
      return reply({ error: "현장을 찾을 수 없습니다." }, 404);
    }

    if (
      ["completed", "cancelled", "canceled"].includes(site.status)
    ) {
      return reply(
        {
          error:
            "완료되거나 취소된 현장은 배정을 변경할 수 없습니다.",
        },
        409
      );
    }

    const dates = siteDates(site);
    const allowed = new Set(dates);
    const uniqueDays = new Set();
    const rows = [];

    if (!dates.length || days.length !== dates.length) {
      return reply(
        {
          error:
            "시공 일정이 변경되었습니다. 현장을 다시 열고 배정해주세요.",
        },
        409
      );
    }

    for (const day of days) {
      if (
        !day ||
        typeof day !== "object" ||
        !validDay(day.workDate) ||
        !allowed.has(day.workDate) ||
        uniqueDays.has(day.workDate) ||
        !Array.isArray(day.memberIds) ||
        day.memberIds.length > 100
      ) {
        return reply(
          {
            error:
              "선택한 시공 날짜와 날짜별 담당자를 확인해주세요.",
          },
          400
        );
      }

      const leaderId = day.leaderId || "";

      if (
        (leaderId && !uuidPattern.test(leaderId)) ||
        day.memberIds.some(
          (id) =>
            typeof id !== "string" || !uuidPattern.test(id)
        )
      ) {
        return reply(
          { error: "시공자 정보가 올바르지 않습니다." },
          400
        );
      }

      uniqueDays.add(day.workDate);

      const members = [...new Set(day.memberIds)].filter(
        (id) => id !== leaderId
      );

      for (const workerId of [leaderId, ...members].filter(Boolean)) {
        rows.push({
          company_id: profile.company_id,
          site_id: siteId,
          work_date: day.workDate,
          worker_id: workerId,
          role: workerId === leaderId ? "leader" : "member",
        });
      }
    }

    const ids = [...new Set(rows.map((row) => row.worker_id))];

    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100);

      const { data: workers, error } = await db
        .from("workers")
        .select("id")
        .eq("company_id", profile.company_id)
        .eq("is_active", true)
        .in("id", batch);

      if (error) throw error;

      if (workers.length !== batch.length) {
        return reply(
          {
            error:
              "다른 업체 또는 비활성 시공자가 포함되어 있습니다.",
          },
          400
        );
      }
    }

    const { error } = await db.rpc("replace_site_daily_assignments", {
      p_company_id: profile.company_id,
      p_site_id: siteId,
      p_rows: rows,
    });

    if (error) {
      if (
        ["PGRST202", "42883", "42P01"].includes(error.code)
      ) {
        return reply(
          { error: "날짜별 배정 SQL을 먼저 적용해주세요." },
          503
        );
      }

      if (error.code === "P0001" || error.code === "23505") {
        return reply(
          {
            error:
              "일정 또는 담당자가 변경되었습니다. 현장을 다시 열고 배정해주세요.",
          },
          409
        );
      }

      throw error;
    }

    return reply({ success: true });
  } catch (error) {
    console.error("날짜별 배정 저장 오류:", error);

    return reply(
      { error: "날짜별 배정을 저장하지 못했습니다." },
      500
    );
  }
}
