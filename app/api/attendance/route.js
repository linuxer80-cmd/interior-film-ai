import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });

async function all(query) {
  const result = [];

  for (let i = 0; i < 20000; i += 500) {
    const { data, error } = await query.range(
      i,
      i + 499
    );

    if (error) throw error;

    result.push(...data);

    if (data.length < 500) return result;
  }

  throw Error("조회 범위를 줄여주세요.");
}

async function auth(request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];

  if (!token) {
    throw Error("로그인이 필요합니다.");
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const { data, error } =
    await db.auth.getUser(token);

  if (error || !data.user) {
    throw Error("다시 로그인해주세요.");
  }

  const {
    data: profile,
    error: profileError,
  } = await db
    .from("profiles")
    .select("company_id,role,is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  if (profile?.is_active === false) {
    throw Error("비활성 계정입니다.");
  }

  const owner =
    profile?.role === "owner" &&
    profile.is_active === true;

  const linked = await all(
    db
      .from("workers")
      .select("id,company_id,name")
      .eq("user_id", data.user.id)
      .eq("is_active", true)
      .order("id")
  );

  const ids = [
    ...new Set(
      linked.map(worker => worker.company_id)
    ),
  ];

  const companies = ids.length
    ? await all(
        db
          .from("companies")
          .select("id,company_name,is_active")
          .in("id", ids)
          .eq("is_active", true)
          .order("id")
      )
    : [];

  const workers = linked.filter(worker =>
    companies.some(company =>
      company.id === worker.company_id
    )
  );

  let companyId = owner
    ? profile.company_id
    : null;

  if (companyId) {
    const company = await db
      .from("companies")
      .select("is_active")
      .eq("id", companyId)
      .maybeSingle();

    if (company.error) throw company.error;

    if (!company.data?.is_active) {
      companyId = null;
    }
  }

  return {
    db,
    userId: data.user.id,
    companyId,
    owner: owner && Boolean(companyId),
    workers,
    companies,
  };
}

async function workerRecords(a, month, end) {
  const groups = await Promise.all(
    a.companies.map(async company => {
      const workerIds = a.workers
        .filter(worker =>
          worker.company_id === company.id
        )
        .map(worker => worker.id);

      const records = await all(
        a.db
          .from("attendance_records")
          .select("*")
          .eq("company_id", company.id)
          .in("worker_id", workerIds)
          .gte("work_day", `${month}-01`)
          .lt("work_day", end)
          .order("clock_in", {
            ascending: false,
          })
          .order("id")
      );

      // 지난달 출근했지만 아직 퇴근하지 않은 기록도 표시합니다.
      const open = await all(
        a.db
          .from("attendance_records")
          .select("*")
          .eq("company_id", company.id)
          .in("worker_id", workerIds)
          .is("clock_out", null)
          .order("id")
      );

      for (const record of open) {
        if (
          !records.some(item =>
            item.id === record.id
          )
        ) {
          records.push(record);
        }
      }

      const eligible = await a.db.rpc(
        "attendance_today_sites",
        {
          p_user: a.userId,
          p_company: company.id,
        }
      );

      if (eligible.error) {
        throw eligible.error;
      }

      const allowed = new Set(
        (eligible.data || []).map(site => site.id)
      );

      const siteIds = [
        ...new Set([
          ...allowed,
          ...records.map(record => record.site_id),
        ]),
      ];

      const sites = siteIds.length
        ? await all(
            a.db
              .from("sites")
              .select(
                "id,site_name,address,status,schedule_start,schedule_end,work_dates"
              )
              .eq("company_id", company.id)
              .in("id", siteIds)
              .order("id")
          )
        : [];

      return {
        records: records.map(record => ({
          ...record,
          company_name: company.company_name,
        })),

        sites: sites.map(site => ({
          ...site,
          company_id: company.id,
          company_name: company.company_name,

          site_name:
            `${company.company_name || "업체"} · ` +
            `${site.site_name || "현장"}`,

          canClockIn: allowed.has(site.id),
        })),
      };
    })
  );

  return json({
    sites: groups.flatMap(group => group.sites),

    records: groups
      .flatMap(group => group.records)
      .sort((a, b) =>
        String(b.clock_in).localeCompare(
          String(a.clock_in)
        )
      ),

    settings: null,
    locations: [],
    workers: a.workers,
    companies: a.companies,
  });
}

export async function GET(request) {
  try {
    const a = await auth(request);
    const params = new URL(
      request.url
    ).searchParams;

    const mode = params.get("mode");

    if (mode === "admin" && !a.owner) {
      return json(
        { error: "관리자 권한이 필요합니다." },
        403
      );
    }

    const month =
      params.get("month") ||
      new Date().toISOString().slice(0, 7);

    if (
      !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)
    ) {
      return json(
        { error: "월을 확인해주세요." },
        400
      );
    }

    const end = new Date(
      Date.UTC(
        Number(month.slice(0, 4)),
        Number(month.slice(5)),
        1
      )
    )
      .toISOString()
      .slice(0, 10);

    // 관리자 계정이라도 시공자 화면에서는 본인의 전체 업체 기록을 조회합니다.
    if (mode !== "admin") {
      return await workerRecords(a, month, end);
    }

    const worker = null;

    let query = a.db
      .from("attendance_records")
      .select("*")
      .eq("company_id", a.companyId)
      .gte("work_day", `${month}-01`)
      .lt("work_day", end)
      .order("clock_in", {
        ascending: false,
      })
      .order("id");

    let sites = await all(
      a.db
        .from("sites")
        .select(
          "id,site_name,address,status,schedule_start,schedule_end,work_dates"
        )
        .eq("company_id", a.companyId)
        .neq("status", "cancelled")
        .order("id")
    );

    const records = await all(query);

    const [settings, locations, workers] =
      await Promise.all([
        a.db
          .from("attendance_settings")
          .select("*")
          .eq("company_id", a.companyId)
          .maybeSingle(),

        mode === "admin"
          ? all(
              a.db
                .from("attendance_locations")
                .select("*")
                .eq("company_id", a.companyId)
                .order("site_id")
            )
          : [],

        mode === "admin"
          ? all(
              a.db
                .from("workers")
                .select("id,name")
                .eq("company_id", a.companyId)
                .order("id")
            )
          : [worker],
      ]);

    if (settings.error) {
      throw settings.error;
    }

    return json({
      sites,
      records,
      settings: settings.data,
      locations,
      workers,
    });
  } catch (error) {
    console.error(
      "attendance GET",
      error.code || error.message
    );

    return json(
      {
        error:
          error.message ||
          "출퇴근 내역 조회 실패",
      },
      400
    );
  }
}

async function prepareLocation(a, siteId) {
  const site = await a.db
    .from("sites")
    .select("id,address")
    .eq("id", siteId)
    .eq("company_id", a.companyId)
    .neq("status", "cancelled")
    .maybeSingle();

  if (site.error) throw site.error;

  if (!site.data?.address?.trim()) {
    return "현장정보에 주소가 없어 위치를 비교하지 못했습니다.";
  }
