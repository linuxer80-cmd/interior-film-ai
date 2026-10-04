import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
async function handle(request) {
  try {
    const token = (request.headers.get("authorization") || "").match(/^Bearer (.+)$/i)?.[1];
    if (!token) return json({ error: "관리자 로그인이 필요합니다." }, 401);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "서버 설정을 확인해주세요." }, 503);
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return json({ error: "로그인이 만료되었습니다." }, 401);
    const { data: profile, error: profileError } = await db.from("profiles").select("company_id,role,is_active").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.company_id || profile.role !== "owner" || profile.is_active === false) return json({ error: "관리자 권한이 필요합니다." }, 403);
    const { data: company, error: companyError } = await db.from("companies").select("id,is_active").eq("id", profile.company_id).maybeSingle();
    if (companyError) throw companyError;
    if (!company || company.is_active === false) return json({ error: "업체를 확인할 수 없습니다." }, 403);
    let body;
    try { body = await request.json(); } catch { return json({ error: "입력 형식을 확인해주세요." }, 400); }
    if (!uuid(body?.siteId) || (request.method !== "POST" && !uuid(body?.id))) return json({ error: "현장과 자재를 확인해주세요." }, 400);
    const { data: site, error: siteError } = await db.from("sites").select("id").eq("id", body.siteId).eq("company_id", profile.company_id).maybeSingle();
    if (siteError) throw siteError;
    if (!site) return json({ error: "현장을 찾을 수 없습니다." }, 404);
    let values;
    if (request.method !== "DELETE") {
      const text = (key, limit) => typeof body[key] === "string" ? body[key].trim().slice(0, limit) : "";
      const quantity = Number(body.quantity), unitPrice = Number(body.unit_price);
      if (!(text("product_code", 100) || text("product_name", 200)) || body.quantity === "" || body.quantity == null || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000 || body.unit_price === "" || body.unit_price == null || !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 100000000 || !Number.isSafeInteger(Math.round(quantity * unitPrice))) return json({ error: "제품명 또는 코드를 입력하고 사용량과 단가를 확인해주세요." }, 400);
      values = { brand: text("brand", 100), product_code: text("product_code", 100), product_name: text("product_name", 200), quantity, unit: text("unit", 20) || "m", unit_price: unitPrice, total_price: Math.round(quantity * unitPrice), memo: text("memo", 1000), updated_at: new Date().toISOString() };
    }
    let query;
    if (request.method === "POST") query = db.from("site_materials").insert({ ...values, company_id: profile.company_id, site_id: site.id, material_type: "actual", created_by: user.id });
    else {
      query = request.method === "PATCH" ? db.from("site_materials").update(values) : db.from("site_materials").delete();
      query = query.eq("id", body.id).eq("site_id", site.id).eq("company_id", profile.company_id).eq("material_type", "actual");
    }
    const { data, error } = await query.select("id").maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: "자재가 삭제되었거나 찾을 수 없습니다. 새로고침해주세요." }, 404);
    return json({ success: true });
  } catch (error) {
    console.error("관리자 실제 자재 저장 실패:", error);
    return json({ error: "자재를 저장하지 못했습니다. 잠시 후 다시 시도해주세요." }, 500);
  }
}
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
