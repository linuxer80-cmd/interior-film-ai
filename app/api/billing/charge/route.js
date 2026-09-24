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
 * Bearer Token
 * =========================================================
 */

function getBearerToken(request) {
  const authorization =
    request.headers.get("authorization");

  if (!authorization) {
    return "";
  }

  const [scheme, token] =
    authorization.split(" ");

  if (
    String(scheme || "").toLowerCase() !==
    "bearer"
  ) {
    return "";
  }

  return token || "";
}


/*
 * =========================================================
 * 다음 달 날짜
 *
 * 월말 overflow 방지:
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
 * 알림 생성
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
        .select("id, name")
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
        "[billing/charge] owner notification lookup error:",
        ownerError,
      );
    }

    for (const owner of owners || []) {
      const dedupeKey =
        success
          ? `payment_success:${payment.order_id}:${owner.id}`
          : `payment_failed:${payment.order_id}:${owner.id}`;

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
                ? "💳 결제가 완료되었습니다."
                : "🚨 결제에 실패했습니다.",

            message:
              success
                ? `${plan.plan_name} 요금제 ${Number(
                    payment.amount_krw,
                  ).toLocaleString(
                    "ko-KR",
                  )}원 결제가 완료되었습니다.`
                : `${plan.plan_name} 요금제 결제에 실패했습니다.${
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
        notificationError.code !==
          "23505"
      ) {
        console.error(
          "[billing/charge] company notification error:",
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
        "[billing/charge] super admin lookup error:",
        superAdminError,
      );
    }

    for (
      const superAdmin
      of superAdmins || []
    ) {
      const dedupeKey =
        success
          ? `payment_success:${payment.order_id}:super_admin:${superAdmin.user_id}`
          : `payment_failed:${payment.order_id}:super_admin:${superAdmin.user_id}`;

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
                ? "💳 업체 결제 완료"
                : "🚨 업체 결제 실패",

            message:
              success
                ? `${company.company_name}\n${plan.plan_name} ${Number(
                    payment.amount_krw,
                  ).toLocaleString(
                    "ko-KR",
                  )}원 결제가 완료되었습니다.`
                : `${company.company_name}\n${plan.plan_name} 결제에 실패했습니다.${
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
        notificationError.code !==
          "23505"
      ) {
        console.error(
          "[billing/charge] super notification error:",
          notificationError,
        );
      }
    }
  } catch (error) {
    /*
     * 알림 실패 때문에
     * 결제 성공 자체를 실패 처리하지 않습니다.
     */

    console.error(
      "[billing/charge] notification error:",
      error,
    );
  }
}


/*
 * =========================================================
 * POST /api/billing/charge
 * =========================================================
 */

