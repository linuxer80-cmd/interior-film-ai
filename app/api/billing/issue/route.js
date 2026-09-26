import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createTossIdempotencyKey,
  issueTossBillingKey,
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
 * 카드사
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
 * 마스킹 카드번호
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
 *
 * 멱등 처리:
 *
 * prepared
 *   → Toss billingKey 발급
 *   → authorized
 *
 * authorized
 *   → 기존 billingKey 확인
 *   → 다시 발급하지 않고 성공 반환
 *
 * paid
 *   → 이미 결제 완료
 *   → 다시 발급하지 않고 성공 반환
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
     * 1. 로그인
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


    /*
     * checkoutSessionId와 customerKey는
     * 모든 상태에서 반드시 필요합니다.
     */

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
     * 3. 사용자 업체
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
     * 4. 업체
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
     * 5. Checkout Session
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
     * 업체 검증
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
     * customerKey 검증
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
     * =====================================================
     * 6. 요금제 검증
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
     * 7. Billing Customer
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
     * 8. 이미 PAID
     *
     * 이미 최초 결제가 완료된 checkout입니다.
     * billingKey 재발급도 하지 않고,
     * 결제도 여기서는 하지 않습니다.
     * =====================================================
     */

    if (
      checkoutSession.status ===
      "paid"
    ) {
      return NextResponse.json(
        {
          ok: true,

          alreadyProcessed:
            true,

          checkoutSessionId:
            checkoutSession.id,

          status:
            "paid",

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
            registered:
              Boolean(
                billingCustomer.billing_key,
              ),

            card_company:
              billingCustomer.card_company ||
              null,

            card_number_masked:
              billingCustomer
                .card_number_masked ||
              null,
          },
        },
        {
          status: 200,
        },
      );
    }


    /*
     * =====================================================
     * 9. 이미 AUTHORIZED
     *
     * 카드 등록은 이미 끝났습니다.
     * authKey는 일회성이므로 다시 사용하면 안 됩니다.
     *
     * billingKey가 실제 DB에 존재하는 경우에만
     * 성공으로 반환합니다.
     * =====================================================
     */

    if (
      checkoutSession.status ===
      "authorized"
    ) {
      if (
        !billingCustomer.billing_key ||
        billingCustomer.is_active ===
          false
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "결제 세션은 승인되었지만 등록된 결제수단을 확인할 수 없습니다. 요금제를 다시 선택해주세요.",
          },
          {
            status: 409,
          },
        );
      }


      return NextResponse.json(
        {
          ok: true,

          alreadyAuthorized:
            true,

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
              billingCustomer.card_company ||
              null,

            card_number_masked:
              billingCustomer
                .card_number_masked ||
              null,
          },
        },
        {
          status: 200,
        },
      );
    }


    /*
     * =====================================================
     * 10. 허용하지 않는 checkout 상태
     * =====================================================
     */

    if (
      checkoutSession.status !==
      "prepared"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "이미 실패했거나 사용할 수 없는 결제 세션입니다. 요금제를 다시 선택해주세요.",
        },
        {
          status: 409,
        },
      );
    }


    /*
     * =====================================================
     * 11. prepared 상태에서는 authKey 필수
     * =====================================================
     */

    if (!authKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Toss 인증키(authKey)가 없습니다.",
        },
        {
          status: 400,
        },
      );
    }


    /*
     * =====================================================
     * 12. prepared 세션 만료 확인
     * =====================================================
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
          status:
            "expired",

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
     * 13. Toss billingKey 발급
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
     * 14. billingKey 저장
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

          is_active:
            true,

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
     * 15. Checkout → authorized
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
     * 16. Billing Event
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
      console.error(
        "[billing/issue] billing event error:",
        eventError,
      );
    }


    /*
     * =====================================================
     * 17. 성공
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
          registered:
            true,

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
     * prepared 상태에서 실제 발급 과정이 실패한 경우만
     * checkout을 failed 처리합니다.
     *
     * authorized / paid 재호출은 위에서 이미 반환되므로
     * 이 catch로 들어오지 않습니다.
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
