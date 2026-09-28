import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { tossApiRequest } from "../../../utils/tossBilling";

export const runtime = "nodejs";

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
}
async function identity(request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return { error: "로그인이 필요합니다.", status: 401 };
  const db = service();
  const { data: auth, error } = await db.auth.getUser(token);
  if (error || !auth.user) return { error: "로그인이 만료되었습니다.", status: 401 };
  const [{ data: profile }, { data: superAdmin }] = await Promise.all([
    db.from("profiles").select("company_id, is_active, role").eq("id", auth.user.id).maybeSingle(),
    db.from("super_admins").select("user_id").eq("user_id", auth.user.id).eq("is_active", true).maybeSingle(),
  ]);
  if (!superAdmin && (!profile?.company_id || profile.is_active === false || profile.role !== "owner"))
    return { error: "결제 담당자 권한이 필요합니다.", status: 403 };
  return { db, user: auth.user, companyId: profile?.company_id, superAdmin: Boolean(superAdmin) };
}
const fail = (error, status) => NextResponse.json({ ok: false, error }, { status });

export async function GET(request) {
  try {
    const ctx = await identity(request);
    if (ctx.error) return fail(ctx.error, ctx.status);
    if (ctx.superAdmin) {
      const { data, error } = await ctx.db.from("billing_events")
        .select("id, company_id, payment_id, event_type, event_data, created_at")
        .eq("event_type", "refund_requested").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const ids = [...new Set((data || []).map(x => x.payment_id).filter(Boolean))];
      const { data: payments, error: paymentError } = ids.length
        ? await ctx.db.from("payments").select("id, company_id, amount_krw, paid_at, status, plan_code").in("id", ids)
        : { data: [], error: null };
      if (paymentError) throw paymentError;
      const { data: handled, error: handledError } = ids.length
        ? await ctx.db.from("billing_events").select("payment_id, event_data")
          .eq("event_type", "refund_processed").in("payment_id", ids)
        : { data: [], error: null };
      if (handledError) throw handledError;
      return NextResponse.json({ ok: true, requests: (data || []).map(x => ({ ...x,
        payment: (payments || []).find(p => p.id === x.payment_id) || null,
        processed: (handled || []).find(h => h.event_data?.request_id === x.id) || null,
      })) });
    }
    const { data: payments, error } = await ctx.db.from("payments")
      .select("id, amount_krw, paid_at, status, plan_code, order_id")
      .eq("company_id", ctx.companyId).in("status", ["paid", "refunded"])
      .order("paid_at", { ascending: false }).limit(20);
    if (error) throw error;
    const ids = (payments || []).map(x => x.id);
    const { data: requests } = ids.length ? await ctx.db.from("billing_events")
      .select("payment_id, created_at").eq("event_type", "refund_requested").in("payment_id", ids)
      : { data: [] };
    return NextResponse.json({ ok: true, payments: (payments || []).map(x => ({ ...x,
      refundRequestedAt: (requests || []).find(r => r.payment_id === x.id)?.created_at || null,
    })) });
  } catch (error) {
    console.error("[billing/refunds GET]", error);
    return fail("환불 내역을 불러오지 못했습니다.", 500);
  }
}

