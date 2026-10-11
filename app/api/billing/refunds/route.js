import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { tossApiRequest } from "../../../utils/tossBilling";

export const runtime = "nodejs";

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

async function identity(request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];

  if (!token) {
    return {
      error: "로그인이 필요합니다.",
      status: 401,
    };
  }

  const db = service();
  const { data: auth, error } =
    await db.auth.getUser(token);

  if (error || !auth.user) {
    return {
      error: "로그인이 만료되었습니다.",
      status: 401,
    };
  }

  const [
    { data: profile, error: profileError },
    { data: superAdmin, error: adminError },
  ] = await Promise.all([
    db
      .from("profiles")
      .select("company_id, is_active, role")
      .eq("id", auth.user.id)
      .maybeSingle(),
    db
      .from("super_admins")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (profileError) throw profileError;
  if (adminError) throw adminError;

  if (
    !superAdmin &&
    (
      !profile?.company_id ||
      profile.is_active === false ||
      profile.role !== "owner"
    )
  ) {
    return {
      error: "결제 담당자 권한이 필요합니다.",
      status: 403,
    };
  }

  return {
    db,
    user: auth.user,
    companyId: profile?.company_id,
    superAdmin: Boolean(superAdmin),
  };
}

const fail = (error, status) =>
  NextResponse.json(
    { ok: false, error },
    { status }
  );

// 카드 취소를 재실행하지 않고 토스의 현재 결제 상태를 확인합니다.
async function reconcilePayment(db, payment) {
  if (!payment?.payment_key) {
    throw new Error("결제 키가 없습니다.");
  }

  const toss = await tossApiRequest({
    path: `/v1/payments/${encodeURIComponent(
      payment.payment_key
    )}`,
    method: "GET",
  });

  if (
    toss?.paymentKey !== payment.payment_key ||
    Number(toss.totalAmount) !==
      Number(payment.amount_krw) ||
    !Number.isSafeInteger(toss.balanceAmount) ||
    toss.balanceAmount < 0
  ) {
    throw new Error(
      "토스 결제 조회 결과를 확인할 수 없습니다."
    );
  }

  if (
    toss.status === "CANCELED" &&
    toss.balanceAmount === 0 &&
    payment.status !== "refunded"
  ) {
    const { data, error } = await db
      .from("payments")
      .update({
        status: "refunded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .eq("company_id", payment.company_id)
      .eq("status", "paid")
      .select("id")
      .maybeSingle();

    if (error) throw error;

    // 다른 요청이 먼저 복구했는지도 확인합니다.
    if (!data) {
      const {
        data: current,
        error: readError,
      } = await db
        .from("payments")
        .select("status")
        .eq("id", payment.id)
        .eq("company_id", payment.company_id)
        .maybeSingle();

      if (readError) throw readError;

      if (current?.status !== "refunded") {
        throw new Error(
          "환불 상태 저장을 확인하지 못했습니다."
        );
      }
    }

    payment.status = "refunded";
  }

  return toss;
}

export async function GET(request) {
  try {
    const ctx = await identity(request);

    if (ctx.error) {
      return fail(ctx.error, ctx.status);
    }

    if (ctx.superAdmin) {
      const { data, error } = await ctx.db
        .from("billing_events")
        .select(
          "id, company_id, payment_id, event_type, event_data, created_at"
        )
        .eq("event_type", "refund_requested")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      const ids = [
        ...new Set(
          (data || [])
            .map((item) => item.payment_id)
            .filter(Boolean)
        ),
      ];

      const {
        data: payments,
        error: paymentError,
      } = ids.length
        ? await ctx.db
            .from("payments")
            .select(
              "id, company_id, amount_krw, paid_at, status, plan_code, payment_key"
            )
            .in("id", ids)
        : { data: [], error: null };

      if (paymentError) throw paymentError;

      const {
        data: handled,
        error: handledError,
      } = ids.length
        ? await ctx.db
            .from("billing_events")
            .select("payment_id, event_data")
            .eq("event_type", "refund_processed")
            .in("payment_id", ids)
        : { data: [], error: null };

      if (handledError) throw handledError;

      // 완료 기록이 있지만 결제 상태가 남아 있으면 복구합니다.
      // 이전 코드의 기록에는 balance_amount가 없을 수 있습니다.
      for (const payment of payments || []) {
        const records = (handled || []).filter(
          (item) => item.payment_id === payment.id
        );

        const needsCheck = records.some(
          (item) =>
            item.event_data?.balance_amount === 0 ||
            item.event_data?.balance_amount == null
        );

        if (payment.status === "paid" && needsCheck) {
          await reconcilePayment(ctx.db, payment);
        }

        // 결제 키는 화면에 전달하지 않습니다.
        delete payment.payment_key;
      }

      return NextResponse.json({
        ok: true,
        requests: (data || []).map((item) => ({
          ...item,
          payment:
            (payments || []).find(
              (payment) => payment.id === item.payment_id
            ) || null,
          processed:
            (handled || []).find(
              (record) =>
                record.event_data?.request_id === item.id
            ) || null,
        })),
      });
    }

    const { data: payments, error } = await ctx.db
      .from("payments")
      .select(
        "id, amount_krw, paid_at, status, plan_code, order_id"
      )
      .eq("company_id", ctx.companyId)
      .in("status", ["paid", "refunded"])
      .order("paid_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    const ids = (payments || []).map(
      (payment) => payment.id
    );

    const {
      data: requests,
      error: requestsError,
    } = ids.length
      ? await ctx.db
          .from("billing_events")
          .select("payment_id, created_at")
          .eq("event_type", "refund_requested")
          .in("payment_id", ids)
      : { data: [] };

    if (requestsError) throw requestsError;

    return NextResponse.json({
      ok: true,
      payments: (payments || []).map((payment) => ({
        ...payment,
        refundRequestedAt:
          (requests || []).find(
            (item) => item.payment_id === payment.id
          )?.created_at || null,
      })),
    });
  } catch (error) {
    console.error("[billing/refunds GET]", error);

    return fail(
      "환불 내역을 불러오지 못했습니다.",
      500
    );
  }
}

export async function POST(request) {
  try {
    const ctx = await identity(request);

    if (ctx.error) {
      return fail(ctx.error, ctx.status);
    }

    const body = await request.json();

    if (ctx.superAdmin && body.action === "process") {
      const requestId = String(body.request_id || "");
      const amount = Number(body.amount_krw);

      const {
        data: requested,
        error: requestedError,
      } = await ctx.db
        .from("billing_events")
        .select("*")
        .eq("id", requestId)
        .eq("event_type", "refund_requested")
        .maybeSingle();

      if (requestedError) throw requestedError;

      if (!requested) {
        return fail(
          "환불 신청을 찾을 수 없습니다.",
          404
        );
      }

      const {
        data: previous,
        error: previousError,
      } = await ctx.db
        .from("billing_events")
        .select("id, event_data")
        .eq("payment_id", requested.payment_id)
        .eq("event_type", "refund_processed");

      if (previousError) throw previousError;

      const {
        data: payment,
        error: paymentError,
      } = await ctx.db
        .from("payments")
        .select("*")
        .eq("id", requested.payment_id)
        .eq("company_id", requested.company_id)
        .maybeSingle();

      if (paymentError) throw paymentError;

      if (
        !payment?.payment_key ||
        !["paid", "refunded"].includes(payment.status)
      ) {
        return fail(
          "취소할 카드 결제를 확인할 수 없습니다.",
          409
        );
      }

      const processed = (previous || []).find(
        (item) =>
          item.event_data?.request_id === requestId
      );

      // 이미 취소한 요청은 상태만 복구합니다.
      if (processed) {
        const toss = await reconcilePayment(
          ctx.db,
          payment
        );

        return NextResponse.json({
          ok: true,
          alreadyProcessed: true,
          canceledAmount: processed.event_data.amount_krw,
          balanceAmount: toss.balanceAmount,
        });
      }

      if (payment.status === "refunded") {
        return fail(
          "이미 전액 환불된 결제입니다.",
          409
        );
      }

      if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > Number(payment.amount_krw)
      ) {
        return fail(
          "환불 금액을 확인해주세요.",
          400
        );
      }

      // 동일 신청의 재시도에서는 같은 멱등키를 사용합니다.
      const toss = await tossApiRequest({
        path: `/v1/payments/${encodeURIComponent(
          payment.payment_key
        )}/cancel`,
        body: {
          cancelReason: "고객 요청 환불",
          cancelAmount: amount,
        },
        idempotencyKey: `refund_${requestId}`,
      });

      const { error: eventError } = await ctx.db
        .from("billing_events")
        .insert({
          company_id: requested.company_id,
          subscription_id: requested.subscription_id,
          payment_id: payment.id,
          event_type: "refund_processed",
          provider: "toss",
          event_data: {
            request_id: requestId,
            amount_krw: amount,
            balance_amount: toss.balanceAmount,
            transaction_key:
              toss.cancels?.at(-1)?.transactionKey || null,
            processed_by: ctx.user.id,
          },
        });

      if (eventError) throw eventError;

      // 이 단계가 실패해도 완료 기록을 이용해 다시 복구합니다.
      const verified = await reconcilePayment(
        ctx.db,
        payment
      );

      return NextResponse.json({
        ok: true,
        canceledAmount: amount,
        balanceAmount: verified.balanceAmount,
      });
    }

    if (ctx.superAdmin) {
      return fail(
        "업체 관리자만 신청할 수 있습니다.",
        403
      );
    }

    const paymentId = String(body.payment_id || "");
    const reason = String(body.reason || "")
      .trim()
      .slice(0, 1000);

    if (reason.length < 3) {
      return fail(
        "환불 사유를 입력해주세요.",
        400
      );
    }

    const {
      data: payment,
      error: paymentError,
    } = await ctx.db
      .from("payments")
      .select("id, company_id, subscription_id, status")
      .eq("id", paymentId)
      .eq("company_id", ctx.companyId)
      .maybeSingle();

    if (paymentError) throw paymentError;

    if (!payment || payment.status !== "paid") {
      return fail(
        "환불 가능한 결제 내역을 찾을 수 없습니다.",
        404
      );
    }

    const {
      data: existing,
      error: existingError,
    } = await ctx.db
      .from("billing_events")
      .select("id")
      .eq("payment_id", payment.id)
      .eq("event_type", "refund_requested")
      .limit(1);

    if (existingError) throw existingError;

    if (existing?.length) {
      return NextResponse.json({
        ok: true,
        alreadyRequested: true,
      });
    }

    const {
      data: event,
      error: eventError,
    } = await ctx.db
      .from("billing_events")
      .insert({
        company_id: ctx.companyId,
        subscription_id: payment.subscription_id,
        payment_id: payment.id,
        event_type: "refund_requested",
        provider: "toss",
        event_data: {
          reason,
          requested_by: ctx.user.id,
        },
      })
      .select("id")
      .single();

    if (eventError) throw eventError;

    const { data: admins } = await ctx.db
      .from("super_admins")
      .select("user_id")
      .eq("is_active", true);

    for (const admin of admins || []) {
      await ctx.db.from("notifications").insert({
        company_id: ctx.companyId,
        recipient_type: "super_admin",
        recipient_user_id: admin.user_id,
        recipient_worker_id: null,
        type: "refund_requested",
        priority: "warning",
        title: "환불 요청",
        message: "결제 환불 요청이 접수되었습니다.",
        link: "/super-admin/billing",
        reference_type: "payment",
        reference_id: payment.id,
        dedupe_key:
          `refund_requested:${event.id}:${admin.user_id}`,
        is_read: false,
        push_sent: false,
      });
    }

    return NextResponse.json({
      ok: true,
      requestId: event.id,
    });
  } catch (error) {
    console.error("[billing/refunds POST]", error);

    return fail(
      "환불 요청을 처리하지 못했습니다. 결제 내역을 확인해주세요.",
      500
    );
  }
}
