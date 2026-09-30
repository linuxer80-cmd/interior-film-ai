import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function cleanStoragePath(value) {
  let path = String(value || "").trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (url.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin) return "";
      const match = url.pathname.match(/^\/storage\/v1\/object\/(?:sign|public|authenticated)\/work-photos\/(.+)$/);
      if (!match) return "";
      path = decodeURIComponent(match[1]);
    } catch { return ""; }
  }
  path = path.replace(/^\/+/, "").replace(/^work-photos\//, "");
  if (path.split("/").some((part) => !part || part === "." || part === "..") || /[\\?#]/.test(path)) return "";
  return path;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const slug = String(body?.company_slug || "").trim().toLowerCase();
    const workItemId = String(body?.work_item_id || "");
    const photoType = body?.photo_type;
    const requestedPath = cleanStoragePath(body?.path);
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json({ success: false, error: "올바른 업체 정보가 필요합니다." }, { status: 400 });
    }
    if (workItemId ? (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(workItemId) || !["before", "after", "history"].includes(photoType)) : !requestedPath) {
      return NextResponse.json({ success: false, error: "올바른 시공사진 정보가 필요합니다." }, { status: 400 });
    }
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: company, error: companyError } = await supabase.from("companies")
      .select("id").eq("slug", slug).eq("is_active", true).maybeSingle();
    if (companyError) throw companyError;
    if (!company) return NextResponse.json({ success: false, error: "사용할 수 없는 업체입니다." }, { status: 404 });

    // Authorize using registered records, never a folder name guessed to be a UUID.
    // This also supports legacy history/<timestamp>.jpg and current nested paths.
    if (workItemId) {
      const { data: work, error } = await supabase.from("work_items").select("id")
        .eq("id", workItemId).eq("company_id", company.id).maybeSingle();
      if (error) throw error;
      if (!work) return NextResponse.json({ success: false, error: "시공사례를 찾을 수 없습니다." }, { status: 404 });
    }
    let query = supabase.from("work_photos").select("storage_path, photo_url, photo_type")
      .eq("company_id", company.id);
    query = workItemId ? query.eq("work_item_id", workItemId).eq("photo_type", photoType)
      : query.eq("storage_path", requestedPath).in("photo_type", ["before", "after", "history"]);
    const { data: photos, error: photoError } = await query.order("created_at", { ascending: true }).limit(20);
    if (photoError) throw photoError;
    const paths = [...new Set((photos || []).map((photo) => cleanStoragePath(photo.storage_path) || cleanStoragePath(photo.photo_url)).filter(Boolean))];
    if (!paths.length) return NextResponse.json({ success: true, found: false, signed_url: null });

    // An old broken object must not hide another valid registered photo of this side.
    for (const path of paths) {
      const { data, error } = await supabase.storage.from("work-photos").createSignedUrl(path, 3600);
      if (!error && data?.signedUrl) return NextResponse.json({ success: true, found: true, signed_url: data.signedUrl });
    }
    return NextResponse.json({ success: false, error: "등록된 사진을 불러오지 못했습니다. 다시 시도해주세요." }, { status: 502 });
  } catch (error) {
    console.error("similar-photo error:", error);
    return NextResponse.json({ success: false, error: "유사 시공사진을 불러오지 못했습니다. 다시 시도해주세요." }, { status: 500 });
  }
}
