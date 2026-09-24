import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { payWithTossBillingKey } from "../../../utils/tossBilling";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_HOURS = 24;
const BATCH_LIMIT = 20;

/* =========================================================
   Supabase Service Role
========================================================= */

function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/* =========================================================
   CRON 인증
========================================================= */

function verifyCronSecret(request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    throw new Error("CRON_SECRET 환경변수가 없습니다.");
  }

  const authorization = request.headers.get("authorization") || "";
  return authorization === `Bearer ${cronSecret}`;
}

/* =========================================================
   날짜 유틸
========================================================= */

function addOneMonthClamped(dateValue) {
  const source = new Date(dateValue);

  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const hour = source.getUTCHours();
  const minute = source.getUTCMinutes();
  const second = source.getUTCSeconds();
  const millisecond = source.getUTCMilliseconds();

  const targetFirst = new Date(
    Date.UTC(
      year,
      month + 1,
      1,
      hour,
      minute,
      second,
      millisecond,
    ),
  );

  const lastDay = new Date(
    Date.UTC(
      targetFirst.getUTCFullYear(),
      targetFirst.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();

  targetFirst.setUTCDate(Math.min(day, lastDay));

  return targetFirst;
}

function addHours(dateValue, hours) {
  const date = new Date(dateValue);
  date.setTime(date.getTime() + hours * 60 * 60 * 1000);
  return date;
}

/* =========================================================
   주문번호
========================================================= */

function createBillingStamp(nextBillingAt) {
  const billingDate = new Date(nextBillingAt);

  return [
    billingDate.getUTCFullYear(),
    String(billingDate.getUTCMonth() + 1).padStart(2, "0"),
    String(billingDate.getUTCDate()).padStart(2, "0"),
    String(billingDate.getUTCHours()).padStart(2, "0"),
    String(billingDate.getUTCMinutes()).padStart(2, "0"),
  ].join("");
}

function createRenewalOrderId(subscriptionId, nextBillingAt, retryNumber = 0) {
  const stamp = createBillingStamp(nextBillingAt);

  if (retryNumber > 0) {
    return `renew_${subscriptionId}_${stamp}_retry${retryNumber}`;
  }

  return `renew_${subscriptionId}_${stamp}`;
}

/* =========================================================
   알림
========================================================= */

async function createPaymentNotifications({
  admin,
  company,
  plan,
  payment,
  success,
  errorMessage = "",
  retryNumber = 0,
  finalFailure = false,
}) {
  try {
    const { data: owners, error: ownerError } = await admin
      .from("profiles")
      .select("id")
      .eq("company_id", company.id)
      .eq("role", "owner")
      .eq("is_active", true);

    if (ownerError) {
      console.error("[billing/renew] owner lookup error:", ownerError);
    }

    for (const owner of owners || []) {
      const suffix =
        retryNumber > 0 ? `:retry${retryNumber}` : ":initial";

      const dedupeKey = success
        ? `renewal_success:${payment.order_id}:${owner.id}${suffix}`
        : `renewal_failed:${payment.order_id}:${owner.id}${suffix}`;

      let title;
      let message;

      if (success) {
        title =
          retryNumber > 0
            ? "💳 재결제가 완료되었습니다."
            : "💳 정기결제가 완료되었습니다.";

        message =
          `${plan.plan_name} 요금제 ` +
          `${Number(payment.amount_krw).toLocaleString("ko-KR")}원 ` +
          `${retryNumber > 0 ? "재결제" : "정기결제"}가 완료되었습니다.`;
      } else if (finalFailure) {
        title = "🚨 정기결제 최종 실패";

        message =
          `${plan.plan_name} 요금제 자동 재결제가 ` +
          `${MAX_RETRY_COUNT}회 모두 실패했습니다.` +
          `${errorMessage ? `\n${errorMessage}` : ""}` +
          "\n결제수단을 확인해 주세요.";
      } else if (retryNumber > 0) {
        title = `🚨 정기결제 재시도 ${retryNumber}회 실패`;

        message =
          `${plan.plan_name} 요금제 재결제에 실패했습니다.` +
          `${errorMessage ? `\n${errorMessage}` : ""}` +
          (retryNumber < MAX_RETRY_COUNT
            ? `\n약 ${RETRY_DELAY_HOURS}시간 후 다시 시도합니다.`
            : "");
      } else {
        title = "🚨 정기결제에 실패했습니다.";

        message =
          `${plan.plan_name} 요금제 정기결제에 실패했습니다.` +
          `${errorMessage ? `\n${errorMessage}` : ""}` +
          `\n약 ${RETRY_DELAY_HOURS}시간 후 자동으로 다시 시도합니다.`;
      }

      const { error: notificationError } = await admin
        .from("notifications")
        .insert({
          company_id: company.id,
          recipient_type: "company_admin",
          recipient_user_id: owner.id,
          recipient_worker_id: null,
          type: success ? "payment_success" : "payment_failed",
          priority: success ? "success" : "critical",
          title,
          message,
          link: "/admin/billing",
          reference_type: "payment",
          reference_id: payment.id,
          dedupe_key: dedupeKey,
          is_read: false,
          push_sent: false,
        });

      if (notificationError && notificationError.code !== "23505") {
        console.error(
          "[billing/renew] company notification error:",
          notificationError,
        );
      }
    }

    const { data: superAdmins, error: superAdminError } = await admin
      .from("super_admins")
      .select("user_id")
      .eq("is_active", true);

    if (superAdminError) {
      console.error(
        "[billing/renew] super admin lookup error:",
        superAdminError,
      );
    }

    for (const superAdmin of superAdmins || []) {
      const suffix =
        retryNumber > 0 ? `:retry${retryNumber}` : ":initial";

      const dedupeKey = success
        ? `renewal_success:${payment.order_id}:super_admin:${superAdmin.user_id}${suffix}`
        : `renewal_failed:${payment.order_id}:super_admin:${superAdmin.user_id}${suffix}`;

      let title;
      let message;

      if (success) {
        title =
          retryNumber > 0
            ? "💳 업체 재결제 완료"
            : "💳 업체 정기결제 완료";

        message =
          `${company.company_name}\n` +
          `${plan.plan_name} ` +
          `${Number(payment.amount_krw).toLocaleString("ko-KR")}원 ` +
          `${retryNumber > 0 ? "재결제" : "정기결제"}가 완료되었습니다.`;
      } else if (finalFailure) {
        title = "🚨 업체 정기결제 최종 실패";

        message =
          `${company.company_name}\n` +
          `${plan.plan_name} 자동 재결제가 ` +
          `${MAX_RETRY_COUNT}회 모두 실패했습니다.` +
          `${errorMessage ? `\n${errorMessage}` : ""}`;
      } else if (retryNumber > 0) {
        title = `🚨 업체 재결제 ${retryNumber}회 실패`;

        message =
          `${company.company_name}\n` +
          `${plan.plan_name} 재결제에 실패했습니다.` +
          `${errorMessage ? `\n${errorMessage}` : ""}` +
          (retryNumber < MAX_RETRY_COUNT
            ? `\n약 ${RETRY_DELAY_HOURS}시간 후 다시 시도합니다.`
            : "");
      } else {
        title = "🚨 업체 정기결제 실패";

        message =
          `${company.company_name}\n` +
          `${plan.plan_name} 정기결제에 실패했습니다.` +
          `${errorMessage ? `\n${errorMessage}` : ""}` +
          `\n약 ${RETRY_DELAY_HOURS}시간 후 자동 재시도합니다.`;
      }

      const { error: notificationError } = await admin
        .from("notifications")
        .insert({
          company_id: company.id,
          recipient_type: "super_admin",
          recipient_user_id: superAdmin.user_id,
          recipient_worker_id: null,
          type: success ? "payment_success" : "payment_failed",
          priority: success ? "success" : "critical",
          title,
          message,
          link: "/super-admin/billing",
          reference_type: "payment",
          reference_id: payment.id,
          dedupe_key: dedupeKey,
          is_read: false,
          push_sent: false,
        });

      if (notificationError && notificationError.code !== "23505") {
        console.error(
          "[billing/renew] super notification error:",
          notificationError,
        );
      }
    }
  } catch (error) {
    /*
     * 알림 오류 때문에 실제 결제 결과를 실패 처리하지 않습니다.
     */
    console.error("[billing/renew] notification error:", error);
  }
}

/* =========================================================
   Billing Event
========================================================= */

async function createBillingEvent({
  admin,
  companyId,
  subscriptionId,
  paymentId,
  eventType,
  eventData,
}) {
  try {
    const { error } = await admin.from("billing_events").insert({
      company_id: companyId,
      subscription_id: subscriptionId || null,
      payment_id: paymentId || null,
      event_type: eventType,
      provider: "toss",
      event_data: eventData || {},
    });

    if (error) {
      console.error("[billing/renew] billing event error:", error);
    }
  } catch (error) {
    console.error("[billing/renew] billing event exception:", error);
  }
}

/* =========================================================
   회사
========================================================= */

async function getCompany(admin, companyId) {
  const { data, error } = await admin
    .from("companies")
    .select(`
      id,
      company_name,
      subscription_plan,
      is_active
    `)
    .eq("id", companyId)
    .maybeSingle();

  if (error) {
    throw new Error("업체 정보를 확인하지 못했습니다.");
  }

  if (!data) {
    throw new Error("업체를 찾을 수 없습니다.");
  }

  return data;
}

/* =========================================================
   요금제
========================================================= */

async function getPlan(admin, planCode) {
  const { data, error } = await admin
    .from("subscription_plans")
    .select(`
      plan_code,
      plan_name,
      monthly_price_krw,
      is_active
    `)
    .ilike("plan_code", planCode)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error("요금제 정보를 확인하지 못했습니다.");
  }

  if (!data) {
    throw new Error("사용 가능한 요금제를 찾을 수 없습니다.");
  }

  return data;
}

/* =========================================================
   결제수단
========================================================= */

async function getBillingCustomer(admin, companyId) {
  const { data, error } = await admin
    .from("billing_customers")
    .select(`
      id,
      company_id,
      provider,
      customer_key,
      billing_key,
      is_active
    `)
    .eq("company_id", companyId)
    .eq("provider", "toss")
    .maybeSingle();

  if (error) {
    throw new Error("결제수단 정보를 확인하지 못했습니다.");
  }

  if (!data || !data.billing_key || data.is_active === false) {
    throw new Error("등록된 결제수단이 없습니다.");
  }

  return data;
}

/* =========================================================
   Payment 조회
========================================================= */

async function getPaymentByOrderId(admin, orderId) {
  const { data, error } = await admin
    .from("payments")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error("기존 정기결제 기록을 확인하지 못했습니다.");
  }

  return data;
}

