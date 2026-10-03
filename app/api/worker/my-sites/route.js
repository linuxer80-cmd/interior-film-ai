import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });

const siteFields = [
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

async function rows(query, optionalDailyTable = false) {
  const result = [];

  for (let offset = 0; offset < 50000; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);

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

function localDay(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

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

async function companySites(
  db,
  companyId,
  workerIds,
  requestedSiteId
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
    rows(scoped("site_workers", "id,site_id,worker_id,role")),
    rows(
      scoped(
        "site_daily_assignments",
        "id,site_id,worker_id,work_date,role"
      ),
      true
    ),
  ]);

  const ids = [
    ...new Set([...legacy, ...ownDaily].map((item) => item.site_id)),
  ];

  const result = [];

  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);

    const [sites, daily] = await Promise.all([
      rows(
        db
          .from("sites")
          .select(siteFields)
          .eq("company_id", companyId)
          .in("id", batch)
          .order("id")
      ),
      rows(
        db
          .from("site_daily_assignments")
          .select("id,site_id,worker_id,work_date,role")
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
      const allowed = explicit ? new Set(site.work_dates) : null;

      const myDates = allDates.filter(
        (item) =>
          ownIds.has(item.worker_id) &&
          (!allowed || allowed.has(item.work_date))
      );

      const myLegacy = legacy.filter(
        (item) => item.site_id === site.id
      );

      // 여러 날짜 방식에서는 실제 날짜별 배정이 반드시 있어야 합니다.
      if (explicit && !myDates.length) continue;

      // 날짜별 배정이 있으면 오래된 현장별 배정으로 접근하지 못합니다.
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

      const dates = [...byDate.values()].sort((a, b) =>
        a.work_date.localeCompare(b.work_date)
      );

      const role = (dates.length ? dates : myLegacy).some(
        (row) => row.role === "leader"
      )
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
        // 다른 시공자의 날짜는 응답에 포함하지 않습니다.
        work_dates: explicit
          ? dates.map((day) => day.work_date)
          : null,
        site_id: site.id,
        site_status: site.status,
        worker_role: role,
        my_role: role,
        ...(dates.length
          ? {
              assigned_dates: dates,
              schedule_start: dates[0].work_date,
              schedule_end: dates[dates.length - 1].work_date,
            }
          : {}),
        schedule_notice: scheduleNotice,
      });
    }
  }

  return result;
}

export async function GET(request) {
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];

    if (!token) {
      return json({ error: "시공자 로그인이 필요합니다." }, 401);
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return json({ error: "서버 설정을 확인해주세요." }, 503);
    }

    const db = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: auth, error: authError } =
      await db.auth.getUser(token);

    if (authError || !auth?.user) {
      return json(
        { error: "로그인이 만료되었습니다. 다시 로그인해주세요." },
        401
      );
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");

    if (siteId !== null && !uuid.test(siteId)) {
      return json({ error: "현장 주소를 확인해주세요." }, 400);
    }

    // 로그인 계정에 실제 연결된 시공자 ID만 사용합니다.
    const [linked, profileResult] = await Promise.all([
      rows(
        db
          .from("workers")
          .select("id,company_id,name,phone,is_active")
          .eq("user_id", auth.user.id)
          .eq("is_active", true)
          .order("id")
      ),
      db
        .from("profiles")
        .select("is_active")
        .eq("id", auth.user.id)
        .maybeSingle(),
    ]);

    if (profileResult.error) throw profileResult.error;

    if (
      profileResult.data?.is_active === false ||
      !linked.length
    ) {
      return json(
        {
          error:
            "연결된 활성 시공자 계정이 없습니다. 회사 관리자에게 계정 연결을 확인해주세요.",
        },
        403
      );
    }

    const companies = await rows(
      db
        .from("companies")
        .select("id,is_active")
        .in(
          "id",
          [...new Set(linked.map((worker) => worker.company_id))]
        )
        .order("id")
    );

    const activeCompanies = new Set(
      companies
        .filter((company) => company.is_active !== false)
        .map((company) => company.id)
    );

    const workers = linked.filter((worker) =>
      activeCompanies.has(worker.company_id)
    );

    if (!workers.length) {
      return json(
        { error: "사용 가능한 소속 업체가 없습니다." },
        403
      );
    }

    const first = workers[0];

    const worker = {
      worker_id: first.id,
      worker_name: first.name,
      worker_phone: first.phone,
      worker_is_active: true,
    };

    if (searchParams.get("profileOnly") === "1" && !siteId) {
      return json({ worker });
    }

    const sites = (
      await Promise.all(
        [...activeCompanies].map((companyId) =>
          companySites(
            db,
            companyId,
            workers
              .filter((item) => item.company_id === companyId)
              .map((item) => item.id),
            siteId
          )
        )
      )
    )
      .flat()
      .sort((a, b) =>
        (a.schedule_start || "9999").localeCompare(
          b.schedule_start || "9999"
        )
      );

    if (!siteId) {
      return json({ worker, sites });
    }

    const site = sites.find((item) => item.site_id === siteId);

    if (!site) {
      return json(
        {
          error:
            "현재 로그인 계정에 배정된 현장이 아닙니다. 배정이 변경되었거나 다른 계정으로 로그인했는지 관리자에게 확인해주세요.",
        },
        404
      );
    }

    // 예정 자재만 반환하며 가격·수익 정보는 제외합니다.
    let materials = [];
    let materialsError = null;

    try {
      materials = (
        await rows(
          db
            .from("site_materials")
            .select(
              "id,brand,product_code,product_name,quantity,unit,memo"
            )
            .eq("company_id", site.company_id)
            .eq("site_id", siteId)
            .eq("material_type", "planned")
            .order("id")
        )
      ).map(({ id, ...material }) => ({
        ...material,
        material_id: id,
      }));
    } catch (error) {
      console.error("시공자 예정 자재 조회 오류:", error);
      materialsError =
        "예정 자재를 불러오지 못했습니다. 다시 확인해주세요.";
    }

    return json({
      worker,
      site,
      materials,
      materialsError,
    });
  } catch (error) {
    console.error("시공자 현장 조회 오류:", error);

    return json(
      {
        error:
          "배정 현장을 불러오지 못했습니다. 잠시 후 다시 확인해주세요.",
      },
      500
    );
  }
}
