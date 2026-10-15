import { syncSiteLifecycle } from "../../../../../lib/siteLifecycle.mjs";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });

export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return json({ error: "관리자 로그인이 필요합니다." }, 401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return json({ error: "서버 설정을 확인해주세요." }, 503);
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: authError } = await db.auth.getUser(token);
    if (authError || !userData?.user) return json({ error: "다시 로그인해주세요." }, 401);
    const { data: profile, error: profileError } = await db.from("profiles").select("company_id,role,is_active").eq("id", userData.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.company_id || profile.role !== "owner" || profile.is_active === false) return json({ error: "관리자 권한이 필요합니다." }, 403);
    const companyId = profile.company_id;
    const { data: company, error: companyError } = await db.from("companies").select("id,is_active").eq("id", companyId).maybeSingle();
    if (companyError) throw companyError;
    if (!company || company.is_active === false) return json({ error: "업체를 확인할 수 없습니다." }, 403);
    const result = await syncSiteLifecycle(db, { companyId });
    return json({ success: true, ...result });
  } catch (error) {
    console.error("admin site-status", error?.code || error?.message);
    return json({ error: "현장 상태를 저장하지 못했습니다. 다시 확인해주세요." }, 500);
  }
}

