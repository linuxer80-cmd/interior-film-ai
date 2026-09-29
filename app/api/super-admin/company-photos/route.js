import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES = {
  work: { table: "work_photos", fields: "id, company_id, category, sub_category, photo_type, storage_path, photo_url, created_at", limit: 24 },
  site: { table: "site_photos", fields: "id, company_id, site_id, photo_type, storage_path, photo_url, description, created_at", limit: 24 },
  estimate: { table: "estimate_usage", fields: "id, company_id, category, sub_category, photo_paths, created_at", paths: "photo_paths", limit: 12 },
  lead: { table: "customer_leads", fields: "id, company_id, customer_photo_paths, created_at", paths: "customer_photo_paths", limit: 12 },
};
const TYPES = new Set(["all", "before", "after", "request", "history"]);
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const response = (body, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" },
});

function storagePath(value, supabaseUrl) {
  let path = typeof value === "string" ? value.trim() : "";
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (url.origin !== new URL(supabaseUrl).origin) return "";
      const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/work-photos\/(.+)$/);
      if (!match) return "";
      path = decodeURIComponent(match[1]);
    } catch { return ""; }
  }
  path = path.replace(/^\/+/, "").replace(/^work-photos\//, "");
  if (/[\\?#]/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) return "";
  return path;
}

export async function GET(request) {
  try {
    const token = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return response({ ok: false, error: "로그인이 필요합니다." }, 401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing server configuration");
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) return response({ ok: false, error: "로그인이 만료되었습니다. 다시 로그인해주세요." }, 401);
    const { data: admin, error: adminError } = await supabase.from("super_admins")
      .select("user_id").eq("user_id", userData.user.id).eq("is_active", true).maybeSingle();
    if (adminError) throw adminError;
    if (!admin) return response({ ok: false, error: "슈퍼관리자만 업체 사진을 볼 수 있습니다." }, 403);

    const params = new URL(request.url).searchParams;
    const companyId = params.get("company_id") || "";
    const source = params.get("source") || "work";
    const photoType = params.get("photo_type") || "all";
    const page = Number(params.get("page") || 1);
    if (!UUID.test(companyId) || !Object.hasOwn(SOURCES, source) || !TYPES.has(photoType) || !Number.isInteger(page) || page < 1 || page > 10000) {
      return response({ ok: false, error: "사진 조회 조건이 올바르지 않습니다." }, 400);
    }
    const config = SOURCES[source];
    if (config.paths && photoType !== "all") return response({ ok: false, error: "해당 사진 종류에는 전·후 필터를 사용할 수 없습니다." }, 400);
    const { data: company, error: companyError } = await supabase.from("companies")
      .select("id, company_name").eq("id", companyId).maybeSingle();
    if (companyError) throw companyError;
    if (!company) return response({ ok: false, error: "업체를 찾을 수 없습니다." }, 404);

    let query = supabase.from(config.table).select(config.fields, { count: "exact" }).eq("company_id", companyId);
    if (!config.paths && photoType !== "all") query = query.eq("photo_type", photoType);
    const offset = (page - 1) * config.limit;
    const { data: rows, count, error: rowsError } = await query.order("created_at", { ascending: false })
      .order("id", { ascending: false }).range(offset, offset + config.limit - 1);
    if (rowsError) throw rowsError;
    const siteIds = source === "site" ? [...new Set((rows || []).map((row) => row.site_id).filter(Boolean))] : [];
    const siteNames = new Map();
    if (siteIds.length) {
      const { data: sites, error } = await supabase.from("sites").select("id, site_name").eq("company_id", companyId).in("id", siteIds);
      if (error) throw error;
      (sites || []).forEach((site) => siteNames.set(site.id, site.site_name));
    }
    const photos = (rows || []).flatMap((row) => {
      const values = config.paths ? (Array.isArray(row[config.paths]) ? [...new Set(row[config.paths])] : [])
        : [row.storage_path || row.photo_url || ""];
      return values.map((value, index) => ({
        id: `${source}:${row.id}:${index}`, record_id: row.id,
        title: source === "site" ? siteNames.get(row.site_id) || "현장 사진"
          : source === "lead" ? "고객 상담 사진" : [row.category, row.sub_category].filter(Boolean).join(" · ") || "등록 사진",
        photo_type: row.photo_type || (source === "lead" ? "lead" : "estimate"),
        created_at: row.created_at, path: storagePath(value, url),
      }));
    });
    const paths = [...new Set(photos.map((photo) => photo.path).filter(Boolean))];
    const signed = new Map();
    if (paths.length) {
      const { data, error } = await supabase.storage.from("work-photos").createSignedUrls(paths, 600);
      if (error) throw error;
      (data || []).forEach((entry) => { if (!entry.error && entry.signedUrl) signed.set(entry.path, entry.signedUrl); });
    }
    return response({
      ok: true, company: { id: company.id, name: company.company_name }, source, page,
      page_size: config.limit, total_records: count || 0, has_more: offset + config.limit < (count || 0),
      photos: photos.map(({ path, ...photo }) => ({ ...photo, url: signed.get(path) || null,
        error: signed.has(path) ? null : path ? "파일을 불러오지 못했습니다." : "저장된 사진 경로가 없습니다." })),
    });
  } catch (error) {
    console.error("super-admin company photos:", error);
    return response({ ok: false, error: "업체 사진을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." }, 500);
  }
}
