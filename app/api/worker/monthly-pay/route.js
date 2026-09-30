import { createClient } from "@supabase/supabase-js";
import { koreanDay } from "../../../utils/workerCalendar";
import { companyMonthPay, payMonth, sumPay } from "../../../utils/workerPay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
});

async function rows(query) {
  const result = [];
  for (let offset = 0; offset < 50000; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < 500) return result;
  }
  throw new Error("Too many pay records");
}

async function loadCompany(db, company, workerIds, month, today) {
  const own = (table, fields) => db.from(table).select(fields).eq("company_id", company.id).in("worker_id", workerIds).order("id");
  const [legacy, ownDaily, rates, allowanceRates] = await Promise.all([
    rows(own("site_workers", "id,site_id,worker_id,role")),
    rows(own("site_daily_assignments", "id,site_id,worker_id,work_date,role")),
    rows(own("worker_pay_rates", "id,company_id,worker_id,effective_from,daily_wage")),
    rows(db.from("company_leader_allowance_rates").select("company_id,effective_from,amount").eq("company_id", company.id).order("effective_from")),
  ]);
  const ids = [...new Set([...legacy, ...ownDaily].map((row) => row.site_id))];
  const sites = [], daily = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const completed = await rows(db.from("sites")
      .select("id,company_id,site_name,status,schedule_start,schedule_end,schedule_date")
      .eq("company_id", company.id).eq("status", "completed").in("id", batch).order("id"));
    sites.push(...completed);
    if (completed.length) daily.push(...await rows(db.from("site_daily_assignments")
      .select("id,site_id,worker_id,work_date,role").eq("company_id", company.id).in("site_id", completed.map((site) => site.id)).order("id")));
  }
  return companyMonthPay({ company, workerIds, sites, daily, legacy, rates, allowanceRates, month, today });
}

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return json({ error: "시공자 로그인이 필요합니다." }, 401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return json({ error: "서버 설정을 확인해주세요." }, 503);
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth?.user) return json({ error: "로그인이 만료되었습니다. 다시 로그인해주세요." }, 401);
    const today = koreanDay();
    const requestedMonth = new URL(request.url).searchParams.get("month");
    const month = requestedMonth === null ? today.slice(0, 7) : payMonth(requestedMonth);
    if (!month || month > today.slice(0, 7)) return json({ error: "조회할 월을 확인해주세요." }, 400);
    const [linked, profile] = await Promise.all([
      rows(db.from("workers").select("id,company_id").eq("user_id", auth.user.id).eq("is_active", true).order("id")),
      db.from("profiles").select("is_active").eq("id", auth.user.id).maybeSingle(),
    ]);
    if (profile.error) throw profile.error;
    if (profile.data?.is_active === false || !linked.length) return json({ error: "연결된 활성 시공자 계정이 없습니다." }, 403);
    const companies = (await rows(db.from("companies").select("id,company_name,is_active")
      .in("id", [...new Set(linked.map((worker) => worker.company_id))]).order("id"))).filter((company) => company.is_active !== false);
    if (!companies.length) return json({ error: "사용 가능한 소속 업체가 없습니다." }, 403);
    const groups = await Promise.all(companies.map((company) => loadCompany(db, company,
      linked.filter((worker) => worker.company_id === company.id).map((worker) => worker.id), month, today)));
    return json({ month, asOf: today, totals: sumPay(groups), companies: groups });
  } catch (error) {
    console.error("worker monthly-pay GET", error);
    return json({ error: "근무 금액을 불러오지 못했습니다. 잠시 후 다시 확인해주세요." }, 500);
  }
}