/* =========================================================
   Pending Payment 생성
========================================================= */

async function getOrCreatePendingPayment({
  admin,
  subscription,
  company,
  plan,
  amount,
  orderId,
  retryNumber,
}) {
  const existingPayment = await getPaymentByOrderId(admin, orderId);

  if (existingPayment) {
    return {
      payment: existingPayment,
      existing: true,
    };
  }

  const { data, error } = await admin
    .from("payments")
    .insert({
      company_id: company.id,
      subscription_id: subscription.id,
      provider: "toss",
      order_id: orderId,
      payment_key: null,
      plan_code: plan.plan_code,
      amount_krw: amount,
      status: "pending",
      payment_type: "renewal",
      failure_code: null,
      failure_message: null,
      paid_at: null,
      metadata: {
        source: "automatic_renewal",
        subscription_id: subscription.id,
        scheduled_billing_at: subscription.next_billing_at,
        is_retry: retryNumber > 0,
        retry_number: retryNumber,
      },
    })
    .select("*")
    .single();

  if (!error) {
    return {
      payment: data,
      existing: false,
    };
  }

  /*
   * 동시에 Cron 두 개가 실행됐을 때
   * payments.order_id UNIQUE가 마지막 방어선입니다.
   */
  if (error.code === "23505") {
    const concurrentPayment = await getPaymentByOrderId(admin, orderId);

    if (!concurrentPayment) {
      throw new Error("정기결제 중복 요청을 확인하지 못했습니다.");
    }

    return {
      payment: concurrentPayment,
      existing: true,
    };
  }

  throw new Error("정기결제 기록을 생성하지 못했습니다.");
}

