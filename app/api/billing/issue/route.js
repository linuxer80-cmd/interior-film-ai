import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  createTossIdempotencyKey,
  issueTossBillingKey,
} from "../../../../utils/tossBilling";


export const runtime = "nodejs";
export const maxDuration = 60;


/*
 * =========================================================
 * Supabase Service Role Client
 *
 * 서버에서만 사용합니다.
 * 브라우저로 service role key가 노출되면 안 됩니다.
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
 * Bearer Token 추출
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
 * 카드사 표시값 추출
 *
 * Toss Billing 객체 버전에 따라
 * issuerCode / company 등이 다를 수 있으므로
 * 안전하게 처리합니다.
 * =========================================================
 */

function getCardCompany(
  billing,
) {
  return (
    billing?.card?.issuerCode ||
    billing?.card?.acquirerCode ||
    billing?.cardCompany ||
    null
  );
}


/*
 * =========================================================
 * 마스킹 카드번호 추출
 *
 * Toss 응답에서 받은 마스킹 카드번호만 저장합니다.
 * 원본 카드번호 / CVC는 저장하지 않습니다.
 * =========================================================
 */

function getMaskedCardNumber(
  billing,
) {
  const number =
    billing?.card?.number ||
    billing?.cardNumber ||
    "";

  if (!number) {
    return null;
  }

  return String(number);
}


/*
 * =========================================================
 * POST /api/billing/issue
 * =========================================================
 */

