import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { payWithTossBillingKey } from "../../../utils/tossBilling";

export const runtime = "nodejs";
export const maxDuration = 60;
const reply = (error, status) => NextResponse.json({ ok: false, error }, { status });
const adminClient = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });

async function context(request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return { error: "로그인이 필요합니다.", status: 401 };
  const db = adminClient();
  const { data: auth, error } = await db.auth.getUser(token);
  if (error || !auth.user) return { error: "로그인이 만료되었습니다.", status: 401 };
  const { data: profile } = await db.from("profiles").select("company_id, is_active, role")
    .eq("id", auth.user.id).maybeSingle();
  if (!profile?.company_id || profile.is_active === false || profile.role !== "owner")
    return { error: "업체 소유자만 요금제를 변경할 수 있습니다.", status: 403 };
  return { db, user: auth.user, companyId: profile.company_id };
}

async function facts(ctx, targetCode) {
  const { data: sub, error: subError } = await ctx.db.from("subscriptions")
    .select("id, plan_code, monthly_price_krw, current_period_start, current_period_end, next_billing_at, cancel_at_period_end, pending_plan_code")
    .eq("company_id", ctx.companyId).eq("status", "active").maybeSingle();
  if (subError) throw subError;
  if (!sub || sub.cancel_at_period_end || !sub.current_period_start || !sub.current_period_end)
    return { error: "활성 유료 구독에서만 상향 변경할 수 있습니다.", status: 409 };
  const { data: target, error: targetError } = await ctx.db.from("subscription_plans")
    .select("plan_code, plan_name, monthly_price_krw, is_active")
    .ilike("plan_code", targetCode).eq("is_active", true).maybeSingle();
  if (targetError) throw targetError;
  const currentPrice = Number(sub.monthly_price_krw);
  const targetPrice = Number(target?.monthly_price_krw);
  if (!target || !Number.isInteger(currentPrice) || !Number.isInteger(targetPrice) ||
      targetPrice <= currentPrice || target.plan_code.toLowerCase() === "trial")
    return { error: "현재보다 높은 유료 요금제만 선택할 수 있습니다.", status: 400 };
  return { sub, target, currentPrice, targetPrice };
}
function calculate(facts, quoteAt) {
  const start = new Date(facts.sub.current_period_start).getTime();
  const end = new Date(facts.sub.current_period_end).getTime();
  const time = Number(quoteAt);
  if (!(start < time && time < end)) return null;
  const amount = Math.ceil((facts.targetPrice - facts.currentPrice) * (end - time) / (end - start));
  return Number.isInteger(amount) && amount > 0 ? amount : null;
}
function signature(userId, facts, amount, quoteAt) {
  const payload = [userId, facts.sub.id, facts.sub.plan_code, facts.target.plan_code,
    facts.sub.current_period_end, amount, quoteAt].join(":");
  return crypto.createHmac("sha256", process.env.TOSS_SECRET_KEY).update(payload).digest("hex");
}

