import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

/*
 * =========================================================
 * Supabase 관리자 클라이언트
 * =========================================================
 */

function getAdminSupabase() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase 서버 환경변수가 설정되지 않았습니다.",
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
 * 요청 사용자의 JWT 추출
 *
 * 클라이언트에서
 * Authorization: Bearer <access_token>
 * 형태로 전달합니다.
 * =========================================================
 */

function getAccessToken(request) {
  const authorization =
    request.headers.get("authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization
    .slice(7)
    .trim();
}

/*
 * =========================================================
 * plan code 정리
 * =========================================================
 */

function normalizePlanCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/*
 * =========================================================
 * customerKey 생성
 *
 * Toss 권장사항에 맞춰
 * 이메일/전화번호/사용자ID가 아닌
 * 예측하기 어려운 랜덤 UUID 사용
 * =========================================================
 */

function createCustomerKey() {
  return crypto.randomUUID();
}

/*
 * =========================================================
 * POST
 * =========================================================
 */

export async function POST(request) {
  try {
    const supabase =
      getAdminSupabase();

    /*
     * -----------------------------------------------------
     * 1. 로그인 토큰 확인
     * -----------------------------------------------------
     */

    const accessToken =
      getAccessToken(request);

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            "로그인이 필요합니다.",
        },
        {
          status: 401,
        },
      );
    }

    /*
     * -----------------------------------------------------
     * 2. Supabase Auth에서 실제 사용자 확인
     *
     * Service Role을 사용하더라도
     * 브라우저가 보내온 user_id를 신뢰하지 않습니다.
     * access token 자체를 검증합니다.
     * -----------------------------------------------------
     */

    const {
      data: userData,
      error: userError,
    } =
      await supabase.auth.getUser(
        accessToken,
      );

    if (
      userError ||
      !userData?.user?.id
    ) {
      console.error(
        "Billing prepare 사용자 인증 실패:",
        userError?.message ||
          "사용자 없음",
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "로그인 정보를 확인할 수 없습니다.",
        },
        {
          status: 401,
        },
      );
    }

    const userId =
      userData.user.id;

    /*
     * -----------------------------------------------------
     * 3. 요청 Body
     *
     * 클라이언트에서는 plan_code만 받습니다.
     * 가격/company_id 등은 받지 않습니다.
     * -----------------------------------------------------
     */

    let body;

    try {
      body =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "요청 정보가 올바르지 않습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const planCode =
      normalizePlanCode(
        body?.plan_code,
      );

    if (!planCode) {
      return NextResponse.json(
        {
          success: false,
          error:
            "변경할 요금제를 선택해주세요.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * -----------------------------------------------------
     * 4. 로그인 사용자의 실제 company_id 확인
     * -----------------------------------------------------
     */

    const {
      data: profile,
      error: profileError,
    } =
      await supabase
        .from("profiles")
        .select(
          `
            id,
            company_id
          `,
        )
        .eq(
          "id",
          userId,
        )
        .maybeSingle();

    if (
      profileError ||
      !profile?.company_id
    ) {
      console.error(
        "Billing prepare profile 조회 실패:",
        profileError?.message ||
          "company_id 없음",
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "소속 업체 정보를 확인할 수 없습니다.",
        },
        {
          status: 403,
        },
      );
    }

    const companyId =
      profile.company_id;

    /*
     * -----------------------------------------------------
     * 5. 업체 활성 상태 확인
     * -----------------------------------------------------
     */

    const {
      data: company,
      error: companyError,
    } =
      await supabase
        .from("companies")
        .select(
          `
            id,
            company_name,
            slug,
            subscription_plan,
            is_active
          `,
        )
        .eq(
          "id",
          companyId,
        )
        .maybeSingle();

    if (
      companyError ||
      !company
    ) {
      console.error(
        "Billing prepare 업체 조회 실패:",
        companyError?.message ||
          "업체 없음",
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "업체 정보를 확인할 수 없습니다.",
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
          success: false,
          error:
            "현재 비활성화된 업체입니다.",
        },
        {
          status: 403,
        },
      );
    }

    /*
     * -----------------------------------------------------
     * 6. 선택한 요금제를 DB에서 다시 조회
     *
     * 가격은 절대 브라우저 값을 사용하지 않습니다.
     * -----------------------------------------------------
     */

    const {
      data: plan,
      error: planError,
    } =
      await supabase
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
          planCode,
        )
        .eq(
          "is_active",
          true,
        )
        .maybeSingle();

    if (
      planError ||
      !plan
    ) {
      console.error(
        "Billing prepare 요금제 조회 실패:",
        planError?.message ||
          "요금제 없음",
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "선택한 요금제를 확인할 수 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const normalizedDbPlanCode =
      normalizePlanCode(
        plan.plan_code,
      );

    /*
     * -----------------------------------------------------
     * 7. TRIAL은 결제용으로 선택 불가
     * -----------------------------------------------------
     */

    if (
      normalizedDbPlanCode ===
      "trial"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "TRIAL 요금제는 결제로 변경할 수 없습니다.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * -----------------------------------------------------
     * 8. 유료 요금제 금액 검증
     * -----------------------------------------------------
     */

    const monthlyPrice =
      Number(
        plan.monthly_price_krw,
      );

    if (
      !Number.isInteger(
        monthlyPrice,
      ) ||
      monthlyPrice <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "요금제 결제금액 설정이 올바르지 않습니다.",
        },
        {
          status: 500,
        },
      );
    }

    /*
     * -----------------------------------------------------
     * 9. 현재 요금제와 같은지 확인
     * -----------------------------------------------------
     */

    const currentPlanCode =
      normalizePlanCode(
        company.subscription_plan,
      );

    if (
      currentPlanCode ===
      normalizedDbPlanCode
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "이미 이용 중인 요금제입니다.",
        },
        {
          status: 409,
        },
      );
    }

    /*
     * -----------------------------------------------------
     * 10. 기존 billing customer 확인
     * -----------------------------------------------------
     */

    const {
      data:
        existingBillingCustomer,
      error:
        billingCustomerError,
    } =
      await supabase
        .from(
          "billing_customers",
        )
        .select(
          `
            id,
            company_id,
            customer_key,
            billing_key,
            is_active
          `,
        )
        .eq(
          "company_id",
          companyId,
        )
        .maybeSingle();

    if (
      billingCustomerError
    ) {
      console.error(
        "Billing customer 조회 실패:",
        billingCustomerError,
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "결제 고객 정보를 확인하지 못했습니다.",
        },
        {
          status: 500,
        },
      );
    }

    let billingCustomer =
      existingBillingCustomer;

    /*
     * -----------------------------------------------------
     * 11. 처음 결제하는 업체라면 customerKey 생성
     * -----------------------------------------------------
     */

    if (!billingCustomer) {
      const customerKey =
        createCustomerKey();

      const {
        data:
          createdBillingCustomer,
        error:
          createBillingCustomerError,
      } =
        await supabase
          .from(
            "billing_customers",
          )
          .insert({
            company_id:
              companyId,

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
              customer_key,
              billing_key,
              is_active
            `,
          )
          .single();

      if (
        createBillingCustomerError ||
        !createdBillingCustomer
      ) {
        console.error(
          "Billing customer 생성 실패:",
          createBillingCustomerError,
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "결제 고객 정보를 생성하지 못했습니다.",
          },
          {
            status: 500,
          },
        );
      }

      billingCustomer =
        createdBillingCustomer;
    }

    /*
     * -----------------------------------------------------
     * 12. 비활성 customer라면 다시 활성화
     * -----------------------------------------------------
     */

    if (
      billingCustomer.is_active ===
      false
    ) {
      const {
        data:
          activatedBillingCustomer,
        error:
          activateError,
      } =
        await supabase
          .from(
            "billing_customers",
          )
          .update({
            is_active:
              true,
          })
          .eq(
            "id",
            billingCustomer.id,
          )
          .select(
            `
              id,
              company_id,
              customer_key,
              billing_key,
              is_active
            `,
          )
          .single();

      if (
        activateError ||
        !activatedBillingCustomer
      ) {
        console.error(
          "Billing customer 활성화 실패:",
          activateError,
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "결제 고객 정보를 활성화하지 못했습니다.",
          },
          {
            status: 500,
          },
        );
      }

      billingCustomer =
        activatedBillingCustomer;
    }

    /*
     * -----------------------------------------------------
     * 13. Billing 준비 이벤트 기록
     *
     * 실패해도 prepare 자체는 실패시키지 않습니다.
     * -----------------------------------------------------
     */

    const {
      error: eventError,
    } =
      await supabase
        .from(
          "billing_events",
        )
        .insert({
          company_id:
            companyId,

          event_type:
            "billing_prepare",

          provider:
            "toss",

          event_data: {
            requested_plan:
              plan.plan_code,

            current_plan:
              company.subscription_plan,

            monthly_price_krw:
              monthlyPrice,

            user_id:
              userId,
          },
        });

    if (eventError) {
      console.error(
        "Billing prepare 이벤트 기록 실패:",
        eventError,
      );
    }

    /*
     * -----------------------------------------------------
     * 14. 성공
     *
     * 중요:
     * billing_key는 브라우저로 절대 반환하지 않습니다.
     * -----------------------------------------------------
     */

    return NextResponse.json({
      success: true,

      company: {
        id:
          company.id,

        name:
          company.company_name,

        slug:
          company.slug,
      },

      plan: {
        code:
          plan.plan_code,

        name:
          plan.plan_name,

        monthly_price_krw:
          monthlyPrice,
      },

      customerKey:
        billingCustomer.customer_key,

      hasPaymentMethod:
        Boolean(
          billingCustomer.billing_key,
        ),
    });
  } catch (error) {
    console.error(
      "Billing prepare API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "결제 준비 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
        }
