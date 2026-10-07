import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

async function all(query) {
  const result = [];

  for (let offset = 0; offset < 20000; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
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

  if (!token) throw Error("로그인이 필요합니다.");

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data, error } = await db.auth.getUser(token);

  if (error || !data.user) {
    throw Error("다시 로그인해주세요.");
  }

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("company_id,role,is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (profile?.is_active === false) {
    throw Error("비활성 계정입니다.");
  }

  const owner =
    profile?.role === "owner" && profile.is_active === true;

  let worker = null;

  if (!owner) {
    const result = await db
      .from("workers")
      .select("id,company_id,name")
      .eq("user_id", data.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (result.error) throw result.error;
    worker = result.data;
  }

  const companyId = owner
    ? profile.company_id
    : worker?.company_id;

  if (!companyId) {
    throw Error("등록된 관리자 또는 시공자 계정이 필요합니다.");
  }

  const company = await db
    .from("companies")
    .select("is_active")
    .eq("id", companyId)
    .maybeSingle();

  if (company.error || !company.data?.is_active) {
    throw Error("업체 사용 상태를 확인해주세요.");
  }

  return {
    db,
    userId: data.user.id,
    companyId,
    owner,
    worker,
  };
}

export async function GET(request) {
  try {
    const access = await auth(request);
    const params = new URL(request.url).searchParams;
    const mode = params.get("mode");

    let worker = access.worker;

    if (mode !== "admin" && access.owner) {
      const result = await access.db
        .from("workers")
        .select("id,company_id,name")
        .eq("user_id", access.userId)
        .eq("company_id", access.companyId)
        .eq("is_active", true)
        .maybeSingle();

      if (result.error) throw result.error;
      worker = result.data;
    }

    if (mode === "admin" && !access.owner) {
      return json({ error: "관리자 권한이 필요합니다." }, 403);
    }

    if (mode !== "admin" && !worker) {
      return json(
        { error: "시공자 계정 연결이 필요합니다." },
        403,
      );
    }

    const month =
      params.get("month") || new Date().toISOString().slice(0, 7);

    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
      return json({ error: "월을 확인해주세요." }, 400);
    }

    const end = new Date(
      Date.UTC(
        Number(month.slice(0, 4)),
        Number(month.slice(5)),
        1,
      ),
    )
      .toISOString()
      .slice(0, 10);

    let query = access.db
      .from("attendance_records")
      .select("*")
      .eq("company_id", access.companyId)
      .gte("work_day", `${month}-01`)
      .lt("work_day", end)
      .order("clock_in", { ascending: false })
      .order("id");

    if (mode !== "admin") {
      query = query.eq("worker_id", worker.id);
    }

    let sites = await all(
      access.db
        .from("sites")
        .select(
          "id,site_name,address,status,schedule_start,schedule_end,work_dates",
        )
        .eq("company_id", access.companyId)
        .neq("status", "cancelled")
        .order("id"),
    );

    const records = await all(query);

    if (mode !== "admin") {
      const [daily, assigned, open] = await Promise.all([
        all(
          access.db
            .from("site_daily_assignments")
            .select("site_id")
            .eq("company_id", access.companyId)
            .eq("worker_id", worker.id)
            .order("id"),
        ),
        all(
          access.db
            .from("site_workers")
            .select("site_id")
            .eq("company_id", access.companyId)
            .eq("worker_id", worker.id)
            .order("id"),
        ),
        access.db
          .from("attendance_records")
          .select("*")
          .eq("company_id", access.companyId)
          .eq("worker_id", worker.id)
          .is("clock_out", null)
          .maybeSingle(),
      ]);

      if (open.error) throw open.error;

      if (
        open.data &&
        !records.some((record) => record.id === open.data.id)
      ) {
        records.unshift(open.data);
      }

      const allowed = new Set(
        [...daily, ...assigned].map((row) => row.site_id),
      );

      sites = sites.filter((site) => allowed.has(site.id));
    }

    const [settings, locations, workers] = await Promise.all([
      access.db
        .from("attendance_settings")
        .select("*")
        .eq("company_id", access.companyId)
        .maybeSingle(),

      mode === "admin"
        ? all(
            access.db
              .from("attendance_locations")
              .select("*")
              .eq("company_id", access.companyId)
              .order("site_id"),
          )
        : [],

      mode === "admin"
        ? all(
            access.db
              .from("workers")
              .select("id,name")
              .eq("company_id", access.companyId)
              .order("id"),
          )
        : [worker],
    ]);

    if (settings.error) throw settings.error;

    return json({
      sites,
      records,
      settings: settings.data,
      locations,
      workers,
    });
  } catch (error) {
    console.error("attendance GET", error.code || error.message);

    return json(
      { error: error.message || "출퇴근 내역 조회 실패" },
      400,
    );
  }
}

export async function POST(request) {
  try {
    const access = await auth(request);
    const body = await request.json();

    if (body.action === "geocode") {
      if (!access.owner) {
        return json({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const site = await access.db
        .from("sites")
        .select("address")
        .eq("id", body.siteId)
        .eq("company_id", access.companyId)
        .maybeSingle();

      if (site.error) throw site.error;

      if (!site.data?.address) {
        throw Error("현장 주소를 먼저 입력해주세요.");
      }

      if (!process.env.KAKAO_REST_API_KEY) {
        throw Error(
          "주소 검색에는 서버의 KAKAO_REST_API_KEY 설정이 필요합니다. 현장에서 현재 위치 등록도 가능합니다.",
        );
      }

      const response = await fetch(
        `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(
          site.data.address,
        )}`,
        {
          headers: {
            Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}`,
          },
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        throw Error("주소 좌표 검색에 실패했습니다.");
      }

      const result = await response.json();

      return json({
        candidates: (result.documents || []).map((item) => ({
          address:
            item.road_address?.address_name || item.address_name,
          latitude: Number(item.y),
          longitude: Number(item.x),
        })),
      });
    }

    if (
      !["in", "out", "settings", "location", "review"].includes(
        body.action,
      )
    ) {
      return json({ error: "요청을 확인해주세요." }, 400);
    }

    const result = await access.db.rpc("attendance_action", {
      p_user: access.userId,
      p_action: body.action,
      p_body: body,
    });

    if (result.error) throw result.error;
    return json(result.data);
  } catch (error) {
    console.error("attendance POST", error.code || error.message);

    return json(
      { error: error.message || "출퇴근 처리 실패" },
      400,
    );
  }
      }
