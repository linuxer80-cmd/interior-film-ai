import { createClient } from "@supabase/supabase-js";
import { koreanDay } from "../../../utils/workerCalendar";
import { payAmount, payDate } from "../../../utils/workerPay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fields = "amount,effective_from,version";
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });

async function ownerContext(request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { response: json({ error: "관리자 로그인이 필요합니다." }, 401) };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { response: json({ error: "서버 설정을 확인해주세요." }, 503) };
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth?.user) return { response: json({ error: "다시 로그인해주세요." }, 401) };
  const { data: profile, error: profileError } = await db.from("profiles").select("company_id,role,is_active").eq("id", auth.user.id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.company_id || profile.role !== "owner" || profile.is_active !== true) return { response: json({ error: "관리자 권한이 필요합니다." }, 403) };
  const { data: company, error: companyError } = await db.from("companies").select("id,is_active").eq("id", profile.company_id).maybeSingle();
  if (companyError) throw companyError;
  if (!company || company.is_active !== true) return { response: json({ error: "업체를 확인할 수 없습니다." }, 403) };
  return { db, companyId: company.id };
}

export async function GET(request) {
  try {
    const { db, companyId, response } = await ownerContext(request);
    if (response) return response;
    const { data, error } = await db.from("company_leader_allowances").select(fields).eq("company_id", companyId).maybeSingle();
    if (error) throw error;
    return json({ setting: data || { amount: 0, effective_from: null, version: null } });
  } catch (error) {
    console.error("leader allowance GET", error?.code || error?.message);
    return json({ error: "팀장비용 설정을 불러오지 못했습니다." }, 500);
  }
}

export async function POST(request) {
  try {
    const { db, companyId, response } = await ownerContext(request);
    if (response) return response;
    let body;
    try { body = await request.json(); } catch { return json({ error: "요청 내용을 확인해주세요." }, 400); }
    const amount = payAmount(body?.amount), effectiveFrom = payDate(body?.effective_from);
    const version = body?.version;
    if (amount === null || !effectiveFrom || effectiveFrom < "2000-01-01" || effectiveFrom > koreanDay() ||
      (version !== null && (!Number.isSafeInteger(version) || version < 0))) {
      return json({ error: "팀장비용과 적용일을 확인해주세요." }, 400);
    }
    const patch = { amount, effective_from: effectiveFrom };
    // A concurrent settings change must not silently overwrite the new amount.
    const query = version === null
      ? db.from("company_leader_allowances").insert({ company_id: companyId, ...patch })
      : db.from("company_leader_allowances").update(patch).eq("company_id", companyId).eq("version", version);
    const { data, error } = await query.select(fields).maybeSingle();
    if (error?.code === "23505" || (!error && !data)) return json({ error: "설정이 변경되었습니다. 다시 불러온 뒤 저장해주세요." }, 409);
    if (error?.code === "P0001") return json({ error: "적용일은 이전 설정의 적용일 이후부터 오늘 사이로 지정해주세요." }, 400);
    if (error) throw error;
    return json({ setting: data });
  } catch (error) {
    console.error("leader allowance POST", error?.code || error?.message);
    return json({ error: "팀장비용을 저장하지 못했습니다. 다시 확인해주세요." }, 500);
  }
}
