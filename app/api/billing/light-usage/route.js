import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkUsageLimit } from "../../../utils/serverUsageLimit";

export const runtime = "nodejs";
const events = ["ai_photo_analysis", "auto_estimate", "similar_image_search", "virtual_remodel", "image_upload", "customer_lead"];
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return reply({ error: "로그인이 필요합니다." }, 401);
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return reply({ error: "로그인이 만료되었습니다." }, 401);
    const { data: profile } = await db.from("profiles").select("company_id,role,is_active")
      .eq("id", auth.user.id).maybeSingle();
    if (!profile?.company_id || profile.role !== "owner" || profile.is_active === false)
      return reply({ error: "업체 관리자 권한이 필요합니다." }, 403);
    const { data: company } = await db.from("companies").select("id,subscription_plan,is_active")
      .eq("id", profile.company_id).maybeSingle();
    if (!company || company.is_active === false || company.subscription_plan !== "light")
      return reply({ error: "라이트 요금제가 적용되지 않았습니다." }, 409);
    const results = await Promise.all(events.map(eventType => checkUsageLimit({
      company, eventType, requestedQuantity: 0, supabase: db,
    })));
    if (results.some(result => !result.ok)) return reply({ error: "사용량을 확인하지 못했습니다." }, 503);
    const usage = Object.fromEntries(events.map((eventType, index) => [eventType, {
      used: results[index].used, limit: results[index].limit, remaining: results[index].remaining,
    }]));
    return reply({ usage });
  } catch (error) {
    console.error("[billing/light-usage]", error);
    return reply({ error: "사용량을 확인하지 못했습니다." }, 500);
  }
}
