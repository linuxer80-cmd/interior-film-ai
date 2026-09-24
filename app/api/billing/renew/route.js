import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  payWithTossBillingKey,
} from "../../../utils/tossBilling";

export const runtime = "nodejs";
export const maxDuration = 60;


/*
 * =========================================================
 * Supabase Service Role Client
 * =========================================================
 */

function getAdminSupabase() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.",
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}


/*
 * =========================================================
 * CRON 인증
 *
 * Authorization: Bearer {CRON_SECRET}
 * =========================================================
 */

function verifyCronSecret(request) {
  const cronSecret =
    process.env.CRON_SECRET;

  if (!cronSecret) {
    throw new Error(
      "CRON_SECRET 환경변수가 없습니다.",
    );
  }

  const authorization =
    request.headers.get("authorization") || "";

  const expected =
    `Bearer ${cronSecret}`;

  return authorization === expected;
}


/*
 * =========================================================
 * 다음 달 날짜
 *
 * 월말 overflow 방지
 * 1/31 -> 2월 마지막 날
 * =========================================================
 */

function addOneMonthClamped(dateValue) {
  const source =
    new Date(dateValue);

  const year =
    source.getUTCFullYear();

  const month =
    source.getUTCMonth();

  const day =
    source.getUTCDate();

  const hour =
    source.getUTCHours();

  const minute =
    source.getUTCMinutes();

  const second =
    source.getUTCSeconds();

  const millisecond =
    source.getUTCMilliseconds();

  const targetFirst =
    new Date(
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

  const lastDay =
    new Date(
      Date.UTC(
        targetFirst.getUTCFullYear(),
        targetFirst.getUTCMonth() + 1,
        0,
      ),
    ).getUTCDate();

  targetFirst.setUTCDate(
    Math.min(day, lastDay),
  );

  return targetFirst;
}


/*
 * =========================================================
 * 정기결제 Order ID
 *
 * subscription.id + 결제 예정시각을 사용합니다.
 *
 * 같은 결제기간에 Cron이 여러 번 실행되어도
 * 항상 동일한 order_id가 생성됩니다.
 *
 * payments.order_id UNIQUE와
 * Toss Idempotency-Key를 함께 사용합니다.
 * =========================================================
 */

function createRenewalOrderId(
  subscriptionId,
  nextBillingAt,
) {
  const billingDate =
    new Date(nextBillingAt);

  const stamp = [
    billingDate.getUTCFullYear(),
    String(
      billingDate.getUTCMonth() + 1,
    ).padStart(2, "0"),
    String(
      billingDate.getUTCDate(),
    ).padStart(2, "0"),
    String(
      billingDate.getUTCHours(),
    ).padStart(2, "0"),
    String(
      billingDate.getUTCMinutes(),
    ).padStart(2, "0"),
  ].join("");

  return `renew_${subscriptionId}_${stamp}`;
}


/*
 * =========================================================
 * 결제 알림
 *
 * 업체 owner + 활성 슈퍼관리자
 * =========================================================
 */

async function createPaymentNotifications({
  admin,
  company,
  plan,
  payment,
  success,
  errorMessage = "",
}) {
  try {
    /*
     * 업체 관리자
     */

    const {
      data: owners,
      error: ownerError,
    } =
      await admin
        .from("profiles")
        .select("id")
        .eq(
          "company_id",
          company.id,
        )
        .eq(
          "role",
          "owner",
        )
        .eq(
          "is_active",
          true,
        );

    if (ownerError) {
      console.error(
        "[billing/renew] owner lookup error:",
        ownerError,
      );
    }

    for (const owner of owners || []) {
      const dedupeKey =
        success
          ? `renewal_success:${payment.order_id}:${owner.id}`
          : `renewal_failed:${payment.order_id}:${owner.id}`;

      const {
        error: notificationError,
      } =
        await admin
          .from("notifications")
          .insert({
            company_id:
              company.id,

            recipient_type:
              "company_admin",

            recipient_user_id:
              owner.id,

            recipient_worker_id:
              null,

            type:
              success
                ? "payment_success"
                : "payment_failed",

            priority:
              success
                ? "success"
                : "critical",

            title:
              success
                ? "💳 정기결제가 완료되었습니다."
                : "🚨 정기결제에 실패했습니다.",

            message:
              success
                ? `${plan.plan_name} 요금제 ${Number(
                    payment.amount_krw,
                  ).toLocaleString(
                    "ko-KR",
                  )}원 정기결제가 완료되었습니다.`
                : `${plan.plan_name} 요금제 정기결제에 실패했습니다.${
                    errorMessage
                      ? `\n${errorMessage}`
                      : ""
                  }`,

            link:
              "/admin/billing",

            reference_type:
              "payment",

            reference_id:
              payment.id,

            dedupe_key:
              dedupeKey,

            is_read:
              false,

            push_sent:
              false,
          });

      if (
        notificationError &&
        notificationError.code !== "23505"
      ) {
        console.error(
          "[billing/renew] company notification error:",
          notificationError,
        );
      }
    }


    /*
     * 슈퍼관리자
     */

    const {
      data: superAdmins,
      error: superAdminError,
    } =
      await admin
        .from("super_admins")
        .select("user_id")
        .eq(
          "is_active",
          true,
        );

    if (superAdminError) {
      console.error(
        "[billing/renew] super admin lookup error:",
        superAdminError,
      );
    }

    for (
      const superAdmin
      of superAdmins || []
    ) {
      const dedupeKey =
        success
          ? `renewal_success:${payment.order_id}:super_admin:${superAdmin.user_id}`
          : `renewal_failed:${payment.order_id}:super_admin:${superAdmin.user_id}`;

      const {
        error: notificationError,
      } =
        await admin
          .from("notifications")
          .insert({
            company_id:
              company.id,

            recipient_type:
              "super_admin",

            recipient_user_id:
              superAdmin.user_id,

            recipient_worker_id:
              null,

            type:
              success
                ? "payment_success"
                : "payment_failed",

            priority:
              success
                ? "success"
                : "critical",

            title:
              success
                ? "💳 업체 정기결제 완료"
                : "🚨 업체 정기결제 실패",

            message:
              success
                ? `${company.company_name}\n${plan.plan_name} ${Number(
                    payment.amount_krw,
                  ).toLocaleString(
                    "ko-KR",
                  )}원 정기결제가 완료되었습니다.`
                : `${company.company_name}\n${plan.plan_name} 정기결제에 실패했습니다.${
                    errorMessage
                      ? `\n${errorMessage}`
                      : ""
                  }`,

            link:
              "/super-admin/notifications",

            reference_type:
              "payment",

            reference_id:
              payment.id,

            dedupe_key:
              dedupeKey,

            is_read:
              false,

            push_sent:
              false,
          });

      if (
        notificationError &&
        notificationError.code !== "23505"
      ) {
        console.error(
          "[billing/renew] super notification error:",
          notificationError,
        );
      }
    }
  } catch (error) {
    /*
     * 알림 오류로 결제 성공 자체를
     * 실패 처리하지 않습니다.
     */

    console.error(
      "[billing/renew] notification error:",
      error,
    );
  }
}


/*
 * =========================================================
 * Billing Event
 * =========================================================
 */

async function createBillingEvent({
  admin,
  companyId,
  subscriptionId,
  paymentId,
  eventType,
  eventData,
}) {
  try {
    const {
      error,
    } =
      await admin
        .from("billing_events")
        .insert({
          company_id:
            companyId,

          subscription_id:
            subscriptionId || null,

          payment_id:
            paymentId || null,

          event_type:
            eventType,

          provider:
            "toss",

          event_data:
            eventData || {},
        });

    if (error) {
      console.error(
        "[billing/renew] billing event error:",
        error,
      );
    }
  } catch (error) {
    console.error(
      "[billing/renew] billing event exception:",
      error,
    );
  }
}


/*
 * =========================================================
 * 한 구독 정기결제 처리
 * =========================================================
 */

async function renewOneSubscription({
  admin,
  subscription,
  dryRun,
}) {
  let company = null;
  let plan = null;
  let paymentRow = null;

  const orderId =
    createRenewalOrderId(
      subscription.id,
      subscription.next_billing_at,
    );

  /*
   * ---------------------------------------------------------
   * 1. 업체
   * ---------------------------------------------------------
   */

  const {
    data: companyData,
    error: companyError,
  } =
    await admin
      .from("companies")
      .select(
        `
          id,
          company_name,
          subscription_plan,
          is_active
        `,
      )
      .eq(
        "id",
        subscription.company_id,
      )
      .maybeSingle();

  if (companyError) {
    throw new Error(
      "업체 정보를 확인하지 못했습니다.",
    );
  }

  if (!companyData) {
    throw new Error(
      "업체를 찾을 수 없습니다.",
    );
  }

  company =
    companyData;

  if (
    company.is_active === false
  ) {
    return {
      ok: false,
      skipped: true,
      reason:
        "inactive_company",
      companyId:
        company.id,
      companyName:
        company.company_name,
    };
  }


  /*
   * ---------------------------------------------------------
   * 2. 요금제
   * ---------------------------------------------------------
   */

  const {
    data: planData,
    error: planError,
  } =
    await admin
      .from("subscription_plans")
      .select(
        `
          plan_code,
          plan_name,
          monthly_price_krw,
          is_active
        `,
      )
      .ilike(
        "plan_code",
        subscription.plan_code,
      )
      .eq(
        "is_active",
        true,
      )
      .maybeSingle();

  if (planError) {
    throw new Error(
      "요금제 정보를 확인하지 못했습니다.",
    );
  }

  if (!planData) {
    throw new Error(
      "사용 가능한 요금제를 찾을 수 없습니다.",
    );
  }

  plan =
    planData;

  if (
    String(
      plan.plan_code,
    ).toLowerCase() === "trial"
  ) {
    return {
      ok: false,
      skipped: true,
      reason:
        "trial_plan",
      companyId:
        company.id,
      companyName:
        company.company_name,
    };
  }


  /*
   * 결제 금액은 현재 활성 요금제 DB 가격을 사용합니다.
   */

  const amount =
    Number(
      plan.monthly_price_krw,
    );

  if (
    !Number.isInteger(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "요금제 금액이 올바르지 않습니다.",
    );
  }


  /*
   * ---------------------------------------------------------
   * 3. Billing Customer
   * ---------------------------------------------------------
   */

  const {
    data: billingCustomer,
    error: billingCustomerError,
  } =
    await admin
      .from("billing_customers")
      .select(
        `
          id,
          company_id,
          provider,
          customer_key,
          billing_key,
          is_active
        `,
      )
      .eq(
        "company_id",
        company.id,
      )
      .eq(
        "provider",
        "toss",
      )
      .maybeSingle();

  if (billingCustomerError) {
    throw new Error(
      "결제수단 정보를 확인하지 못했습니다.",
    );
  }

  if (
    !billingCustomer ||
    !billingCustomer.billing_key ||
    billingCustomer.is_active === false
  ) {
    throw new Error(
      "등록된 결제수단이 없습니다.",
    );
  }


  /*
   * ---------------------------------------------------------
   * 4. 기존 결제 확인
   * ---------------------------------------------------------
   */

  const {
    data: existingPayment,
    error: existingPaymentError,
  } =
    await admin
      .from("payments")
      .select("*")
      .eq(
        "order_id",
        orderId,
      )
      .maybeSingle();

  if (existingPaymentError) {
    throw new Error(
      "기존 정기결제 기록을 확인하지 못했습니다.",
    );
  }


  /*
   * 이미 결제 성공한 기간이면
   * 절대 다시 결제하지 않습니다.
   */

  if (
    existingPayment?.status ===
    "paid"
  ) {
    return {
      ok: true,
      skipped: true,
      alreadyPaid: true,
      reason:
        "already_paid",
      companyId:
        company.id,
      companyName:
        company.company_name,
      orderId,
      paymentId:
        existingPayment.id,
    };
  }


  /*
   * 확정 실패한 동일 주문은
   * Cron 반복 실행으로 재청구하지 않습니다.
   */

  if (
    existingPayment?.status ===
    "failed"
  ) {
    return {
      ok: false,
      skipped: true,
      reason:
        "already_failed",
      companyId:
        company.id,
      companyName:
        company.company_name,
      orderId,
      paymentId:
        existingPayment.id,
    };
  }


  /*
   * ---------------------------------------------------------
   * 5. DRY RUN
   *
   * DB 변경 / Toss 결제를 하지 않습니다.
   * ---------------------------------------------------------
   */

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      eligible: true,
      companyId:
        company.id,
      companyName:
        company.company_name,
      subscriptionId:
        subscription.id,
      planCode:
        plan.plan_code,
      planName:
        plan.plan_name,
      amount,
      nextBillingAt:
        subscription.next_billing_at,
      orderId,
      hasBillingKey:
        true,
    };
  }


  /*
   * ---------------------------------------------------------
   * 6. pending Payment
   * ---------------------------------------------------------
   */

  if (!existingPayment) {
    const {
      data: insertedPayment,
      error: insertPaymentError,
    } =
      await admin
        .from("payments")
        .insert({
          company_id:
            company.id,

          subscription_id:
            subscription.id,

          provider:
            "toss",

          order_id:
            orderId,

          payment_key:
            null,

          plan_code:
            plan.plan_code,

          amount_krw:
            amount,

          status:
            "pending",

          payment_type:
            "renewal",

          failure_code:
            null,

          failure_message:
            null,

          paid_at:
            null,

          metadata: {
            source:
              "automatic_renewal",

            subscription_id:
              subscription.id,

            scheduled_billing_at:
              subscription.next_billing_at,
          },
        })
        .select("*")
        .single();

    if (insertPaymentError) {
      /*
       * 동시에 두 Cron 요청이 들어온 경우
       * order_id UNIQUE가 마지막 방어선입니다.
       */

      if (
        insertPaymentError.code ===
        "23505"
      ) {
        const {
          data: concurrentPayment,
          error: concurrentError,
        } =
          await admin
            .from("payments")
            .select("*")
            .eq(
              "order_id",
              orderId,
            )
            .maybeSingle();

        if (
          concurrentError ||
          !concurrentPayment
        ) {
          throw new Error(
            "정기결제 중복 요청을 확인하지 못했습니다.",
          );
        }

        paymentRow =
          concurrentPayment;

        if (
          paymentRow.status ===
          "paid"
        ) {
          return {
            ok: true,
            skipped: true,
            alreadyPaid: true,
            reason:
              "already_paid",
            companyId:
              company.id,
            companyName:
              company.company_name,
            orderId,
            paymentId:
              paymentRow.id,
          };
        }

        if (
          paymentRow.status ===
          "failed"
        ) {
          return {
            ok: false,
            skipped: true,
            reason:
              "already_failed",
            companyId:
              company.id,
            companyName:
              company.company_name,
            orderId,
            paymentId:
              paymentRow.id,
          };
        }
      } else {
        throw new Error(
          "정기결제 기록을 생성하지 못했습니다.",
        );
      }
    } else {
      paymentRow =
        insertedPayment;
    }
  } else {
    paymentRow =
      existingPayment;
  }


  /*
   * ---------------------------------------------------------
   * 7. Toss 정기결제
   *
   * 동일한 정기결제 기간에는
   * orderId / Idempotency-Key가 고정됩니다.
   * ---------------------------------------------------------
   */

  try {
    const tossPayment =
      await payWithTossBillingKey({
        billingKey:
          billingCustomer.billing_key,

        customerKey:
          billingCustomer.customer_key,

        amount,

        orderId,

        orderName:
          `${plan.plan_name} 월 정기구독`,

        idempotencyKey:
          orderId,
      });


    const paymentKey =
      tossPayment?.paymentKey ||
      null;

    const paidAt =
      tossPayment?.approvedAt ||
      new Date().toISOString();


    /*
     * -------------------------------------------------------
     * 8. 다음 구독기간
     *
     * 실제 승인시각을 기준으로 한 달 연장합니다.
     * -------------------------------------------------------
     */

    const periodStart =
      new Date(paidAt);

    const periodEnd =
      addOneMonthClamped(
        periodStart,
      );


    /*
     * -------------------------------------------------------
     * 9. Subscription 갱신
     * -------------------------------------------------------
     */

    const {
      data: updatedSubscription,
      error: subscriptionUpdateError,
    } =
      await admin
        .from("subscriptions")
        .update({
          plan_code:
            plan.plan_code,

          status:
            "active",

          monthly_price_krw:
            amount,

          current_period_start:
            periodStart.toISOString(),

          current_period_end:
            periodEnd.toISOString(),

          next_billing_at:
            periodEnd.toISOString(),

          cancel_at_period_end:
            false,

          canceled_at:
            null,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          subscription.id,
        )
        .eq(
          "company_id",
          company.id,
        )
        .select("*")
        .single();

    if (subscriptionUpdateError) {
      throw new Error(
        "정기결제 후 구독기간을 갱신하지 못했습니다.",
      );
    }


    /*
     * -------------------------------------------------------
     * 10. Payment paid
     * -------------------------------------------------------
     */

    const {
      data: paidPayment,
      error: paidPaymentError,
    } =
      await admin
        .from("payments")
        .update({
          subscription_id:
            updatedSubscription.id,

          payment_key:
            paymentKey,

          status:
            "paid",

          failure_code:
            null,

          failure_message:
            null,

          paid_at:
            paidAt,

          metadata: {
            source:
              "automatic_renewal",

            subscription_id:
              subscription.id,

            scheduled_billing_at:
              subscription.next_billing_at,

            toss_status:
              tossPayment?.status ||
              null,

            method:
              tossPayment?.method ||
              null,
          },

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          paymentRow.id,
        )
        .select("*")
        .single();

    if (paidPaymentError) {
      throw new Error(
        "정기결제 성공 기록을 저장하지 못했습니다.",
      );
    }

    paymentRow =
      paidPayment;


    /*
     * -------------------------------------------------------
     * 11. 업체 플랜 동기화
     * -------------------------------------------------------
     */

    const {
      error: companyPlanError,
    } =
      await admin
        .from("companies")
        .update({
          subscription_plan:
            plan.plan_code,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          company.id,
        );

    if (companyPlanError) {
      throw new Error(
        "업체 요금제를 동기화하지 못했습니다.",
      );
    }


    /*
     * -------------------------------------------------------
     * 12. 성공 Billing Event
     * -------------------------------------------------------
     */

    await createBillingEvent({
      admin,

      companyId:
        company.id,

      subscriptionId:
        updatedSubscription.id,

      paymentId:
        paymentRow.id,

      eventType:
        "renewal_payment_succeeded",

      eventData: {
        order_id:
          orderId,

        plan_code:
          plan.plan_code,

        amount_krw:
          amount,

        previous_billing_at:
          subscription.next_billing_at,

        next_billing_at:
          updatedSubscription.next_billing_at,
      },
    });


    /*
     * -------------------------------------------------------
     * 13. 성공 알림
     * -------------------------------------------------------
     */

    await createPaymentNotifications({
      admin,
      company,
      plan,
      payment:
        paymentRow,
      success:
        true,
    });


    return {
      ok: true,
      renewed: true,

      companyId:
        company.id,

      companyName:
        company.company_name,

      subscriptionId:
        updatedSubscription.id,

      paymentId:
        paymentRow.id,

      orderId:
        paymentRow.order_id,

      planCode:
        plan.plan_code,

      amount:
        paymentRow.amount_krw,

      paidAt:
        paymentRow.paid_at,

      nextBillingAt:
        updatedSubscription.next_billing_at,
    };
  } catch (error) {
    /*
     * -------------------------------------------------------
     * Toss 4xx = 확정 실패
     *
     * 5xx / network = 승인 여부가 불확실할 수 있으므로
     * failed로 확정하지 않습니다.
     * -------------------------------------------------------
     */

    const errorStatus =
      Number(
        error?.status,
      );

    const definiteFailure =
      errorStatus >= 400 &&
      errorStatus < 500;


    if (
      paymentRow?.id &&
      definiteFailure
    ) {
      try {
        const {
          data: failedPayment,
        } =
          await admin
            .from("payments")
            .update({
              status:
                "failed",

              failure_code:
                error?.code ||
                "RENEWAL_PAYMENT_FAILED",

              failure_message:
                error?.message ||
                "정기결제에 실패했습니다.",

              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              paymentRow.id,
            )
            .eq(
              "status",
              "pending",
            )
            .select("*")
            .maybeSingle();

        if (failedPayment) {
          paymentRow =
            failedPayment;
        }


        await admin
          .from("subscriptions")
          .update({
            status:
              "past_due",

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            subscription.id,
          );


        await createBillingEvent({
          admin,

          companyId:
            company.id,

          subscriptionId:
            subscription.id,

          paymentId:
            paymentRow.id,

          eventType:
            "renewal_payment_failed",

          eventData: {
            order_id:
              orderId,

            plan_code:
              plan.plan_code,

            amount_krw:
              amount,

            error_code:
              error?.code ||
              "RENEWAL_PAYMENT_FAILED",

            error_message:
              error?.message ||
              "정기결제에 실패했습니다.",
          },
        });


        await createPaymentNotifications({
          admin,
          company,
          plan,
          payment:
            paymentRow,
          success:
            false,
          errorMessage:
            error?.message ||
            "정기결제에 실패했습니다.",
        });
      } catch (
        failureSaveError
      ) {
        console.error(
          "[billing/renew] failure save error:",
          failureSaveError,
        );
      }
    }


    /*
     * 5xx / 네트워크 오류
     * 실제 Toss 승인 여부를 알 수 없으므로
     * pending 유지
     */

    if (
      !definiteFailure &&
      paymentRow?.id
    ) {
      await createBillingEvent({
        admin,

        companyId:
          company.id,

        subscriptionId:
          subscription.id,

        paymentId:
          paymentRow.id,

        eventType:
          "renewal_payment_result_uncertain",

        eventData: {
          order_id:
            orderId,

          plan_code:
            plan.plan_code,

          amount_krw:
            amount,

          error_code:
            error?.code ||
            "RENEWAL_RESULT_UNCERTAIN",

          error_message:
            error?.message ||
            "정기결제 결과를 확인하지 못했습니다.",
        },
      });
    }


    return {
      ok: false,

      retryable:
        !definiteFailure,

      companyId:
        company?.id ||
        subscription.company_id,

      companyName:
        company?.company_name ||
        null,

      subscriptionId:
        subscription.id,

      paymentId:
        paymentRow?.id ||
        null,

      orderId,

      error:
        definiteFailure
          ? error?.message ||
            "정기결제에 실패했습니다."
          : "정기결제 결과를 확인하지 못했습니다.",

      code:
        error?.code ||
        "RENEWAL_CHARGE_ERROR",
    };
  }
}


/*
 * =========================================================
 * 공통 실행
 * =========================================================
 */

async function runRenewal(
  request,
) {
  /*
   * CRON 인증
   */

  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }


  const admin =
    getAdminSupabase();


  /*
   * ---------------------------------------------------------
   * dryRun
   *
   * ?dryRun=1
   * ?dryRun=true
   *
   * 실제 결제 없이 대상만 검사합니다.
   * ---------------------------------------------------------
   */

  const requestUrl =
    new URL(
      request.url,
    );

  const dryRunValue =
    String(
      requestUrl.searchParams.get(
        "dryRun",
      ) || "",
    ).toLowerCase();

  const dryRun =
    dryRunValue === "1" ||
    dryRunValue === "true";


  /*
   * ---------------------------------------------------------
   * 현재 결제시각이 지난 active 구독 조회
   * ---------------------------------------------------------
   */

  const now =
    new Date();

  const {
    data: subscriptions,
    error: subscriptionError,
  } =
    await admin
      .from("subscriptions")
      .select(
        `
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
          created_at,
          updated_at
        `,
      )
      .eq(
        "status",
        "active",
      )
      .eq(
        "cancel_at_period_end",
        false,
      )
      .not(
        "next_billing_at",
        "is",
        null,
      )
      .lte(
        "next_billing_at",
        now.toISOString(),
      )
      .order(
        "next_billing_at",
        {
          ascending: true,
        },
      )
      .limit(20);


  if (subscriptionError) {
    throw new Error(
      `정기결제 대상 조회 실패: ${subscriptionError.message}`,
    );
  }


  /*
   * ---------------------------------------------------------
   * 대상 없음
   * ---------------------------------------------------------
   */

  if (
    !subscriptions ||
    subscriptions.length === 0
  ) {
    return NextResponse.json(
      {
        ok: true,
        dryRun,
        checkedAt:
          now.toISOString(),
        eligible:
          0,
        processed:
          0,
        succeeded:
          0,
        failed:
          0,
        skipped:
          0,
        results: [],
      },
      {
        status: 200,
      },
    );
  }


  /*
   * ---------------------------------------------------------
   * 순차 처리
   *
   * 결제 API이므로 Promise.all로 한꺼번에
   * 실행하지 않습니다.
   * ---------------------------------------------------------
   */

  const results = [];

  for (
    const subscription
    of subscriptions
  ) {
    try {
      const result =
        await renewOneSubscription({
          admin,
          subscription,
          dryRun,
        });

      results.push(
        result,
      );
    } catch (error) {
      console.error(
        "[billing/renew] subscription error:",
        subscription.id,
        error,
      );

      results.push({
        ok: false,
        subscriptionId:
          subscription.id,
        companyId:
          subscription.company_id,
        error:
          error?.message ||
          "정기결제 처리 중 오류가 발생했습니다.",
      });
    }
  }


  const succeeded =
    results.filter(
      (item) =>
        item?.renewed === true,
    ).length;

  const failed =
    results.filter(
      (item) =>
        item?.ok === false &&
        item?.skipped !== true,
    ).length;

  const skipped =
    results.filter(
      (item) =>
        item?.skipped === true,
    ).length;


  return NextResponse.json(
    {
      ok:
        failed === 0,

      dryRun,

      checkedAt:
        now.toISOString(),

      eligible:
        subscriptions.length,

      processed:
        results.length,

      succeeded,

      failed,

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


/*
 * =========================================================
 * GET
 *
 * Cron / dry-run 모두 지원
 * =========================================================
 */

export async function GET(request) {
  try {
    return await runRenewal(
      request,
    );
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


/*
 * =========================================================
 * POST
 *
 * 필요하면 서버에서 수동 실행할 수도 있습니다.
 * =========================================================
 */

export async function POST(request) {
  try {
    return await runRenewal(
      request,
    );
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