/* =========================================================
   성공 후 구독 갱신
========================================================= */

async function completeSuccessfulRenewal({
  admin,
  subscription,
  company,
  plan,
  paymentRow,
  tossPayment,
  retryNumber,
}) {
  const amount = Number(plan.monthly_price_krw);

  const paymentKey = tossPayment?.paymentKey || null;
  const paidAt = tossPayment?.approvedAt || new Date().toISOString();

  const periodStart = new Date(paidAt);
  const periodEnd = addOneMonthClamped(periodStart);

  /*
   * 결제 성공 시 past_due 여부와 관계없이 active 복구.
   * 재시도 상태도 전부 초기화.
   */
  const { data: updatedSubscription, error: subscriptionUpdateError } =
    await admin
      .from("subscriptions")
      .update({
        plan_code: plan.plan_code,
        status: "active",
        monthly_price_krw: amount,
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        next_billing_at: periodEnd.toISOString(),
        cancel_at_period_end: false,
        canceled_at: null,
        payment_retry_count: 0,
        last_payment_retry_at: null,
        next_payment_retry_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscription.id)
      .eq("company_id", company.id)
      .select("*")
      .single();

  if (subscriptionUpdateError) {
    throw new Error("정기결제 후 구독기간을 갱신하지 못했습니다.");
  }

  const { data: paidPayment, error: paidPaymentError } = await admin
    .from("payments")
    .update({
      subscription_id: updatedSubscription.id,
      payment_key: paymentKey,
      status: "paid",
      failure_code: null,
      failure_message: null,
      paid_at: paidAt,
      metadata: {
        source: "automatic_renewal",
        subscription_id: subscription.id,
        scheduled_billing_at: subscription.next_billing_at,
        is_retry: retryNumber > 0,
        retry_number: retryNumber,
        toss_status: tossPayment?.status || null,
        method: tossPayment?.method || null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentRow.id)
    .select("*")
    .single();

  if (paidPaymentError) {
    throw new Error("정기결제 성공 기록을 저장하지 못했습니다.");
  }

  const { error: companyPlanError } = await admin
    .from("companies")
    .update({
      subscription_plan: plan.plan_code,
      updated_at: new Date().toISOString(),
    })
    .eq("id", company.id);

  if (companyPlanError) {
    throw new Error("업체 요금제를 동기화하지 못했습니다.");
  }

  await createBillingEvent({
    admin,
    companyId: company.id,
    subscriptionId: updatedSubscription.id,
    paymentId: paidPayment.id,
    eventType:
      retryNumber > 0
        ? "renewal_retry_payment_succeeded"
        : "renewal_payment_succeeded",
    eventData: {
      order_id: paidPayment.order_id,
      plan_code: plan.plan_code,
      amount_krw: amount,
      retry_number: retryNumber,
      previous_billing_at: subscription.next_billing_at,
      next_billing_at: updatedSubscription.next_billing_at,
    },
  });

  await createPaymentNotifications({
    admin,
    company,
    plan,
    payment: paidPayment,
    success: true,
    retryNumber,
  });

  return {
    ok: true,
    renewed: true,
    retryNumber,
    companyId: company.id,
    companyName: company.company_name,
    subscriptionId: updatedSubscription.id,
    paymentId: paidPayment.id,
    orderId: paidPayment.order_id,
    planCode: plan.plan_code,
    amount: paidPayment.amount_krw,
    paidAt: paidPayment.paid_at,
    nextBillingAt: updatedSubscription.next_billing_at,
  };
}

/* =========================================================
   확정 결제 실패
========================================================= */

async function saveDefiniteFailure({
  admin,
  subscription,
  company,
  plan,
  paymentRow,
  error,
  orderId,
  retryNumber,
}) {
  const now = new Date();

  const { data: failedPayment, error: failedPaymentError } = await admin
    .from("payments")
    .update({
      status: "failed",
      failure_code: error?.code || "RENEWAL_PAYMENT_FAILED",
      failure_message: error?.message || "정기결제에 실패했습니다.",
      updated_at: now.toISOString(),
    })
    .eq("id", paymentRow.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (failedPaymentError) {
    throw new Error("결제 실패 기록을 저장하지 못했습니다.");
  }

  const savedPayment = failedPayment || paymentRow;

  /*
   * 최초 결제 실패:
   * retry_count는 아직 0.
   * 24시간 후 retry1 예약.
   *
   * 재시도 실패:
   * retry_count = 실제 실행한 재시도 횟수.
   */
  const newRetryCount = retryNumber;

  const finalFailure = retryNumber >= MAX_RETRY_COUNT;

  const nextRetryAt = finalFailure
    ? null
    : addHours(now, RETRY_DELAY_HOURS).toISOString();

  const subscriptionUpdate = {
    status: "past_due",
    payment_retry_count: newRetryCount,
    next_payment_retry_at: nextRetryAt,
    updated_at: now.toISOString(),
  };

  if (retryNumber > 0) {
    subscriptionUpdate.last_payment_retry_at = now.toISOString();
  }

  const { error: subscriptionError } = await admin
    .from("subscriptions")
    .update(subscriptionUpdate)
    .eq("id", subscription.id);

  if (subscriptionError) {
    throw new Error("결제 실패 후 구독 상태를 저장하지 못했습니다.");
  }

  await createBillingEvent({
    admin,
    companyId: company.id,
    subscriptionId: subscription.id,
    paymentId: savedPayment.id,
    eventType: finalFailure
      ? "renewal_retry_exhausted"
      : retryNumber > 0
        ? "renewal_retry_payment_failed"
        : "renewal_payment_failed",
    eventData: {
      order_id: orderId,
      plan_code: plan.plan_code,
      amount_krw: Number(plan.monthly_price_krw),
      retry_number: retryNumber,
      max_retry_count: MAX_RETRY_COUNT,
      next_payment_retry_at: nextRetryAt,
      error_code: error?.code || "RENEWAL_PAYMENT_FAILED",
      error_message: error?.message || "정기결제에 실패했습니다.",
    },
  });

  await createPaymentNotifications({
    admin,
    company,
    plan,
    payment: savedPayment,
    success: false,
    errorMessage: error?.message || "정기결제에 실패했습니다.",
    retryNumber,
    finalFailure,
  });

  return {
    payment: savedPayment,
    finalFailure,
    nextRetryAt,
    retryCount: newRetryCount,
  };
}

/* =========================================================
   한 구독 결제 처리
========================================================= */

async function renewOneSubscription({
  admin,
  subscription,
  dryRun,
}) {
  let company = null;
  let plan = null;
  let paymentRow = null;

  /*
   * active = 최초 정기결제
   * past_due = 자동 재시도
   */
  const isRetry = subscription.status === "past_due";

  const previousRetryCount = Number(subscription.payment_retry_count || 0);

  /*
   * past_due라면 이번 실행이 몇 번째 재시도인지 계산.
   */
  const retryNumber = isRetry ? previousRetryCount + 1 : 0;

  if (isRetry && retryNumber > MAX_RETRY_COUNT) {
    return {
      ok: false,
      skipped: true,
      reason: "retry_exhausted",
      companyId: subscription.company_id,
      subscriptionId: subscription.id,
      retryCount: previousRetryCount,
    };
  }

  const orderId = createRenewalOrderId(
    subscription.id,
    subscription.next_billing_at,
    retryNumber,
  );

  company = await getCompany(admin, subscription.company_id);

  if (company.is_active === false) {
    return {
      ok: false,
      skipped: true,
      reason: "inactive_company",
      companyId: company.id,
      companyName: company.company_name,
    };
  }

  plan = await getPlan(admin, subscription.plan_code);

  if (String(plan.plan_code).toLowerCase() === "trial") {
    return {
      ok: false,
      skipped: true,
      reason: "trial_plan",
      companyId: company.id,
      companyName: company.company_name,
    };
  }

  const amount = Number(plan.monthly_price_krw);

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("요금제 금액이 올바르지 않습니다.");
  }

  const billingCustomer = await getBillingCustomer(admin, company.id);

  const existingPayment = await getPaymentByOrderId(admin, orderId);

  /*
   * 동일 재시도 주문이 이미 성공했다면 절대 재청구하지 않음.
   */
  if (existingPayment?.status === "paid") {
    return {
      ok: true,
      skipped: true,
      alreadyPaid: true,
      reason: "already_paid",
      retryNumber,
      companyId: company.id,
      companyName: company.company_name,
      orderId,
      paymentId: existingPayment.id,
    };
  }

  /*
   * 동일 retry 주문이 확정 실패했다면 같은 order_id로
   * Toss에 다시 보내지 않습니다.
   */
  if (existingPayment?.status === "failed") {
    return {
      ok: false,
      skipped: true,
      reason: "already_failed",
      retryNumber,
      companyId: company.id,
      companyName: company.company_name,
      orderId,
      paymentId: existingPayment.id,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      eligible: true,
      isRetry,
      retryNumber,
      companyId: company.id,
      companyName: company.company_name,
      subscriptionId: subscription.id,
      planCode: plan.plan_code,
      planName: plan.plan_name,
      amount,
      nextBillingAt: subscription.next_billing_at,
      nextPaymentRetryAt: subscription.next_payment_retry_at || null,
      orderId,
      hasBillingKey: true,
    };
  }

  const paymentResult = await getOrCreatePendingPayment({
    admin,
    subscription,
    company,
    plan,
    amount,
    orderId,
    retryNumber,
  });

  paymentRow = paymentResult.payment;

  if (paymentRow.status === "paid") {
    return {
      ok: true,
      skipped: true,
      alreadyPaid: true,
      reason: "already_paid",
      retryNumber,
      companyId: company.id,
      companyName: company.company_name,
      orderId,
      paymentId: paymentRow.id,
    };
  }

  if (paymentRow.status === "failed") {
    return {
      ok: false,
      skipped: true,
      reason: "already_failed",
      retryNumber,
      companyId: company.id,
      companyName: company.company_name,
      orderId,
      paymentId: paymentRow.id,
    };
  }

  /*
   * 재시도를 실제 실행하기 직전에도 last retry 기록.
   * Toss 호출 전에 기록해 실행 시점을 추적합니다.
   */
  if (isRetry) {
    const { error: retryStartError } = await admin
      .from("subscriptions")
      .update({
        last_payment_retry_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscription.id);

    if (retryStartError) {
      throw new Error("재결제 실행 정보를 저장하지 못했습니다.");
    }
  }

  try {
    const tossPayment = await payWithTossBillingKey({
      billingKey: billingCustomer.billing_key,
      customerKey: billingCustomer.customer_key,
      amount,
      orderId,
      orderName:
        retryNumber > 0
          ? `${plan.plan_name} 월 정기구독 재결제`
          : `${plan.plan_name} 월 정기구독`,
      idempotencyKey: orderId,
    });

    return await completeSuccessfulRenewal({
      admin,
      subscription,
      company,
      plan,
      paymentRow,
      tossPayment,
      retryNumber,
    });
  } catch (error) {
    const errorStatus = Number(error?.status);

    /*
     * Toss 4xx만 확정 실패.
     * 5xx / network는 승인 여부가 불명확할 수 있으므로
     * 기존과 동일하게 pending 유지.
     */
    const definiteFailure =
      errorStatus >= 400 &&
      errorStatus < 500;

    if (paymentRow?.id && definiteFailure) {
      try {
        const failureResult = await saveDefiniteFailure({
          admin,
          subscription,
          company,
          plan,
          paymentRow,
          error,
          orderId,
          retryNumber,
        });

        paymentRow = failureResult.payment;

        return {
          ok: false,
          retryable: !failureResult.finalFailure,
          finalFailure: failureResult.finalFailure,
          retryNumber,
          retryCount: failureResult.retryCount,
          nextPaymentRetryAt: failureResult.nextRetryAt,
          companyId: company.id,
          companyName: company.company_name,
          subscriptionId: subscription.id,
          paymentId: paymentRow?.id || null,
          orderId,
          error: error?.message || "정기결제에 실패했습니다.",
          code: error?.code || "RENEWAL_CHARGE_ERROR",
        };
      } catch (failureSaveError) {
        console.error(
          "[billing/renew] failure save error:",
          failureSaveError,
        );

        return {
          ok: false,
          retryable: false,
          companyId: company.id,
          companyName: company.company_name,
          subscriptionId: subscription.id,
          paymentId: paymentRow?.id || null,
          orderId,
          error:
            failureSaveError?.message ||
            "결제 실패 상태 저장 중 오류가 발생했습니다.",
          code: "RENEWAL_FAILURE_SAVE_ERROR",
        };
      }
    }

    /*
     * 여기부터는 5xx / network 등 결과 불확실.
     * payment는 pending 유지.
     */
    if (!definiteFailure && paymentRow?.id) {
      await createBillingEvent({
        admin,
        companyId: company.id,
        subscriptionId: subscription.id,
        paymentId: paymentRow.id,
        eventType: "renewal_payment_result_uncertain",
        eventData: {
          order_id: orderId,
          plan_code: plan.plan_code,
          amount_krw: amount,
          retry_number: retryNumber,
          error_code:
            error?.code || "RENEWAL_RESULT_UNCERTAIN",
          error_message:
            error?.message ||
            "정기결제 결과를 확인하지 못했습니다.",
        },
      });
    }

    return {
      ok: false,
      retryable: !definiteFailure,
      resultUncertain: !definiteFailure,
      retryNumber,
      companyId: company?.id || subscription.company_id,
      companyName: company?.company_name || null,
      subscriptionId: subscription.id,
      paymentId: paymentRow?.id || null,
      orderId,
      error: definiteFailure
        ? error?.message || "정기결제에 실패했습니다."
        : "정기결제 결과를 확인하지 못했습니다.",
      code: error?.code || "RENEWAL_CHARGE_ERROR",
    };
  }
      }
/* =========================================================
   active 결제 대상 조회
========================================================= */

async function getDueActiveSubscriptions(admin, now) {
  const { data, error } = await admin
    .from("subscriptions")
    .select(`
      id,
      company_id,
      plan_code,
      status,
      monthly_price_krw,
      started_at,
      current_period_start,
      current_period_end,
      next_billing_at,
      cancel_at_period_end,
      canceled_at,
      payment_retry_count,
      last_payment_retry_at,
      next_payment_retry_at,
      created_at,
      updated_at
    `)
    .eq("status", "active")
    .eq("cancel_at_period_end", false)
    .not("next_billing_at", "is", null)
    .lte("next_billing_at", now.toISOString())
    .order("next_billing_at", {
      ascending: true,
    })
    .limit(BATCH_LIMIT);

  if (error) {
    throw new Error(
      `정기결제 대상 조회 실패: ${error.message}`,
    );
  }

  return data || [];
}

/* =========================================================
   past_due 재결제 대상 조회
========================================================= */

async function getDueRetrySubscriptions(admin, now) {
  const { data, error } = await admin
    .from("subscriptions")
    .select(`
      id,
      company_id,
      plan_code,
      status,
      monthly_price_krw,
      started_at,
      current_period_start,
      current_period_end,
      next_billing_at,
      cancel_at_period_end,
      canceled_at,
      payment_retry_count,
      last_payment_retry_at,
      next_payment_retry_at,
      created_at,
      updated_at
    `)
    .eq("status", "past_due")
    .eq("cancel_at_period_end", false)
    .not("next_billing_at", "is", null)
    .not("next_payment_retry_at", "is", null)
    .lt("payment_retry_count", MAX_RETRY_COUNT)
    .lte("next_payment_retry_at", now.toISOString())
    .order("next_payment_retry_at", {
      ascending: true,
    })
    .limit(BATCH_LIMIT);

  if (error) {
    throw new Error(
      `재결제 대상 조회 실패: ${error.message}`,
    );
  }

  return data || [];
}

/* =========================================================
   대상 병합
========================================================= */

function mergeSubscriptions(activeSubscriptions, retrySubscriptions) {
  const map = new Map();

  for (const subscription of activeSubscriptions || []) {
    map.set(subscription.id, subscription);
  }

  for (const subscription of retrySubscriptions || []) {
    map.set(subscription.id, subscription);
  }

  /*
   * 재결제 대상이 먼저 처리되도록 정렬.
   * 그 다음 결제 예정시각 순서.
   */
  return Array.from(map.values())
    .sort((a, b) => {
      const aTime =
        a.status === "past_due"
          ? new Date(a.next_payment_retry_at || 0).getTime()
          : new Date(a.next_billing_at || 0).getTime();

      const bTime =
        b.status === "past_due"
          ? new Date(b.next_payment_retry_at || 0).getTime()
          : new Date(b.next_billing_at || 0).getTime();

      return aTime - bTime;
    })
    .slice(0, BATCH_LIMIT);
}

/* =========================================================
   공통 실행
========================================================= */

async function runRenewal(request) {
  /*
   * 반드시 CRON_SECRET부터 확인.
   */
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const admin = getAdminSupabase();

  const requestUrl = new URL(request.url);

  const dryRunValue = String(
    requestUrl.searchParams.get("dryRun") || "",
  ).toLowerCase();

  const dryRun =
    dryRunValue === "1" ||
    dryRunValue === "true";

  const now = new Date();

  /*
   * 최초 정기결제 대상 + 실패 재시도 대상
   * 두 그룹을 별도로 조회합니다.
   *
   * Supabase OR 조건을 복잡하게 만들지 않고
   * 상태별로 명확하게 조회합니다.
   */
  const [
    activeSubscriptions,
    retrySubscriptions,
  ] = await Promise.all([
    getDueActiveSubscriptions(admin, now),
    getDueRetrySubscriptions(admin, now),
  ]);

  const subscriptions = mergeSubscriptions(
    activeSubscriptions,
    retrySubscriptions,
  );

  if (subscriptions.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        dryRun,
        checkedAt: now.toISOString(),

        eligible: 0,
        activeEligible: 0,
        retryEligible: 0,

        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,

        results: [],
      },
      {
        status: 200,
      },
    );
  }

  /*
   * 결제 API이므로 순차 처리.
   * Promise.all로 카드결제를 동시에 실행하지 않습니다.
   */
  const results = [];

  for (const subscription of subscriptions) {
    try {
      const result = await renewOneSubscription({
        admin,
        subscription,
        dryRun,
      });

      results.push(result);
    } catch (error) {
      console.error(
        "[billing/renew] subscription error:",
        subscription.id,
        error,
      );

      results.push({
        ok: false,
        subscriptionId: subscription.id,
        companyId: subscription.company_id,
        isRetry:
          subscription.status === "past_due",
        error:
          error?.message ||
          "정기결제 처리 중 오류가 발생했습니다.",
      });
    }
  }

  const succeeded = results.filter(
    (item) => item?.renewed === true,
  ).length;

  const failed = results.filter(
    (item) =>
      item?.ok === false &&
      item?.skipped !== true,
  ).length;

  const skipped = results.filter(
    (item) => item?.skipped === true,
  ).length;

  const retryProcessed = results.filter(
    (item) =>
      Number(item?.retryNumber || 0) > 0,
  ).length;

  const finalFailures = results.filter(
    (item) => item?.finalFailure === true,
  ).length;

  return NextResponse.json(
    {
      /*
       * 실제 결제 실패가 하나라도 있으면
       * Multi-Status 207을 반환합니다.
       */
      ok: failed === 0,

      dryRun,

      checkedAt: now.toISOString(),

      eligible: subscriptions.length,

      activeEligible:
        activeSubscriptions.length,

      retryEligible:
        retrySubscriptions.length,

      processed: results.length,

      retryProcessed,

      succeeded,

      failed,

      finalFailures,

      skipped,

      results,
    },
    {
      status:
        failed === 0
          ? 200
          : 207,
    },
  );
}

/* =========================================================
   GET
   Cron / dry-run
========================================================= */

export async function GET(request) {
  try {
    return await runRenewal(request);
  } catch (error) {
    console.error(
      "[billing/renew] GET error:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "정기결제 처리 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
}

/* =========================================================
   POST
   서버 수동 실행
========================================================= */

export async function POST(request) {
  try {
    return await runRenewal(request);
  } catch (error) {
    console.error(
      "[billing/renew] POST error:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "정기결제 처리 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
    }
