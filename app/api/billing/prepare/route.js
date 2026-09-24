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
 * Toss customerKey
 * =========================================================
 */

function createCustomerKey() {
  return crypto.randomUUID();
}


/*
 * =========================================================
 * Checkout 만료시간
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
     * 1. 로그인 확인
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
     * 2. 요청 요금제
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
     * 3. Profile
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
            is_active
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
     * 4. 업체
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
     * 5. 현재 플랜과 동일한지 확인
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
     * 6. 요금제 DB 검증
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


    if (planCode === "trial") {
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
     * 7. 기존 Toss billing customer
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
     * 8. 없으면 생성
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
     * 9. 비활성 customer 재활성화
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
          "[billing/prepare] activate error:",
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
     * 10. customerKey
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
     * 실제 사용할 수 있는 기존 결제수단인지 판단
     */

    const hasPaymentMethod =
      Boolean(
        billingCustomer
          ?.billing_key,
      ) &&
      billingCustomer
        ?.is_active !== false;


    /*
     * 11. 만료된 prepared 정리
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
    }


    /*
     * =====================================================
     * 12. Checkout 생성
     *
     * 중요 변경:
     *
     * 기존 billingKey 있음
     * → authorized
     * → 카드등록 생략 가능
     *
     * billingKey 없음
     * → prepared
     * → Toss 카드등록 필요
     * =====================================================
     */

    const expiresAt =
      createCheckoutExpiresAt();

    const checkoutStatus =
      hasPaymentMethod
        ? "authorized"
        : "prepared";


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
            checkoutStatus,

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
     * 13. 이벤트
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
              hasPaymentMethod,

            checkout_status:
              checkoutStatus,

            expires_at:
              expiresAt,
          },
        });


    if (eventError) {
      console.error(
        "[billing/prepare] billing event error:",
        eventError,
      );
    }


    /*
     * 14. 브라우저 응답
     *
     * billingKey는 반환하지 않음
     */

    return NextResponse.json(
      {
        ok: true,

        checkoutSessionId:
          checkoutSession.id,

        checkoutStatus,

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

        hasPaymentMethod,

        paymentMethod:
          hasPaymentMethod
            ? {
                registered:
                  true,

                card_company:
                  billingCustomer
                    .card_company ||
                  null,

                card_number_masked:
                  billingCustomer
                    .card_number_masked ||
                  null,
              }
            : {
                registered:
                  false,

                card_company:
                  null,

                card_number_masked:
                  null,
              },

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
