import { createClient } from "@supabase/supabase-js";
import { GET as mySites } from "../worker/my-sites/route";
import {
  tomorrowDay,
  worksOn,
  personalTomorrow,
  teamForDay
} from "../../utils/tomorrowSchedule.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: {
    "Cache-Control": "private, no-store",
    Vary: "Authorization"
  }
});

async function rows(query) {
  const result = [];
  for (let offset = 0; offset < 50000; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < 500) return result;
  }
  throw Error("일정 조회 범위를 초과했습니다.");
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];

    if (!token) return json({ error: "로그인이 필요합니다." }, 401);

    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return json({ error: "서버 설정을 확인해주세요." }, 503);
    }

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: { user }, error } = await db.auth.getUser(token);
    if (error || !user) {
      return json({ error: "다시 로그인해주세요." }, 401);
    }

    const role = new URL(request.url).searchParams.get("role") || "worker";
    if (!["owner", "worker"].includes(role)) {
      return json({ error: "화면 구분을 확인해주세요." }, 400);
    }

    const date = tomorrowDay();
    let sites, daily = [], legacy = [], workers = [];

    if (role === "owner") {
      const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("company_id,role,is_active")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (
        !profile?.company_id ||
        profile.role !== "owner" ||
        profile.is_active === false
      ) {
        return json({ error: "관리자 권한이 필요합니다." }, 403);
      }

      const { data: company, error: companyError } = await db
        .from("companies")
        .select("is_active")
        .eq("id", profile.company_id)
        .maybeSingle();

      if (companyError) throw companyError;
      if (company?.is_active !== true) {
        return json({ error: "활성 업체만 이용할 수 있습니다." }, 403);
      }

      [sites, daily, legacy, workers] = await Promise.all([
        rows(db.from("sites")
          .select("id,company_id,site_name,address,address_detail,work_description,work_type,status,work_dates,schedule_start,schedule_end,schedule_date")
          .eq("company_id", profile.company_id)
          .in("status", ["scheduled", "in_progress"])
          .order("id")),
        rows(db.from("site_daily_assignments")
          .select("id,company_id,site_id,worker_id,role,work_date")
          .eq("company_id", profile.company_id)
          .order("id")),
        rows(db.from("site_workers")
          .select("id,company_id,site_id,worker_id,role")
          .eq("company_id", profile.company_id)
          .order("id")),
        rows(db.from("workers")
          .select("id,company_id,name,is_active")
          .eq("company_id", profile.company_id)
          .order("id"))
      ]);

      sites = sites.filter(site => worksOn(site, date, daily));
    } else {
      // 기존 시공자 권한 및 개인별 배정 조회를 재사용합니다.
      // 외부에서 전달된 siteId/profileOnly는 전달하지 않습니다.
      const cleanRequest = new Request(
        new URL("/api/worker/my-sites", request.url),
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const response = await mySites(cleanRequest);
      if (!response.ok) {
        return json(await response.json(), response.status);
      }

      const data = await response.json();
      sites = personalTomorrow(data.sites || [], date);
    }

    const materials = [];

    for (let offset = 0; offset < sites.length; offset += 100) {
      const batch = sites.slice(offset, offset + 100);
      const companies = [...new Set(batch.map(site => site.company_id))];
      const ids = batch.map(site => site.id || site.site_id);

      const queries = [
        rows(db.from("site_materials")
          .select("id,company_id,site_id,brand,product_code,product_name,unit,memo")
          .in("company_id", companies)
          .in("site_id", ids)
          .eq("material_type", "planned")
          .order("id"))
      ];

      if (role === "worker") {
        queries.push(
          rows(db.from("site_daily_assignments")
            .select("id,company_id,site_id,worker_id,role,work_date")
            .in("company_id", companies)
            .in("site_id", ids)
            .order("id")),
          rows(db.from("site_workers")
            .select("id,company_id,site_id,worker_id,role")
            .in("company_id", companies)
            .in("site_id", ids)
            .order("id"))
        );
      }

      const [films, days = [], old = []] = await Promise.all(queries);
      materials.push(...films);
      daily.push(...days);
      legacy.push(...old);
    }

    if (role === "worker") {
      const ids = [...new Set([...daily, ...legacy].map(row => row.worker_id))];
      const companies = [...new Set(sites.map(site => site.company_id))];

      for (let offset = 0; offset < ids.length; offset += 100) {
        workers.push(...await rows(db.from("workers")
          .select("id,company_id,name,is_active")
          .in("company_id", companies)
          .in("id", ids.slice(offset, offset + 100))
          .order("id")));
      }
    }

    return json({
      date,
      updatedAt: new Date().toISOString(),
      sites: sites.map(site => ({
        id: site.id || site.site_id,
        name: site.site_name || "현장",
        address: [site.address, site.address_detail].filter(Boolean).join(" "),
        work: site.work_description || site.work_type || "",
        role: site.tomorrow_role || null,
        team: teamForDay(site, date, daily, legacy, workers),
        materials: materials
          .filter(m =>
            m.site_id === (site.id || site.site_id) &&
            m.company_id === site.company_id
          )
          .map(m => ({
            id: m.id,
            brand: m.brand,
            code: m.product_code,
            name: m.product_name,
            memo: m.memo
          }))
      })).sort((a, b) => a.name.localeCompare(b.name, "ko"))
    });
  } catch (error) {
    console.error("tomorrow-tasks", error.code || error.message);
    return json({
      error: "내일 일정을 불러오지 못했습니다. 다시 확인해주세요."
    }, 500);
  }
}
