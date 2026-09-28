import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

async function context(request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return { error: "로그인이 필요합니다.", status: 401 };
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return { error: "로그인이 만료되었습니다.", status: 401 };
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("company_id, is_active, role").eq("id", auth.user.id).single();
  if (profileError || !profile?.company_id || profile.is_active === false || profile.role !== "owner")
    return { error: "업체 소유자만 요금제를 변경할 수 있습니다.", status: 403 };
  return { admin, companyId: profile.company_id };
}

export async function GET(request) {
  try {
    const ctx = await context(request);
    if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    const { data, error } = await ctx.admin.from("subscriptions")
      .select("pending_plan_code, current_period_end")
      .eq("company_id", ctx.companyId).eq("status", "active").maybeSingle();
    if (error) throw error;
    return NextResponse.json({ pendingPlanCode: data?.pending_plan_code || null,
      effectiveAt: data?.current_period_end || null });
  } catch (error) {
    console.error("[billing/change-plan GET]", error);
    return NextResponse.json({ error: "변경 예약을 확인하지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const ctx = await context(request);
    if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    const { plan_code } = await request.json();
    const requested = String(plan_code || "").trim().toLowerCase();
    const { data: sub, error: subError } = await ctx.admin.from("subscriptions")
      .select("id, plan_code, current_period_end, cancel_at_period_end")
      .eq("company_id", ctx.companyId).eq("status", "active").maybeSingle();
    if (subError) throw subError;
    if (!sub || sub.cancel_at_period_end || !sub.current_period_end ||
        new Date(sub.current_period_end).getTime() <= Date.now())
      return NextResponse.json({ error: "변경할 수 있는 유료 구독이 없습니다." }, { status: 409 });
    const { data: plans, error: plansError } = await ctx.admin.from("subscription_plans")
      .select("plan_code, monthly_price_krw, is_active")
      .in("plan_code", [sub.plan_code, requested]);
    if (plansError) throw plansError;
    const current = plans?.find(p => p.plan_code.toLowerCase() === sub.plan_code.toLowerCase());
    const target = plans?.find(p => p.plan_code.toLowerCase() === requested && p.is_active);
    if (!current || !target || requested === "trial" ||
        Number(target.monthly_price_krw) >= Number(current.monthly_price_krw))
      return NextResponse.json({ error: "현재보다 낮은 유료 요금제만 예약할 수 있습니다." }, { status: 400 });
    const { data: updated, error: updateError } = await ctx.admin.from("subscriptions")
      .update({ pending_plan_code: target.plan_code, updated_at: new Date().toISOString() })
      .eq("id", sub.id).eq("company_id", ctx.companyId)
      .eq("status", "active").eq("cancel_at_period_end", false)
      .eq("current_period_end", sub.current_period_end)
      .select("pending_plan_code, current_period_end").single();
    if (updateError) throw updateError;
    return NextResponse.json({ ok: true, pendingPlanCode: updated.pending_plan_code,
      effectiveAt: updated.current_period_end, amountNow: 0,
      nextAmount: Number(target.monthly_price_krw) });
  } catch (error) {
    console.error("[billing/change-plan POST]", error);
    return NextResponse.json({ error: "요금제 변경 예약에 실패했습니다." }, { status: 500 });
  }
}