export async function POST(request) {
  try {
    const ctx = await identity(request);
    if (ctx.error) return fail(ctx.error, ctx.status);
    const body = await request.json();
    if (ctx.superAdmin && body.action === "process") {
      const requestId = String(body.request_id || "");
      const amount = Number(body.amount_krw);
      const { data: requested } = await ctx.db.from("billing_events").select("*")
        .eq("id", requestId).eq("event_type", "refund_requested").maybeSingle();
      if (!requested) return fail("환불 신청을 찾을 수 없습니다.", 404);
      const { data: previous } = await ctx.db.from("billing_events").select("id, event_data")
        .eq("payment_id", requested.payment_id).eq("event_type", "refund_processed");
      if ((previous || []).some(x => x.event_data?.request_id === requestId))
        return NextResponse.json({ ok: true, alreadyProcessed: true });
      const { data: payment } = await ctx.db.from("payments").select("*")
        .eq("id", requested.payment_id).eq("company_id", requested.company_id).maybeSingle();
      if (!payment?.payment_key || !["paid", "refunded"].includes(payment.status))
        return fail("취소할 카드 결제를 확인할 수 없습니다.", 409);
      if (!Number.isInteger(amount) || amount < 1 || amount > Number(payment.amount_krw))
        return fail("환불 금액을 확인해주세요.", 400);
      // The PG idempotency key is stable even after a server or DB failure.
      const toss = await tossApiRequest({
        path: `/v1/payments/${encodeURIComponent(payment.payment_key)}/cancel`,
        body: { cancelReason: "고객 요청 환불", cancelAmount: amount },
        idempotencyKey: `refund_${requestId}`,
      });
      const { error: eventError } = await ctx.db.from("billing_events").insert({
        company_id: requested.company_id, subscription_id: requested.subscription_id,
        payment_id: payment.id, event_type: "refund_processed", provider: "toss",
        event_data: { request_id: requestId, amount_krw: amount,
          transaction_key: toss.cancels?.at(-1)?.transactionKey || null,
          processed_by: ctx.user.id },
      });
      if (eventError) throw eventError;
      if (Number(toss.balanceAmount) === 0) {
        const { error: updateError } = await ctx.db.from("payments").update({ status: "refunded",
          updated_at: new Date().toISOString() }).eq("id", payment.id);
        if (updateError) throw updateError;
      }
      return NextResponse.json({ ok: true, canceledAmount: amount, balanceAmount: toss.balanceAmount });
    }
    if (ctx.superAdmin) return fail("업체 관리자만 신청할 수 있습니다.", 403);
    const paymentId = String(body.payment_id || "");
    const reason = String(body.reason || "").trim().slice(0, 1000);
    if (reason.length < 3) return fail("환불 사유를 입력해주세요.", 400);
    const { data: payment } = await ctx.db.from("payments").select("id, company_id, subscription_id, status")
      .eq("id", paymentId).eq("company_id", ctx.companyId).maybeSingle();
    if (!payment || payment.status !== "paid") return fail("환불 가능한 결제 내역을 찾을 수 없습니다.", 404);
    const { data: existing } = await ctx.db.from("billing_events").select("id")
      .eq("payment_id", payment.id).eq("event_type", "refund_requested").limit(1);
    if (existing?.length) return NextResponse.json({ ok: true, alreadyRequested: true });
    const { data: event, error: eventError } = await ctx.db.from("billing_events").insert({
      company_id: ctx.companyId, subscription_id: payment.subscription_id, payment_id: payment.id,
      event_type: "refund_requested", provider: "toss",
      event_data: { reason, requested_by: ctx.user.id },
    }).select("id").single();
    if (eventError) throw eventError;
    const { data: admins } = await ctx.db.from("super_admins").select("user_id").eq("is_active", true);
    for (const admin of admins || []) {
      await ctx.db.from("notifications").insert({ company_id: ctx.companyId,
        recipient_type: "super_admin", recipient_user_id: admin.user_id,
        recipient_worker_id: null, type: "refund_requested", priority: "warning",
        title: "환불 요청", message: "결제 환불 요청이 접수되었습니다.",
        link: "/super-admin/billing", reference_type: "payment", reference_id: payment.id,
        dedupe_key: `refund_requested:${event.id}:${admin.user_id}`, is_read: false, push_sent: false });
    }
    return NextResponse.json({ ok: true, requestId: event.id });
  } catch (error) {
    console.error("[billing/refunds POST]", error);
    return fail("환불 요청을 처리하지 못했습니다. 결제 내역을 확인해주세요.", 500);
  }
}
