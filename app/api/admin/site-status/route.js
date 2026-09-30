import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const statuses = new Set(["consulting", "scheduled", "in_progress", "completed", "cancelled"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });

export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return json({ error: "관리자 로그인이 필요합니다." }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: "요청 내용을 확인해주세요." }, 400); }
    const { siteId, status, expectedStatus } = body || {};
    if (!uuid.test(siteId || "") || !statuses.has(status) || !statuses.has(expectedStatus)) {
      return json({ error: "현장과 상태를 확인해주세요." }, 400);
    }
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
    const { data: site, error: siteError } = await db.from("sites").select("id,status,updated_at").eq("company_id", companyId).eq("id", siteId).maybeSingle();
    if (siteError) throw siteError;
    if (!site) return json({ error: "현장을 찾을 수 없습니다." }, 404);
    if (site.status === status) return json({ success: true, site });
    if (site.status !== expectedStatus) return json({ error: "현장 상태가 변경되었습니다. 현장 목록을 새로고침한 후 다시 확인해주세요." }, 409);

    // Completion changes only the site. It must never create, approve or erase a report.
    const { data: updated, error: updateError } = await db.from("sites")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("company_id", companyId).eq("id", siteId).eq("status", expectedStatus)
      .select("id,status,updated_at").maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return json({ error: "현장 상태가 변경되었습니다. 현장 목록을 새로고침한 후 다시 확인해주세요." }, 409);
    return json({ success: true, site: updated });
  } catch (error) {
    console.error("admin site-status", error?.code || error?.message);
    return json({ error: "현장 상태를 저장하지 못했습니다. 다시 확인해주세요." }, 500);
  }
}