export async function POST(request) {
  const admin =
    getAdminSupabase();

  let company = null;
  let plan = null;
  let checkoutSession = null;
  let paymentRow = null;

  try {
    /*
     * =====================================================
     * 1. 로그인 확인
     * =====================================================
     */

    const accessToken =
      getBearerToken(request);

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "로그인이 필요합니다.",
        },
        {
          status: 401,
        },
      );
    }


    const {
      data: userData,
      error: userError,
    } =
      await admin.auth.getUser(
        accessToken,
      );

    if (
      userError ||
      !userData?.user
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "로그인 정보를 확인할 수 없습니다.",
        },
        {
          status: 401,
        },
      );
    }

    const user =
      userData.user;


    /*
     * =====================================================
     * 2. 요청값
     * =====================================================
     */

    let body = null;

    try {
      body =
        await request.json();
    } catch {
      body = null;
    }

    const checkoutSessionId =
      String(
        body?.checkoutSessionId ||
          "",
      ).trim();

    if (!checkoutSessionId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "결제 세션 정보가 없습니다.",
        },
        {
          status: 400,
        },
      );
    }


    /*
     * =====================================================
     * 3. 로그인 사용자의 업체 확인
     * =====================================================
     */

    const {
      data: profile,
      error: profileError,
    } =
      await admin
        .from("profiles")
        .select(
          `
            id,
            company_id,
            name,
            role,
            is_active
          `,
        )
        .eq(
          "id",
          user.id,
        )
        .maybeSingle();

    if (profileError) {
      throw new Error(
        "사용자 정보를 확인하지 못했습니다.",
      );
    }

    if (
      !profile ||
      !profile.company_id
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "소속 업체를 확인할 수 없습니다.",
        },
        {
          status: 403,
        },
      );
    }

    if (
      profile.is_active === false
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "비활성화된 관리자 계정입니다.",
        },
        {
          status: 403,
        },
      );
    }


    /*
     * =====================================================
     * 4. 업체 확인
     * =====================================================
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
          profile.company_id,
        )
        .maybeSingle();

    if (companyError) {
      throw new Error(
        "업체 정보를 확인하지 못했습니다.",
      );
    }

    if (!companyData) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "업체를 찾을 수 없습니다.",
        },
        {
          status: 404,
        },
      );
    }

    company =
      companyData;

    if (
      company.is_active === false
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "비활성화된 업체입니다.",
        },
        {
          status: 403,
        },
      );
    }


    /*
     * =====================================================
     * 5. checkout session
     * =====================================================
     */

    const {
      data: checkoutData,
      error: checkoutError,
    } =
      await admin
        .from(
          "billing_checkout_sessions",
        )
        .select(
          `
            id,
            company_id,
            customer_key,
            plan_code,
            amount_krw,
            status,
            expires_at,
            completed_at,
            created_at,
            updated_at
          `,
        )
        .eq(
          "id",
          checkoutSessionId,
        )
        .maybeSingle();

    if (checkoutError) {
      throw new Error(
        "결제 세션을 확인하지 못했습니다.",
      );
    }

    if (!checkoutData) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "결제 세션을 찾을 수 없습니다.",
        },
        {
          status: 404,
        },
      );
    }

    checkoutSession =
      checkoutData;

    if (
      checkoutSession.company_id !==
      company.id
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "다른 업체의 결제 세션입니다.",
        },
        {
          status: 403,
        },
      );
    }


    /*
     * =====================================================
     * 이미 결제 완료된 세션
     *
     * 브라우저 새로고침/중복 호출 시
     * 다시 결제하지 않습니다.
     * =====================================================
     */

    if (
      checkoutSession.status ===
      "paid"
    ) {
      const {
        data: existingPaid,
      } =
        await admin
          .from("payments")
          .select(
            `
              id,
              order_id,
              plan_code,
              amount_krw,
              status,
              paid_at
            `,
          )
          .eq(
            "company_id",
            company.id,
          )
          .eq(
            "order_id",
            `sub_${checkoutSession.id}`,
          )
          .maybeSingle();

      return NextResponse.json(
        {
          ok: true,
          alreadyPaid: true,
          status: "paid",
          payment:
            existingPaid || null,
        },
        {
          status: 200,
        },
      );
    }


    if (
      checkoutSession.status !==
      "authorized"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "결제 가능한 상태가 아닙니다. 요금제를 다시 선택해주세요.",
        },
        {
          status: 409,
        },
      );
    }


    /*
     * =====================================================
     * 6. 요금제 재검증
     * =====================================================
     */

    const {
      data: planData,
      error: planError,
    } =
      await admin
        .from(
          "subscription_plans",
        )
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
          checkoutSession.plan_code,
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
      return NextResponse.json(
        {
          ok: false,
          error:
            "선택한 요금제를 사용할 수 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    plan =
      planData;

    if (
      String(
        plan.plan_code,
      ).toLowerCase() ===
      "trial"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "TRIAL 요금제는 결제할 수 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const amount =
      Number(
        plan.monthly_price_krw,
      );

    if (
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "요금제 금액이 올바르지 않습니다.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      amount !==
      Number(
        checkoutSession.amount_krw,
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "요금제 가격이 변경되었습니다. 다시 선택해주세요.",
        },
        {
          status: 409,
        },
      );
    }


    /*
     * =====================================================
     * 7. Billing Customer
     * =====================================================
     */

    const {
      data: billingCustomer,
      error: billingCustomerError,
    } =
      await admin
        .from(
          "billing_customers",
        )
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
      billingCustomer.is_active ===
        false
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "등록된 결제수단이 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      billingCustomer.customer_key !==
      checkoutSession.customer_key
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "결제 고객 정보가 일치하지 않습니다.",
        },
        {
          status: 400,
        },
      );
    }


    /*
     * =====================================================
     * 8. 주문번호
     *
     * checkout session마다 항상 동일합니다.
     * payments.order_id UNIQUE
     * =====================================================
     */

    const orderId =
      `sub_${checkoutSession.id}`;


    /*
     * =====================================================
     * 9. 기존 Payment 확인
     * =====================================================
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
        "기존 결제 기록을 확인하지 못했습니다.",
      );
    }

    if (
      existingPayment?.status ===
      "paid"
    ) {
      await admin
        .from(
          "billing_checkout_sessions",
        )
        .update({
          status: "paid",
          completed_at:
            existingPayment.paid_at ||
            new Date().toISOString(),
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          checkoutSession.id,
        );

      return NextResponse.json(
        {
          ok: true,
          alreadyPaid: true,
          status: "paid",
          payment: {
            id:
              existingPayment.id,
            order_id:
              existingPayment.order_id,
            amount_krw:
              existingPayment.amount_krw,
            plan_code:
              existingPayment.plan_code,
            paid_at:
              existingPayment.paid_at,
          },
        },
        {
          status: 200,
        },
      );
    }

    if (
      existingPayment?.status ===
      "failed"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "이 결제 요청은 이미 실패 처리되었습니다. 요금제를 다시 선택해주세요.",
        },
        {
          status: 409,
        },
      );
    }


    /*
     * =====================================================
     * 10. pending Payment 생성
     * =====================================================
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
              null,

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
              "subscription",

            failure_code:
              null,

            failure_message:
              null,

            paid_at:
              null,

            metadata: {
              checkout_session_id:
                checkoutSession.id,
              source:
                "initial_subscription",
            },
          })
          .select("*")
          .single();

      if (insertPaymentError) {
        /*
         * 동시 요청으로 UNIQUE 충돌했을 수 있으므로
         * 다시 조회합니다.
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
              "결제 중복 요청을 확인하지 못했습니다.",
            );
          }

          paymentRow =
            concurrentPayment;
        } else {
          throw new Error(
            "결제 기록을 생성하지 못했습니다.",
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
     * =====================================================
     * 11. Toss 실제 결제
     *
     * 중요:
     * Idempotency-Key를 checkout session ID로 고정합니다.
     *
     * 동일 세션 재시도 시 Toss에서도 같은 요청으로
     * 처리되도록 합니다.
     * =====================================================
     */

    const tossPayment =
      await payWithTossBillingKey({
        billingKey:
          billingCustomer.billing_key,

        customerKey:
          billingCustomer.customer_key,

        amount,

        orderId,

        orderName:
          `${plan.plan_name} 월 구독`,

        customerEmail:
          user.email || undefined,

        customerName:
          profile.name || undefined,

        idempotencyKey:
          checkoutSession.id,
      });


    const paymentKey =
      tossPayment?.paymentKey ||
      null;

    const paidAt =
      tossPayment?.approvedAt ||
      new Date().toISOString();


    /*
     * =====================================================
     * 12. 구독 생성/갱신
     * =====================================================
     */

    const periodStart =
      new Date(paidAt);

    const periodEnd =
      addOneMonthClamped(
        periodStart,
      );


    const {
      data: existingSubscription,
      error: subscriptionLookupError,
    } =
      await admin
        .from("subscriptions")
        .select("*")
        .eq(
          "company_id",
          company.id,
        )
        .maybeSingle();

    if (subscriptionLookupError) {
      throw new Error(
        "구독 정보를 확인하지 못했습니다.",
      );
    }


    let subscription = null;


    if (existingSubscription) {
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
            existingSubscription.id,
          )
          .select("*")
          .single();

      if (subscriptionUpdateError) {
        throw new Error(
          "구독 정보를 갱신하지 못했습니다.",
        );
      }

      subscription =
        updatedSubscription;
    } else {
      const {
        data: insertedSubscription,
        error: subscriptionInsertError,
      } =
        await admin
          .from("subscriptions")
          .insert({
            company_id:
              company.id,

            plan_code:
              plan.plan_code,

            status:
              "active",

            monthly_price_krw:
              amount,

            started_at:
              periodStart.toISOString(),

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
          })
          .select("*")
          .single();

      if (subscriptionInsertError) {
        throw new Error(
          "구독 정보를 생성하지 못했습니다.",
        );
      }

      subscription =
        insertedSubscription;
    }


    /*
     * =====================================================
     * 13. Payment paid 처리
     * =====================================================
     */

    const {
      data: paidPayment,
      error: paidPaymentError,
    } =
      await admin
        .from("payments")
        .update({
          subscription_id:
            subscription.id,

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
            checkout_session_id:
              checkoutSession.id,
            source:
              "initial_subscription",
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
        "결제 성공 기록을 저장하지 못했습니다.",
      );
    }

    paymentRow =
      paidPayment;


    /*
     * =====================================================
     * 14. 업체 플랜 변경
     *
     * 결제가 성공한 뒤에만 변경합니다.
     * =====================================================
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
        "업체 요금제를 적용하지 못했습니다.",
      );
    }


    /*
     * =====================================================
     * 15. checkout paid
     * =====================================================
     */

    const {
      error: checkoutPaidError,
    } =
      await admin
        .from(
          "billing_checkout_sessions",
        )
        .update({
          status:
            "paid",

          completed_at:
            paidAt,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          checkoutSession.id,
        );

    if (checkoutPaidError) {
      console.error(
        "[billing/charge] checkout paid update error:",
        checkoutPaidError,
      );
    }


    /*
     * =====================================================
     * 16. Billing Event
     * =====================================================
     */

    const {
      error: billingEventError,
    } =
      await admin
        .from("billing_events")
        .insert({
          company_id:
            company.id,

          subscription_id:
            subscription.id,

          payment_id:
            paymentRow.id,

          event_type:
            "payment_succeeded",

          provider:
            "toss",

          event_data: {
            order_id:
              orderId,

            plan_code:
              plan.plan_code,

            amount_krw:
              amount,

            checkout_session_id:
              checkoutSession.id,
          },
        });

    if (billingEventError) {
      console.error(
        "[billing/charge] success event error:",
        billingEventError,
      );
    }


    /*
     * =====================================================
     * 17. 성공 Push 알림
     * =====================================================
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


    /*
     * =====================================================
     * 18. 성공 응답
     * =====================================================
     */

    return NextResponse.json(
      {
        ok: true,

        status:
          "paid",

        payment: {
          id:
            paymentRow.id,

          order_id:
            paymentRow.order_id,

          amount_krw:
            paymentRow.amount_krw,

          plan_code:
            paymentRow.plan_code,

          paid_at:
            paymentRow.paid_at,
        },

        subscription: {
          id:
            subscription.id,

          plan_code:
            subscription.plan_code,

          status:
            subscription.status,

          current_period_start:
            subscription.current_period_start,

          current_period_end:
            subscription.current_period_end,

          next_billing_at:
            subscription.next_billing_at,
        },

        plan: {
          plan_code:
            plan.plan_code,

          plan_name:
            plan.plan_name,

          monthly_price_krw:
            amount,
        },
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "[billing/charge] error:",
      error,
    );


    /*
     * =====================================================
     * Toss/결제 실패 처리
     *
     * 4xx = 확정 실패로 처리
     *
     * 5xx / 네트워크 오류는
     * 실제 승인 여부가 불확실할 수 있으므로
     * checkout을 failed로 확정하지 않습니다.
     *
     * 같은 checkoutSessionId로 다시 요청하면
     * 동일 Idempotency-Key를 사용합니다.
     * =====================================================
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
                "PAYMENT_FAILED",

              failure_message:
                error?.message ||
                "결제에 실패했습니다.",

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


        if (
          checkoutSession?.id
        ) {
          await admin
            .from(
              "billing_checkout_sessions",
            )
            .update({
              status:
                "failed",

              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              checkoutSession.id,
            )
            .eq(
              "status",
              "authorized",
            );
        }


        if (
          company?.id &&
          paymentRow?.id
        ) {
          await admin
            .from("billing_events")
            .insert({
              company_id:
                company.id,

              subscription_id:
                null,

              payment_id:
                paymentRow.id,

              event_type:
                "payment_failed",

              provider:
                "toss",

              event_data: {
                order_id:
                  paymentRow.order_id,

                plan_code:
                  paymentRow.plan_code,

                error_code:
                  error?.code ||
                  "PAYMENT_FAILED",

                error_message:
                  error?.message ||
                  "결제에 실패했습니다.",

                checkout_session_id:
                  checkoutSession?.id ||
                  null,
              },
            });
        }


        if (
          company &&
          plan &&
          paymentRow
        ) {
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
              "결제에 실패했습니다.",
          });
        }
      } catch (
        failureSaveError
      ) {
        console.error(
          "[billing/charge] failure save error:",
          failureSaveError,
        );
      }
    }


    /*
     * 5xx/네트워크 불확실 상태는
     * 중복결제 방지를 위해 failed 확정하지 않음
     */

    if (
      !definiteFailure &&
      company?.id &&
      paymentRow?.id
    ) {
      try {
        await admin
          .from("billing_events")
          .insert({
            company_id:
              company.id,

            subscription_id:
              null,

            payment_id:
              paymentRow.id,

            event_type:
              "payment_result_uncertain",

            provider:
              "toss",

            event_data: {
              order_id:
                paymentRow.order_id,

              plan_code:
                paymentRow.plan_code,

              error_code:
                error?.code ||
                "PAYMENT_RESULT_UNCERTAIN",

              error_message:
                error?.message ||
                "결제 결과를 확인하지 못했습니다.",

              checkout_session_id:
                checkoutSession?.id ||
                null,
            },
          });
      } catch (
        uncertainLogError
      ) {
        console.error(
          "[billing/charge] uncertain log error:",
          uncertainLogError,
        );
      }
    }


    const responseStatus =
      definiteFailure
        ? errorStatus
        : 500;


    return NextResponse.json(
      {
        ok: false,

        retryable:
          !definiteFailure,

        error:
          definiteFailure
            ? error?.message ||
              "결제에 실패했습니다."
            : "결제 결과를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",

        code:
          error?.code ||
          "BILLING_CHARGE_ERROR",
      },
      {
        status:
          responseStatus,
      },
    );
  }
          }
