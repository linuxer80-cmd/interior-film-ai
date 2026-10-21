import { sameFilmProduct } from "../../../../lib/hyundaiFilmCode";
import { normalizeFilmBrand } from "../../../../lib/filmBrand.mjs";
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
      values = { brand: normalizeFilmBrand(text("brand", 100)), product_code: text("product_code", 100), product_name: text("product_name", 200), quantity, unit: text("unit", 20) || "m", unit_price: unitPrice, total_price: Math.round(quantity * unitPrice), memo: text("memo", 1000), updated_at: new Date().toISOString() };
    }
    let query;
    if (request.method === "POST") query = db.from("site_materials").insert({ ...values, company_id: profile.company_id, site_id: site.id, material_type: "actual", created_by: user.id });
    else {
      query = request.method === "PATCH" ? db.from("site_materials").update(values) : db.from("site_materials").delete();
      query = query.eq("id", body.id).eq("site_id", site.id).eq("company_id", profile.company_id).eq("material_type", "actual");
    }
    const { data, error } = await query.select("id").maybeSingle();
    if (error) {
      if (request.method === "PATCH" && ((error.code === "P0001" && String(error.message).includes("반출·반입 관리 현장")) || (error.code === "22023" && String(error.message).includes("롤별 반입량과 입고단가")))) {
        const originalResult=await db.from("site_materials").select("id,brand,product_code,product_name,quantity,unit,memo,updated_at").eq("id",body.id).eq("site_id",site.id).eq("company_id",profile.company_id).eq("material_type","actual").maybeSingle();
        if(originalResult.error)throw originalResult.error;
        const original=originalResult.data;
        if(!original)return json({error:"자재가 변경됐습니다. 새로고침해주세요."},409);
        const sameProduct=sameFilmProduct(original.brand,original.product_code,body.brand,body.product_code);
        const sameQuantity=Number(original.quantity)===Number(body.quantity);
        const sameUnit=String(original.unit||"").trim()===String(body.unit||"").trim();
        const sameMemo=String(original.memo||"").trim()===String(body.memo||"").trim();
        if(!sameProduct||!sameQuantity||!sameUnit||!sameMemo){
          const changes=[!sameProduct&&"제품",!sameQuantity&&"사용량",!sameUnit&&"단위",!sameMemo&&"메모"].filter(Boolean);
          return json({error:`반출·반입 정산 기록과 ${changes.join("·")}가 다릅니다. 기존 자재의 단가만 저장할 수 있습니다.`,priceOnlyMaterial:original},409);
        }
        // Catalog aliases and display names must not turn a price edit into a product edit.
        const priceBody={...body,brand:original.brand,product_code:original.product_code,product_name:original.product_name,unit:original.unit,memo:original.memo};
        const saved = await db.rpc("update_actual_material_price", {p_user:user.id,p_site:site.id,p_material:body.id,p_body:priceBody});
        if (saved.error) {
          if (["PGRST202","42883"].includes(saved.error.code)) return json({error:"단가 저장 설정 업데이트가 필요합니다. 관리자 단가 저장 SQL을 먼저 적용해주세요."},503);
          if (["22023","40001","42501","P0001"].includes(saved.error.code)) return json({error:saved.error.message},saved.error.code==="42501"?403:409);
          throw saved.error;
        }
        return json(saved.data);
      }
      if (["22023","40001","P0001"].includes(error.code)) return json({error:error.message},409);
      throw error;
    }
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

