import { createClient } from "@supabase/supabase-js";
import { normalizeProfile } from "../../../../lib/caseClassification.mjs";
import { PROJECT_ID } from "../../../admin/adminConstants";
import { QUICK_REGISTER_CATEGORIES } from "../../../utils/quickRegisterCategories";
export const runtime = "nodejs";
export const maxDuration = 60;
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply({ error: "로그인이 필요합니다." }, 401);
    const scoped = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data: auth, error: authError } = await scoped.auth.getUser(token);
    if (authError || !auth?.user) return reply({ error: "로그인이 필요합니다." }, 401);
    const { data: status, error: statusError } = await scoped.rpc("get_super_admin_status");
    if (statusError || !(Array.isArray(status) ? status[0] : status)?.is_super_admin) return reply({ error: "슈퍼관리자만 등록할 수 있습니다." }, 403);
    const multipart = request.headers.get("content-type")?.startsWith("multipart/form-data");
    const form = multipart ? await request.formData() : null;
    const body = multipart ? Object.fromEntries(form) : await request.json();
    const { company_id, case_id } = body;
    if (!uuid(company_id) || !uuid(case_id)) return reply({ error: "업체와 사례를 확인해주세요." }, 400);
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: company, error: companyError } = await db.from("companies").select("id").eq("id", company_id).single();
    if (companyError || !company) return reply({ error: "등록할 업체가 없습니다." }, 400);
    const prefix = `history/${company_id}/bulk/${case_id}/`;
    if (multipart) {
      const file = form.get("image");
      if (!uuid(body.photo_id) || !file || file.type !== "image/jpeg" || !file.size || file.size > 3_500_000) return reply({ error: "3.5MB 이하 JPG 사진을 선택해주세요." }, 400);
      const path = `${prefix}${body.photo_id}.jpg`;
      // Immutable upload: a retry can reuse its existing object, never overwrite a saved case.
      const { error } = await db.storage.from("work-photos").upload(path, file, { contentType: "image/jpeg", upsert: false });
      if (error && !["409", "Duplicate"].includes(String(error.statusCode || error.error))) throw error;
      return reply({ path });
    }
    const photos = body.photos;
    if (!QUICK_REGISTER_CATEGORIES.includes(body.category) || typeof body.sub_category !== "string" || body.sub_category.length > 300 || !Number.isFinite(body.actual_cost) || body.actual_cost <= 0 || !Array.isArray(photos) || !photos.length || photos.length > 200 || new Set(photos.map(p => p.id)).size !== photos.length || photos.some(p => !Array.isArray(p.embedding) || p.embedding.length !== 1536 || !p.embedding.every(Number.isFinite) || !uuid(p.id) || p.storage_path !== `${prefix}${p.id}.jpg` || !["before", "after"].includes(p.photo_type))) return reply({ error: "분류·금액·사진 정보를 확인해주세요." }, 400);
    const { data: existing, error: existingError } = await db.from("work_items").select("id,company_id").eq("id", case_id).maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      const { data: saved, error } = await db.from("work_photos").select("id").eq("company_id", company_id).eq("work_item_id", case_id);
      if (!error && existing.company_id === company_id && saved.length === photos.length && saved.every(p => photos.some(input => input.id === p.id))) return reply({ ok: true, reused: true });
      return reply({ error: "이미 저장 중이거나 일부 등록된 사례입니다. 시공 DB를 확인해주세요." }, 409);
    }
    const { data: objects, error: listError } = await db.storage.from("work-photos").list(prefix.slice(0, -1), { limit: 1000 });
    if (listError) throw listError;
    if (photos.some(p => !objects.some(o => o.name === `${p.id}.jpg`))) return reply({ error: "사진 업로드가 완료되지 않았습니다. 다시 등록해주세요." }, 400);
    const { error: itemError } = await db.from("work_items").insert({ id: case_id, company_id, project_id: PROJECT_ID, category: body.category, sub_category: body.sub_category, actual_cost: body.actual_cost, case_profile: normalizeProfile(body.case_profile), memo: String(body.memo || "").slice(0, 2000) });
    if (itemError) throw itemError;
    const { error: photoError } = await db.from("work_photos").insert(photos.map(p => ({ id: p.id, embedding: p.embedding, company_id, project_id: PROJECT_ID, work_item_id: case_id, category: body.category, sub_category: body.sub_category, storage_path: p.storage_path, photo_url: null, photo_type: p.photo_type, image_hash: typeof p.image_hash === "string" ? p.image_hash : null, ai_description: String(p.ai_description || "").slice(0, 5000), ai_tags: Array.isArray(p.ai_tags) ? p.ai_tags.filter(t => typeof t === "string").slice(0, 50) : null })));
    if (photoError) {
      const { error: rollbackError } = await db.from("work_items").delete().eq("id", case_id).eq("company_id", company_id);
      if (rollbackError) return reply({ error: "일부 저장 상태 확인이 필요합니다. 시공 DB에서 해당 사례를 확인해주세요." }, 409);
      throw photoError;
    }
    return reply({ ok: true });
  } catch (error) {
    console.error("Super admin bulk registration", error);
    return reply({ error: "등록에 실패했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도해주세요." }, 500);
  }
}
