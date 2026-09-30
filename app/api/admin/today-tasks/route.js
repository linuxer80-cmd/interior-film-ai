import { createClient } from "@supabase/supabase-js";
import { buildAdminToday } from "../../../utils/adminToday.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });

async function allRows(query) {
  const rows = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
  throw new Error("오늘 할 일 조회 범위를 초과했습니다.");
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return json({ error: "관리자 로그인이 필요합니다." }, 401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return json({ error: "서버 설정을 확인해주세요." }, 503);
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: authError } = await db.auth.getUser(token);
    if (authError || !userData?.user) return json({ error: "로그인이 만료되었습니다. 다시 로그인해주세요." }, 401);
    const { data: profile, error: profileError } = await db.from("profiles").select("company_id,role,is_active").eq("id", userData.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.company_id || profile.role !== "owner" || profile.is_active === false) return json({ error: "관리자 권한이 필요합니다." }, 403);
    const companyId = profile.company_id;
    const { data: company, error: companyError } = await db.from("companies").select("id,is_active").eq("id", companyId).maybeSingle();
    if (companyError) throw companyError;
    if (!company || company.is_active === false) return json({ error: "업체를 확인할 수 없습니다." }, 403);
    const [sites, reports, assignments, daily, workers] = await Promise.all([
      allRows(db.from("sites").select("id,site_name,customer_name,status,schedule_start,schedule_end,schedule_date,region,work_type,updated_at").eq("company_id", companyId).order("id")),
      allRows(db.from("work_reports").select("id,site_id,review_status,updated_at,created_at").eq("company_id", companyId).order("id")),
      allRows(db.from("site_workers").select("id,site_id,worker_id,role").eq("company_id", companyId).order("id")),
      allRows(db.from("site_daily_assignments").select("id,site_id,worker_id,role,work_date").eq("company_id", companyId).order("id")),
      allRows(db.from("workers").select("id,is_active").eq("company_id", companyId).order("id")),
    ]);
    return json({ ...buildAdminToday({ sites, reports, assignments, daily, workers }), updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("admin today-tasks", error?.code || error?.message);
    return json({ error: "오늘 할 일을 불러오지 못했습니다. 다시 확인해주세요." }, 500);
  }
}
