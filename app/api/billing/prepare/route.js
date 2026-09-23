import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

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
    request.headers.get(
      "authorization",
    );

  if (!authorization) {
    return "";
  }

  const [
    scheme,
    token,
  ] = authorization.split(" ");

  if (
    String(scheme || "")
      .toLowerCase() !==
    "bearer"
  ) {
    return "";
  }

  return token || "";
}


/*
 * =========================================================
 * UUID 기반 Toss customerKey 생성
 *
 * 이메일/전화번호처럼 예측 가능한 값을 사용하지 않습니다.
 * =========================================================
 */

function createCustomerKey() {
  return crypto.randomUUID();
}


/*
 * =========================================================
 * checkout session 만료시간
 *
 * 현재 기준 30분
 * =========================================================
 */

function createCheckoutExpiresAt() {
  return new Date(
    Date.now() +
      30 * 60 * 1000,
  ).toISOString();
}


/*
 * =========================================================
 * POST /api/billing/prepare
 * =========================================================
 */

export async function POST(request) {
  try {
    const admin =
      getAdminSupabase();


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
      console.error(
        "[billing/prepare] auth error:",
        userError,
      );

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
     * 2. 요청 데이터
     *
     * 브라우저에서는 plan_code만 받습니다.
     * 금액이나 company_id는 받지 않습니다.
     * =====================================================
     */

    let body = null;

    try {
      body =
        await request.json();
    } catch {
      body = null;
    }


    const requestedPlanCode =
      String(
        body?.plan_code || "",
      )
        .trim()
        .toLowerCase();


    if (!requestedPlanCode) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "요금제를 선택해주세요.",
        },
        {
          status: 400,
        },
      );
    }


    if (
      requestedPlanCode ===
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


    /*
     * =====================================================
     * 3. 로그인 사용자의 profile 확인
     *
     * company_id는 서버가 직접 확인합니다.
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
            company_id
          `,
        )
        .eq(
          "id",
          user.id,
        )
        .maybeSingle();


    if (profileError) {
      console.error(
        "[billing/prepare] profile error:",
        profileError,
      );

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


    /*
     * =====================================================
     * 4. 업체 확인
     * =====================================================
     */

    const {
      data: company,
      error: companyError,
    } =
      await admin
        .from("companies")
        .select(
          `
            id,
            company_name,
            representative_name,
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
      console.error(
        "[billing/prepare] company error:",
        companyError,
      );

      throw new Error(
        "업체 정보를 확인하지 못했습니다.",
      );
    }


    if (!company) {
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
     * 5. 현재 요금제와 같은지 확인
     * =====================================================
     */

    const currentPlanCode =
      String(
        company.subscription_plan ||
          "",
      )
        .trim()
        .toLowerCase();


    if (
      currentPlanCode ===
      requestedPlanCode
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "현재 이용 중인 요금제입니다.",
        },
        {
          status: 409,
        },
      );
    }


    /*
     * =====================================================
     * 6. 요금제 DB 조회
     *
     * 가격은 절대로 브라우저 값을 사용하지 않습니다.
     * subscription_plans가 최종 기준입니다.
     * =====================================================
     */

    const {
      data: plan,
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
          requestedPlanCode,
        )
        .eq(
          "is_active",
          true,
        )
        .maybeSingle();


    if (planError) {
      console.error(
        "[billing/prepare] plan error:",
        planError,
      );

      throw new Error(
        "요금제 정보를 확인하지 못했습니다.",
      );
    }


    if (!plan) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "사용할 수 없는 요금제입니다.",
        },
        {
          status: 400,
        },
      );
    }


    const planCode =
      String(
        plan.plan_code || "",
      )
        .trim()
        .toLowerCase();


    if (
      planCode === "trial"
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
            "요금제 결제금액이 올바르지 않습니다.",
        },
        {
          status: 400,
        },
      );
    }


    /*
     * =====================================================
     * 7. 기존 Toss billing customer 확인
     * =====================================================
     */

    const {
      data: existingCustomer,
      error: customerError,
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
            card_company,
            card_number_masked,
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


    if (customerError) {
      console.error(
        "[billing/prepare] billing customer error:",
        customerError,
      );

      throw new Error(
        "결제 고객 정보를 확인하지 못했습니다.",
      );
    }


    let billingCustomer =
      existingCustomer;


    /*
     * =====================================================
     * 8. billing customer가 없으면 생성
     * =====================================================
     */

    if (!billingCustomer) {
      const customerKey =
        createCustomerKey();


      const {
        data: createdCustomer,
        error: createError,
      } =
        await admin
          .from(
            "billing_customers",
          )
          .insert({
            company_id:
              company.id,

            provider:
              "toss",

            customer_key:
              customerKey,

            is_active:
              true,
          })
          .select(
            `
              id,
              company_id,
              provider,
              customer_key,
              billing_key,
              card_company,
              card_number_masked,
              is_active
            `,
          )
          .single();


      if (createError) {
        console.error(
          "[billing/prepare] billing customer create error:",
          createError,
        );

        throw new Error(
          "결제 고객 정보를 생성하지 못했습니다.",
        );
      }


      billingCustomer =
        createdCustomer;
    }


    /*
     * =====================================================
     * 9. 비활성 billing customer라면 다시 활성화
     * =====================================================
     */

    if (
      billingCustomer.is_active ===
      false
    ) {
      const {
        data: activatedCustomer,
        error: activateError,
      } =
        await admin
          .from(
            "billing_customers",
          )
          .update({
            is_active: true,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            billingCustomer.id,
          )
          .select(
            `
              id,
              company_id,
              provider,
              customer_key,
              billing_key,
              card_company,
              card_number_masked,
              is_active
            `,
          )
          .single();


      if (activateError) {
        console.error(
          "[billing/prepare] billing customer activate error:",
          activateError,
        );

        throw new Error(
          "결제 고객 정보를 활성화하지 못했습니다.",
        );
      }


      billingCustomer =
        activatedCustomer;
    }


    /*
     * =====================================================
     * 10. customerKey 확인
     * =====================================================
     */

    const customerKey =
      String(
        billingCustomer
          ?.customer_key ||
          "",
      ).trim();


    if (!customerKey) {
      throw new Error(
        "결제 고객키를 확인할 수 없습니다.",
      );
    }


    /*
     * =====================================================
     * 11. 만료된 prepared checkout session 정리
     *
     * 실제로 만료시간이 지난 prepared만 expired 처리합니다.
     * =====================================================
     */

    const nowIso =
      new Date().toISOString();


    const {
      error: expireError,
    } =
      await admin
        .from(
          "billing_checkout_sessions",
        )
        .update({
          status:
            "expired",

          updated_at:
            nowIso,
        })
        .eq(
          "company_id",
          company.id,
        )
        .eq(
          "status",
          "prepared",
        )
        .lt(
          "expires_at",
          nowIso,
        );


    if (expireError) {
      console.error(
        "[billing/prepare] expired checkout cleanup error:",
        expireError,
      );

      /*
       * 정리 실패만으로 결제 준비를 막지는 않습니다.
       */
    }


    /*
     * =====================================================
     * 12. checkout session 생성
     *
     * 여기에서:
     * 회사
     * customerKey
     * 선택 요금제
     * 서버에서 확인한 금액
     *
     * 을 하나로 묶습니다.
     * =====================================================
     */

    const expiresAt =
      createCheckoutExpiresAt();


    const {
      data: checkoutSession,
      error: checkoutError,
    } =
      await admin
        .from(
          "billing_checkout_sessions",
        )
        .insert({
          company_id:
            company.id,

          customer_key:
            customerKey,

          plan_code:
            plan.plan_code,

          amount_krw:
            amount,

          status:
            "prepared",

          expires_at:
            expiresAt,
        })
        .select(
          `
            id,
            company_id,
            customer_key,
            plan_code,
            amount_krw,
            status,
            expires_at,
            created_at
          `,
        )
        .single();


    if (checkoutError) {
      console.error(
        "[billing/prepare] checkout create error:",
        checkoutError,
      );

      throw new Error(
        "결제 세션을 생성하지 못했습니다.",
      );
    }


    /*
     * =====================================================
     * 13. 이벤트 기록
     *
     * billingKey는 기록하지 않습니다.
     * =====================================================
     */

    const {
      error: eventError,
    } =
      await admin
        .from(
          "billing_events",
        )
        .insert({
          company_id:
            company.id,

          event_type:
            "billing_prepare",

          provider:
            "toss",

          event_data: {
            checkout_session_id:
              checkoutSession.id,

            requested_plan_code:
              plan.plan_code,

            amount_krw:
              amount,

            has_payment_method:
              Boolean(
                billingCustomer
                  .billing_key,
              ),

            expires_at:
              expiresAt,
          },
        });


    if (eventError) {
      /*
       * 로그 저장 실패 때문에
       * 결제 준비 자체를 실패시키지는 않습니다.
       */
      console.error(
        "[billing/prepare] billing event error:",
        eventError,
      );
    }


    /*
     * =====================================================
     * 14. 브라우저 응답
     *
     * billingKey는 절대로 반환하지 않습니다.
     * =====================================================
     */

    return NextResponse.json(
      {
        ok: true,

        checkoutSessionId:
          checkoutSession.id,

        company: {
          id:
            company.id,

          name:
            company.company_name,

          company_name:
            company.company_name,

          representative_name:
            company.representative_name,
        },

        plan: {
          code:
            plan.plan_code,

          plan_code:
            plan.plan_code,

          name:
            plan.plan_name,

          plan_name:
            plan.plan_name,

          monthly_price_krw:
            amount,
        },

        customerKey,

        hasPaymentMethod:
          Boolean(
            billingCustomer
              .billing_key,
          ),

        expiresAt,
      },
      {
        status: 200,
      },
    );

  } catch (error) {
    console.error(
      "[billing/prepare] error:",
      error,
    );


    return NextResponse.json(
      {
        ok: false,

        error:
          error?.message ||
          "결제 준비 중 오류가 발생했습니다.",

        code:
          error?.code ||
          "BILLING_PREPARE_ERROR",
      },
      {
        status: 500,
      },
    );
  }
}
