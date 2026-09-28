import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const reply = (body, status = 200) => Response.json(body, { status });
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const localDay = (value) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : null;

async function context(request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return { error: "로그인이 필요합니다.", status: 401 };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: "서버 설정이 필요합니다.", status: 503 };
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return { error: "로그인이 만료되었습니다.", status: 401 };
  const { data: profile, error: profileError } = await db.from("profiles").select("company_id,role,is_active").eq("id", user.id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.company_id || profile.is_active === false) return { error: "업체 계정을 확인해주세요.", status: 403 };
  return { db, user, profile };
}

async function siteFor(db, companyId, siteId) {
  const { data, error } = await db.from("sites").select("id,schedule_start,schedule_end").eq("id", siteId).eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request) {
  try {
    const auth = await context(request);
    if (auth.error) return reply({ error: auth.error }, auth.status);
    const { db, user, profile } = auth;
    const siteId = new URL(request.url).searchParams.get("siteId");
    if (!siteId) return reply({ error: "현장을 선택해주세요." }, 400);
    const site = await siteFor(db, profile.company_id, siteId);
    if (!site) return reply({ error: "현장을 찾을 수 없습니다." }, 404);
    let workerId = null;
    if (profile.role !== "owner") {
      const { data: worker, error } = await db.from("workers").select("id").eq("company_id", profile.company_id).eq("user_id", user.id).eq("is_active", true).maybeSingle();
      if (error) throw error;
      if (!worker) return reply({ error: "시공자 계정이 아닙니다." }, 403);
      workerId = worker.id;
      const { data: assignment, error: assignmentError } = await db.from("site_workers").select("id").eq("site_id", siteId).eq("worker_id", workerId).maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assignment) return reply({ error: "배정된 현장이 아닙니다." }, 403);
    }
    const { count, error: countError } = await db.from("site_daily_assignments").select("id", { head: true, count: "exact" }).eq("site_id", siteId);
    if (countError?.code === "42P01") return reply({ assignments: [], hasDailySchedule: false, site });
    if (countError) throw countError;
    let query = db.from("site_daily_assignments").select("work_date,worker_id,role").eq("company_id", profile.company_id).eq("site_id", siteId).gte("work_date", localDay(site.schedule_start)).lte("work_date", localDay(site.schedule_end) || localDay(site.schedule_start)).order("work_date");
    if (workerId) query = query.eq("worker_id", workerId);
    const { data, error } = await query;
    if (error) throw error;
    return reply({ assignments: data || [], hasDailySchedule: count > 0, site });
  } catch (error) {
    console.error("daily assignments GET", error);
    return reply({ error: "날짜별 배정을 불러오지 못했습니다." }, 500);
  }
}

export async function POST(request) {
  try {
    const auth = await context(request);
    if (auth.error) return reply({ error: auth.error }, auth.status);
    const { db, profile } = auth;
    if (profile.role !== "owner") return reply({ error: "관리자 권한이 필요합니다." }, 403);
    const { siteId, days } = await request.json();
    if (!siteId || !Array.isArray(days) || days.length < 1 || days.length > 366) return reply({ error: "날짜별 배정을 확인해주세요." }, 400);
    const site = await siteFor(db, profile.company_id, siteId);
    if (!site) return reply({ error: "현장을 찾을 수 없습니다." }, 404);
    const start = localDay(site.schedule_start);
    const end = localDay(site.schedule_end) || start;
    const uniqueDays = new Set();
    const rows = [];
    for (const day of days) {
      const date = day.workDate;
      if (!datePattern.test(date || "") || date < start || date > end || uniqueDays.has(date) || !Array.isArray(day.memberIds) || day.memberIds.length > 100) return reply({ error: "현장 기간과 날짜별 담당자를 확인해주세요." }, 400);
      uniqueDays.add(date);
      const members = [...new Set(day.memberIds.filter(Boolean))].filter((id) => id !== day.leaderId);
      for (const workerId of [day.leaderId, ...members].filter(Boolean)) rows.push({ company_id: profile.company_id, site_id: siteId, work_date: date, worker_id: workerId, role: workerId === day.leaderId ? "leader" : "member" });
    }
    const ids = [...new Set(rows.map((row) => row.worker_id))];
    if (ids.length) {
      const { data: workers, error } = await db.from("workers").select("id").eq("company_id", profile.company_id).eq("is_active", true).in("id", ids);
      if (error) throw error;
      if (workers.length !== ids.length) return reply({ error: "다른 업체 또는 비활성 시공자가 포함되어 있습니다." }, 400);
    }
    const { error: saveError } = await db.rpc("replace_site_daily_assignments", {
      p_company_id: profile.company_id, p_site_id: siteId, p_rows: rows,
    });
    if (saveError?.code === "42883" || saveError?.code === "42P01") return reply({ error: "날짜별 배정 SQL을 먼저 적용해주세요." }, 503);
    if (saveError) throw saveError;
    return reply({ success: true });
  } catch (error) {
    console.error("daily assignments POST", error);
    return reply({ error: "날짜별 배정을 저장하지 못했습니다." }, 500);
  }
}
