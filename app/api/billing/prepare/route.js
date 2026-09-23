import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export const runtime = "nodejs";

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

function getBearerToken(request) {
  const authorization = request.headers.get("authorization") || "";

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();

  return token || null;
}

function normalizePlanCode(value) {
  return String(value || "").trim().toLowerCase();
}

function createCustomerKey() {
  return crypto.randomUUID();
}

function getCheckoutExpiresAt() {
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

function safeErrorMessage(error) {
  if (!error) return "알 수 없는 오류가 발생했습니다.";

  if (typeof error === "string") {
    return error;
  }

  if (error.message) {
    return String(error.message);
  }

  return "알 수 없는 오류가 발생했습니다.";
}

export async function POST(request) {
  let supabase = null;

  try {
    /*
     * 1. 서버용 Supabase 연결
     */
    supabase = getAdminSupabase();

    /*
     * 2. 로그인 토큰 확인
     */
    const accessToken = getBearerToken(request);

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "로그인이 필요합니다.",
        },
        {
          status: 401,
        },
      );
    }

    /*
     * 3. 토큰으로 실제 로그인 사용자 확인
     *
     * 브라우저에서 user_id / company_id를 받지 않습니다.
     */
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      console.error(
        "[billing/prepare] auth error:",
        userError?.message || "user not found",
      );

      return NextResponse.json(
        {
          ok: false,
          error: "로그인 정보를 확인할 수 없습니다.",
        },
        {
          status: 401,
        },
      );
    }

    /*
     * 4. 요청 데이터 확인
     *
     * 클라이언트에서는 plan_code만 받습니다.
     * 금액은 절대 클라이언트 값을 사용하지 않습니다.
     */
    let body;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "요청 데이터가 올바르지 않습니다.",
        },
        {
          status: 400,
        },
      );
    }

    const requestedPlanCode = normalizePlanCode(body?.plan_code);

    if (!requestedPlanCode) {
      return NextResponse.json(
        {
          ok: false,
          error: "변경할 요금제를 선택해주세요.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * 5. 로그인 사용자 → profile → company_id 확인
     */
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error(
        "[billing/prepare] profile error:",
        profileError.message,
      );

      return NextResponse.json(
        {
          ok: false,
          error: "사용자 정보를 확인하지 못했습니다.",
        },
        {
          status: 500,
        },
      );
    }

    if (!profile?.company_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "연결된 업체 정보를 찾을 수 없습니다.",
        },
        {
          status: 403,
        },
      );
    }

    const companyId = profile.company_id;

    /*
     * 6. 업체 정보 확인
     */
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select(
        `
          id,
          company_name,
          subscription_plan,
          is_active
        `,
      )
      .eq("id", companyId)
      .maybeSingle();

    if (companyError) {
      console.error(
        "[billing/prepare] company error:",
        companyError.message,
      );

      return NextResponse.json(
        {
          ok: false,
          error: "업체 정보를 확인하지 못했습니다.",
        },
        {
          status: 500,
        },
      );
    }

    if (!company) {
      return NextResponse.json(
        {
          ok: false,
          error: "업체를 찾을 수 없습니다.",
        },
        {
          status: 404,
        },
      );
    }

    if (!company.is_active) {
      return NextResponse.json(
        {
          ok: false,
          error: "현재 비활성화된 업체입니다.",
        },
        {
          status: 403,
        },
      );
    }

    /*
     * 7. 변경하려는 요금제를 DB에서 조회
     *
     * 가격은 subscription_plans에서만 가져옵니다.
     */
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select(
        `
          plan_code,
          plan_name,
          monthly_price_krw,
          is_active
        `,
      )
      .ilike("plan_code", requestedPlanCode)
      .eq("is_active", true)
      .maybeSingle();

    if (planError) {
      console.error(
        "[billing/prepare] plan error:",
        planError.message,
      );

      return NextResponse.json(
        {
          ok: false,
          error: "요금제 정보를 확인하지 못했습니다.",
        },
        {
          status: 500,
        },
      );
    }

    if (!plan) {
      return NextResponse.json(
        {
          ok: false,
          error: "선택한 요금제를 찾을 수 없습니다.",
        },
        {
          status: 404,
        },
      );
    }

    const planCode = normalizePlanCode(plan.plan_code);
    const currentPlanCode = normalizePlanCode(
      company.subscription_plan,
    );

    /*
     * TRIAL은 결제 API를 거치지 않습니다.
     */
    if (planCode === "trial") {
      return NextResponse.json(
        {
          ok: false,
          error: "TRIAL 요금제는 결제 변경 대상이 아닙니다.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * 현재 요금제와 같은 요금제는 다시 결제하지 않습니다.
     */
    if (planCode === currentPlanCode) {
      return NextResponse.json(
        {
          ok: false,
          error: "현재 이용 중인 요금제입니다.",
        },
        {
          status: 409,
        },
      );
    }

    /*
     * 유료 요금제 금액 검증
     */
    const amountKrw = Number(plan.monthly_price_krw);

    if (
      !Number.isInteger(amountKrw) ||
      amountKrw <= 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "요금제 결제 금액이 올바르지 않습니다.",
        },
        {
          status: 500,
        },
      );
    }

    /*
     * 8. 기존 Toss billing customer 확인
     *
     * company당 Toss customer 1개를 사용하는 구조입니다.
     */
    const {
      data: existingBillingCustomer,
      error: billingCustomerFindError,
    } = await supabase
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
      .eq("company_id", companyId)
      .eq("provider", "toss")
      .maybeSingle();

    if (billingCustomerFindError) {
      console.error(
        "[billing/prepare] billing customer lookup error:",
        billingCustomerFindError.message,
      );

      return NextResponse.json(
        {
          ok: false,
          error: "결제 고객 정보를 확인하지 못했습니다.",
        },
        {
          status: 500,
        },
      );
    }

    let billingCustomer = existingBillingCustomer;

    /*
     * 9. Toss customer가 없으면 생성
     */
    if (!billingCustomer) {
      const customerKey = createCustomerKey();

      const {
        data: createdBillingCustomer,
        error: billingCustomerCreateError,
      } = await supabase
        .from("billing_customers")
        .insert({
          company_id: companyId,
          provider: "toss",
          customer_key: customerKey,
          is_active: true,
        })
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
        .single();

      if (billingCustomerCreateError) {
        console.error(
          "[billing/prepare] billing customer create error:",
          billingCustomerCreateError.message,
        );

        return NextResponse.json(
          {
            ok: false,
            error: "결제 고객 정보를 생성하지 못했습니다.",
          },
          {
            status: 500,
          },
        );
      }

      billingCustomer = createdBillingCustomer;
    }

    /*
     * 10. 기존 customer가 비활성화 상태라면 다시 활성화
     */
    if (!billingCustomer.is_active) {
      const {
        data: reactivatedBillingCustomer,
        error: billingCustomerUpdateError,
      } = await supabase
        .from("billing_customers")
        .update({
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", billingCustomer.id)
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
        .single();

      if (billingCustomerUpdateError) {
        console.error(
          "[billing/prepare] billing customer reactivate error:",
          billingCustomerUpdateError.message,
        );

        return NextResponse.json(
          {
            ok: false,
            error: "결제 고객 정보를 활성화하지 못했습니다.",
          },
          {
            status: 500,
          },
        );
      }

      billingCustomer = reactivatedBillingCustomer;
    }

    /*
     * customer_key가 없는 비정상 데이터 방어
     */
    if (!billingCustomer.customer_key) {
      console.error(
        "[billing/prepare] billing customer has no customer_key",
      );

      return NextResponse.json(
        {
          ok: false,
          error: "결제 고객 키가 올바르지 않습니다.",
        },
        {
          status: 500,
        },
      );
    }

    /*
     * 11. 이전에 준비만 하고 끝난 checkout session 만료 처리
     *
     * 이미 paid/failed 상태인 기록은 건드리지 않습니다.
     */
    const nowIso = new Date().toISOString();

    const { error: expireError } = await supabase
      .from("billing_checkout_sessions")
      .update({
        status: "expired",
        updated_at: nowIso,
      })
      .eq("company_id", companyId)
      .eq("status", "prepared")
      .lt("expires_at", nowIso);

    if (expireError) {
      /*
       * 만료 정리 실패가 새로운 결제 준비 자체를 막을 필요는 없으므로
       * 서버 로그만 남깁니다.
       */
      console.error(
        "[billing/prepare] old checkout expiration error:",
        expireError.message,
      );
    }

    /*
     * 12. 새 결제 checkout session 생성
     *
     * 여기 저장된 plan_code / amount_krw를
     * 이후 billingKey 발급 및 최초 결제에서 서버 기준값으로 사용합니다.
     */
    const expiresAt = getCheckoutExpiresAt();

    const {
      data: checkoutSession,
      error: checkoutError,
    } = await supabase
      .from("billing_checkout_sessions")
      .insert({
        company_id: companyId,
        customer_key: billingCustomer.customer_key,
        plan_code: plan.plan_code,
        amount_krw: amountKrw,
        status: "prepared",
        expires_at: expiresAt,
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
        "[billing/prepare] checkout session create error:",
        checkoutError.message,
      );

      return NextResponse.json(
        {
          ok: false,
          error: "결제 준비 세션을 생성하지 못했습니다.",
        },
        {
          status: 500,
        },
      );
    }

    /*
     * 13. billing event 기록
     *
     * billingKey나 secret key는 event_data에 저장하지 않습니다.
     */
    const { error: eventError } = await supabase
      .from("billing_events")
      .insert({
        company_id: companyId,
        event_type: "billing_prepare",
        provider: "toss",
        event_data: {
          checkout_session_id: checkoutSession.id,
          requested_plan_code: plan.plan_code,
          amount_krw: amountKrw,
          has_payment_method: Boolean(
            billingCustomer.billing_key,
          ),
          expires_at: expiresAt,
        },
      });

    if (eventError) {
      /*
       * 이벤트 로그 실패 때문에 결제 준비를 실패시키지는 않습니다.
       */
      console.error(
        "[billing/prepare] billing event error:",
        eventError.message,
      );
    }

    /*
     * 14. 브라우저에 필요한 최소 정보만 반환
     *
     * 중요:
     * - billing_key 반환 금지
     * - service role key 반환 금지
     * - Toss secret key 반환 금지
     *
     * customerKey는 Toss 카드 인증 SDK에서 필요하므로 반환합니다.
     */
    return NextResponse.json(
      {
        ok: true,

        checkoutSessionId: checkoutSession.id,

        company: {
          id: company.id,
          company_name: company.company_name,
        },

        plan: {
          plan_code: plan.plan_code,
          plan_name: plan.plan_name,
          monthly_price_krw: amountKrw,
        },

        customerKey: billingCustomer.customer_key,

        hasPaymentMethod: Boolean(
          billingCustomer.billing_key,
        ),

        expiresAt,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "[billing/prepare] unexpected error:",
      safeErrorMessage(error),
    );

    return NextResponse.json(
      {
        ok: false,
        error: "결제 준비 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
        }
