import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });

export async function GET(request) {
  try {
    const token = (
      request.headers.get("authorization") || ""
    ).match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) {
      return json(
        { error: "관리자 로그인이 필요합니다." },
        401
      );
    }

    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return json(
        { error: "서버 설정을 확인해주세요." },
        503
      );
    }

    const db = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: auth,
      error: authError,
    } = await db.auth.getUser(token);

    if (authError || !auth?.user) {
      return json(
        { error: "다시 로그인해주세요." },
        401
      );
    }

    const {
      data: profile,
      error: profileError,
    } = await db
      .from("profiles")
      .select("company_id,role,is_active")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (
      !profile?.company_id ||
      profile.role !== "owner" ||
      profile.is_active === false
    ) {
      return json(
        { error: "업체 관리자 권한이 필요합니다." },
        403
      );
    }

    const {
      data: company,
      error: companyError,
    } = await db
      .from("companies")
      .select("id,subscription_plan,is_active")
      .eq("id", profile.company_id)
      .maybeSingle();

    if (companyError) throw companyError;

    if (!company || company.is_active === false) {
      return json(
        { error: "업체를 확인해주세요." },
        403
      );
    }

    const [plansResult, quotasResult] =
      await Promise.all([
        db
          .from("subscription_plans")
          .select(
            "plan_code,plan_name,monthly_price_krw,is_active"
          )
          .order("monthly_price_krw"),
        db
          .from("ai_feature_quotas")
          .select(
            "plan_code,feature,label,usage_limit"
          ),
      ]);

    if (plansResult.error) {
      throw plansResult.error;
    }

    if (quotasResult.error) {
      return json(
        {
          error:
            "추가 AI 횟수 제한 SQL이 아직 적용되지 않았거나 조회 권한을 확인해야 합니다.",
        },
        503
      );
    }

    const code = String(
      company.subscription_plan || "basic"
    ).toLowerCase();

    const parts = new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "numeric",
      }
    ).formatToParts(new Date());

    const year = Number(
      parts.find((p) => p.type === "year").value
    );

    const month = Number(
      parts.find((p) => p.type === "month").value
    );

    let start =
      code === "trial"
        ? "1970-01-01T00:00:00.000Z"
        : new Date(
            Date.UTC(year, month - 1, 1, -9)
          ).toISOString();

    if (code === "light") {
      const {
        data: subscription,
        error,
      } = await db
        .from("subscriptions")
        .select("current_period_start")
        .eq("company_id", company.id)
        .eq("plan_code", "light")
        .eq("status", "active")
        .order("current_period_start", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (
        error ||
        !subscription?.current_period_start
      ) {
        return json(
          {
            error:
              "라이트 결제기간을 확인해주세요.",
          },
          503
        );
      }

      if (
        new Date(subscription.current_period_start) >
        new Date(start)
      ) {
        start = new Date(
          subscription.current_period_start
        ).toISOString();
      }
    }

    const {
      data: periods,
      error: periodsError,
    } = await db
      .from("ai_quota_periods")
      .select("feature,used")
      .eq("scope_key", company.id)
      .eq("period_start", start);

    if (periodsError) {
      return json(
        {
          error:
            "AI 횟수 제한 SQL의 사용량 테이블을 확인해주세요.",
        },
        503
      );
    }

    return json({
      currentPlan: code,
      plans: (plansResult.data || [])
        .filter((p) => p.is_active !== false)
        .map((p) => ({
          ...p,
          features: (quotasResult.data || []).filter(
            (q) =>
              q.plan_code ===
              String(p.plan_code).toLowerCase()
          ),
        })),
      used: Object.fromEntries(
        (periods || []).map((p) => [
          p.feature,
          Number(p.used || 0),
        ])
      ),
    });
  } catch (error) {
    console.error(
      "AI quota overview failed",
      error.code || error.name
    );

    return json(
      {
        error:
          "AI 사용 횟수를 조회하지 못했습니다. 다시 확인해주세요.",
      },
      503
    );
  }
}