export async function POST(request) {
  try {
    const ctx = await context(request);
    if (ctx.error) return reply(ctx.error, ctx.status);
    const body = await request.json();
    const targetCode = String(body.plan_code || "").trim().toLowerCase();
    const info = await facts(ctx, targetCode);
    if (info.error) {
      const { data: sub } = await ctx.db.from("subscriptions")
        .select("id, plan_code, current_period_end").eq("company_id", ctx.companyId)
        .eq("status", "active").maybeSingle();
      if (sub?.plan_code?.toLowerCase() === targetCode) {
        const orderId = `up_${sub.id}_${new Date(sub.current_period_end).getTime()}`;
        const { data: paid } = await ctx.db.from("payments").select("status, metadata")
          .eq("order_id", orderId).eq("company_id", ctx.companyId).maybeSingle();
        if (paid?.status === "paid" && paid.metadata?.source === "plan_upgrade") {
          const { error: reconcileError } = await ctx.db.from("companies").update({ subscription_plan: sub.plan_code })
            .eq("id", ctx.companyId);
          if (reconcileError) throw reconcileError;
          return NextResponse.json({ ok: true, alreadyPaid: true, planCode: sub.plan_code });
        }
      }
      return reply(info.error, info.status);
    }
    const now = Date.now();
    if (body.action === "quote") {
      const orderId = `up_${info.sub.id}_${new Date(info.sub.current_period_end).getTime()}`;
      const { data: existing } = await ctx.db.from("payments").select("plan_code, amount_krw, metadata, status")
        .eq("order_id", orderId).maybeSingle();
      if (existing && existing.plan_code !== info.target.plan_code)
        return reply("이미 다른 상향 변경 결제가 진행 중입니다.", 409);
      const quoteAt = existing?.metadata?.quote_at || Math.max(new Date(info.sub.current_period_start).getTime() + 1, Math.floor(now / 60000) * 60000);
      const amount = calculate(info, quoteAt);
      if (existing && (existing.status !== "pending" || Number(existing.amount_krw) !== amount))
        return reply("이미 처리된 상향 변경입니다. 페이지를 새로고침해주세요.", 409);
      if (!amount || now - quoteAt > 10 * 60 * 1000) return reply("결제 준비 시간이 지났습니다. 관리자에게 문의해주세요.", 409);
      return NextResponse.json({ ok: true, amountNow: amount,
        monthlyPrice: info.targetPrice, currentPrice: info.currentPrice,
        periodEnd: info.sub.current_period_end, quoteAt,
        signature: signature(ctx.user.id, info, amount, quoteAt) });
    }
    if (body.action !== "confirm") return reply("요청을 확인해주세요.", 400);
    const quoteAt = Number(body.quoteAt);
    const amount = calculate(info, quoteAt);
    const supplied = String(body.signature || "");
    if (!amount || quoteAt > now || now - quoteAt > 10 * 60 * 1000 ||
        !/^[a-f0-9]{64}$/.test(supplied) ||
        !crypto.timingSafeEqual(Buffer.from(supplied, "hex"),
          Buffer.from(signature(ctx.user.id, info, amount, quoteAt), "hex")))
      return reply("결제 금액 확인 시간이 지났습니다. 다시 선택해주세요.", 409);
    const { data: customer, error: customerError } = await ctx.db.from("billing_customers")
      .select("billing_key, customer_key, is_active")
      .eq("company_id", ctx.companyId).eq("provider", "toss").maybeSingle();
    if (customerError) throw customerError;
    if (!customer?.billing_key || !customer.customer_key || customer.is_active === false)
      return reply("등록된 결제수단이 없습니다. 결제수단을 다시 등록해주세요.", 409);
    // One payment order per subscription period prevents competing upgrades.
    const orderId = `up_${info.sub.id}_${new Date(info.sub.current_period_end).getTime()}`;
    let { data: payment, error: paymentError } = await ctx.db.from("payments")
      .select("*").eq("order_id", orderId).maybeSingle();
    if (paymentError) throw paymentError;
    if (payment && (payment.plan_code !== info.target.plan_code || Number(payment.amount_krw) !== amount))
      return reply("이미 다른 변경 결제가 준비되었습니다. 관리자에게 문의해주세요.", 409);
    if (!payment) {
      const inserted = await ctx.db.from("payments").insert({
        company_id: ctx.companyId, subscription_id: info.sub.id, provider: "toss",
        order_id: orderId, payment_key: null, plan_code: info.target.plan_code,
        amount_krw: amount, status: "pending", payment_type: "subscription",
        metadata: { source: "plan_upgrade", from_plan: info.sub.plan_code,
          period_end: info.sub.current_period_end, monthly_price_krw: info.targetPrice, quote_at: quoteAt },
      }).select("*").single();
      if (inserted.error?.code === "23505") {
        const concurrent = await ctx.db.from("payments").select("*").eq("order_id", orderId).single();
        payment = concurrent.data;
      } else if (inserted.error) throw inserted.error;
      else payment = inserted.data;
    }
    if (!payment || payment.plan_code !== info.target.plan_code || Number(payment.amount_krw) !== amount)
      return reply("변경 결제 정보를 확인하지 못했습니다.", 409);
    if (payment.status === "failed") return reply("실패한 결제 요청입니다. 관리자에게 문의해주세요.", 409);
    const toss = payment.status === "paid" ? null : await payWithTossBillingKey({
      billingKey: customer.billing_key, customerKey: customer.customer_key,
      amount, orderId, orderName: `${info.target.plan_name} 잔여기간 상향 변경`,
      customerEmail: ctx.user.email || undefined, idempotencyKey: orderId,
    });
    const { error: paidError } = await ctx.db.from("payments").update({
      status: "paid", payment_key: toss?.paymentKey || payment.payment_key,
      paid_at: toss?.approvedAt || payment.paid_at || new Date().toISOString(),
      metadata: { ...payment.metadata, toss_status: toss?.status || "DONE" },
      updated_at: new Date().toISOString(),
    }).eq("id", payment.id);
    if (paidError) throw paidError;
    const { data: updated, error: updateError } = await ctx.db.from("subscriptions")
      .update({ plan_code: info.target.plan_code, monthly_price_krw: info.targetPrice,
        pending_plan_code: null, updated_at: new Date().toISOString() })
      .eq("id", info.sub.id).eq("company_id", ctx.companyId)
      .eq("plan_code", info.sub.plan_code).eq("current_period_end", info.sub.current_period_end)
      .eq("cancel_at_period_end", false).select("id").maybeSingle();
    if (updateError || !updated) throw new Error("결제 승인 후 요금제 적용을 확인하지 못했습니다. 관리자 확인이 필요합니다.");
    const { error: companyError } = await ctx.db.from("companies")
      .update({ subscription_plan: info.target.plan_code, updated_at: new Date().toISOString() })
      .eq("id", ctx.companyId);
    if (companyError) throw companyError;
    return NextResponse.json({ ok: true, amountPaid: amount,
      planCode: info.target.plan_code, nextBillingAt: info.sub.next_billing_at });
  } catch (error) {
    console.error("[billing/upgrade]", error);
    return reply("결제 결과를 확정하지 못했습니다. 다시 결제하지 말고 관리자에게 문의해주세요.", 500);
  }
}