export async function POST(
  request,
) {
  let admin = null;

  let checkoutSession = null;

  try {
    admin =
      getAdminSupabase();


    /*
     * =====================================================
     * 1. 로그인 사용자 확인
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
        "[billing/issue] auth error:",
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
     * 2. 요청값 읽기
     * =====================================================
     */

    let body = null;

    try {
      body =
        await request.json();
    } catch {
      body = null;
    }


    const authKey =
      String(
        body?.authKey || "",
      ).trim();

    const customerKey =
      String(
        body?.customerKey || "",
      ).trim();

    const checkoutSessionId =
      String(
        body?.checkoutSessionId ||
          "",
      ).trim();


    if (!authKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "authKey가 없습니다.",
        },
        {
          status: 400,
        },
      );
    }


    if (!customerKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "customerKey가 없습니다.",
        },
        {
          status: 400,
        },
      );
    }


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
     * 3. 로그인 사용자의 회사 확인
     *
     * 브라우저에서 company_id를 받지 않습니다.
     * profiles에서 서버가 직접 확인합니다.
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
        "[billing/issue] profile error:",
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
     * =====================================================
     * 4. 업체 활성 상태 확인
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
        "[billing/issue] company error:",
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
     * 5. checkout session 확인
     *
     * 여기서 브라우저가 전달한 값과
     * 우리가 prepare 단계에서 만든 DB 값을
     * 다시 대조합니다.
     * =====================================================
     */

    const {
      data: checkoutRow,
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
            created_at
          `,
        )
        .eq(
          "id",
          checkoutSessionId,
        )
        .maybeSingle();


    if (checkoutError) {
      console.error(
        "[billing/issue] checkout error:",
        checkoutError,
      );

      throw new Error(
        "결제 세션을 확인하지 못했습니다.",
      );
    }


    if (!checkoutRow) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "유효하지 않은 결제 세션입니다.",
        },
        {
          status: 404,
        },
      );
    }


    checkoutSession =
      checkoutRow;


    /*
     * 다른 업체의 checkout session 사용 차단
     */

    if (
      checkoutSession.company_id !==
      company.id
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "결제 세션의 업체 정보가 일치하지 않습니다.",
        },
        {
          status: 403,
        },
      );
    }


    /*
     * Toss redirect customerKey와
     * prepare 단계 customerKey 대조
     */

    if (
      checkoutSession.customer_key !==
      customerKey
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
     * 현재 단계에서는 prepared 상태만 허용
     */

    if (
      checkoutSession.status !==
      "prepared"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "이미 처리되었거나 사용할 수 없는 결제 세션입니다.",
        },
        {
          status: 409,
        },
      );
    }


    /*
     * checkout session 만료 확인
     */

    const expiresAt =
      new Date(
        checkoutSession.expires_at,
      ).getTime();

    if (
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    ) {
      await admin
        .from(
          "billing_checkout_sessions",
        )
        .update({
          status: "expired",
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          checkoutSession.id,
        )
        .eq(
          "status",
          "prepared",
        );

      return NextResponse.json(
        {
          ok: false,
          error:
            "결제 세션이 만료되었습니다. 요금제를 다시 선택해주세요.",
        },
        {
          status: 410,
        },
      );
    }


    /*
     * =====================================================
     * 6. 선택한 요금제를 DB에서 다시 검증
     *
     * checkout session의 가격도
     * 현재 DB 가격과 일치하는지 확인합니다.
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
          checkoutSession.plan_code,
        )
        .eq(
          "is_active",
          true,
        )
        .maybeSingle();


    if (planError) {
      console.error(
        "[billing/issue] plan error:",
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
            "선택한 요금제를 사용할 수 없습니다.",
        },
        {
          status: 400,
        },
      );
    }


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


    const planPrice =
      Number(
        plan.monthly_price_krw,
      );

    const checkoutPrice =
      Number(
        checkoutSession.amount_krw,
      );


    if (
      !Number.isInteger(
        planPrice,
      ) ||
      planPrice <= 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "요금제 가격이 올바르지 않습니다.",
        },
        {
          status: 400,
        },
      );
    }


    if (
      planPrice !==
      checkoutPrice
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
     * 7. billing_customer 확인
     *
     * prepare 단계에서 만든 customerKey와
     * 다시 한 번 일치 여부를 확인합니다.
     * =====================================================
     */

    const {
      data: billingCustomer,
      error:
        billingCustomerError,
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


    if (
      billingCustomerError
    ) {
      console.error(
        "[billing/issue] billing customer error:",
        billingCustomerError,
      );

      throw new Error(
        "결제 고객 정보를 확인하지 못했습니다.",
      );
    }


    if (!billingCustomer) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "결제 고객 정보가 없습니다. 요금제를 다시 선택해주세요.",
        },
        {
          status: 400,
        },
      );
    }


    if (
      billingCustomer.customer_key !==
      customerKey
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "등록된 결제 고객키와 일치하지 않습니다.",
        },
        {
          status: 400,
        },
      );
    }


    /*
     * =====================================================
     * 8. Toss 빌링키 발급
     *
     * authKey는 일회성 인증키입니다.
     * billingKey는 브라우저에 반환하지 않습니다.
     * =====================================================
     */

    const tossBilling =
      await issueTossBillingKey({
        authKey,
        customerKey,
        idempotencyKey:
          createTossIdempotencyKey(),
      });


    const billingKey =
      tossBilling?.billingKey;


    if (!billingKey) {
      throw new Error(
        "Toss에서 billingKey를 반환하지 않았습니다.",
      );
    }


    /*
     * =====================================================
     * 9. billingKey + 마스킹 카드정보 저장
     *
     * 원본 카드번호 / CVC 저장 안 함
     * =====================================================
     */

    const cardCompany =
      getCardCompany(
        tossBilling,
      );

    const maskedCardNumber =
      getMaskedCardNumber(
        tossBilling,
      );


    const {
      error:
        billingUpdateError,
    } =
      await admin
        .from(
          "billing_customers",
        )
        .update({
          billing_key:
            billingKey,

          card_company:
            cardCompany,

          card_number_masked:
            maskedCardNumber,

          is_active: true,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          billingCustomer.id,
        )
        .eq(
          "company_id",
          company.id,
        )
        .eq(
          "customer_key",
          customerKey,
        );


    if (
      billingUpdateError
    ) {
      console.error(
        "[billing/issue] billing key save error:",
        billingUpdateError,
      );

      throw new Error(
        "발급된 결제수단을 저장하지 못했습니다.",
      );
    }


    /*
     * =====================================================
     * 10. checkout session 상태 변경
     *
     * authorized =
     * 카드등록 + billingKey 발급 완료
     *
     * 아직 paid가 아닙니다.
     * =====================================================
     */

    const nowIso =
      new Date().toISOString();


    const {
      error:
        checkoutUpdateError,
    } =
      await admin
        .from(
          "billing_checkout_sessions",
        )
        .update({
          status:
            "authorized",

          updated_at:
            nowIso,
        })
        .eq(
          "id",
          checkoutSession.id,
        )
        .eq(
          "status",
          "prepared",
        );


    if (
      checkoutUpdateError
    ) {
      console.error(
        "[billing/issue] checkout update error:",
        checkoutUpdateError,
      );

      throw new Error(
        "결제 세션 상태를 저장하지 못했습니다.",
      );
    }


    /*
     * =====================================================
     * 11. billing event 기록
     *
     * billingKey / authKey는 metadata에 기록하지 않습니다.
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
            "billing_key_issued",

          provider:
            "toss",

          event_data: {
            checkout_session_id:
              checkoutSession.id,

            plan_code:
              plan.plan_code,

            amount_krw:
              planPrice,

            card_company:
              cardCompany,

            has_masked_card_number:
              Boolean(
                maskedCardNumber,
              ),
          },
        });


    if (eventError) {
      /*
       * 이벤트 로그 실패 때문에
       * 이미 발급된 billingKey를 실패 처리하지는 않습니다.
       */
      console.error(
        "[billing/issue] billing event error:",
        eventError,
      );
    }


    /*
     * =====================================================
     * 12. 성공 응답
     *
     * 절대로 billingKey를 브라우저에 반환하지 않습니다.
     *
     * 그리고 여기서는:
     * - subscriptions 생성 안 함
     * - payments paid 처리 안 함
     * - companies.subscription_plan 변경 안 함
     *
     * 최초 결제 성공 단계에서 처리합니다.
     * =====================================================
     */

    return NextResponse.json(
      {
        ok: true,

        checkoutSessionId:
          checkoutSession.id,

        status:
          "authorized",

        company: {
          id:
            company.id,

          company_name:
            company.company_name,
        },

        plan: {
          plan_code:
            plan.plan_code,

          plan_name:
            plan.plan_name,

          monthly_price_krw:
            planPrice,
        },

        paymentMethod: {
          registered: true,

          card_company:
            cardCompany,

          card_number_masked:
            maskedCardNumber,
        },
      },
      {
        status: 200,
      },
    );

  } catch (error) {
    console.error(
      "[billing/issue] error:",
      error,
    );


    /*
     * Toss 또는 서버 처리 실패 기록
     *
     * checkout session을 찾은 상태라면
     * failed로 기록합니다.
     */
    if (
      admin &&
      checkoutSession?.id
    ) {
      try {
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
            "prepared",
          );


        await admin
          .from(
            "billing_events",
          )
          .insert({
            company_id:
              checkoutSession
                .company_id,

            event_type:
              "billing_key_issue_failed",

            provider:
              "toss",

            event_data: {
              checkout_session_id:
                checkoutSession.id,

              plan_code:
                checkoutSession
                  .plan_code,

              error_code:
                error?.code ||
                null,

              error_message:
                error?.message ||
                "unknown error",
            },
          });
      } catch (
        logError
      ) {
        console.error(
          "[billing/issue] failure log error:",
          logError,
        );
      }
    }


    const status =
      Number(
        error?.status,
      ) >= 400 &&
      Number(
        error?.status,
      ) <= 599
        ? Number(
            error.status,
          )
        : 500;


    return NextResponse.json(
      {
        ok: false,

        error:
          error?.message ||
          "카드 등록 처리 중 오류가 발생했습니다.",

        code:
          error?.code ||
          "BILLING_ISSUE_ERROR",
      },
      {
        status,
      },
    );
  }
}
