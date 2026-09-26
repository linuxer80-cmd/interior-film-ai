import { createClient } from "@supabase/supabase-js";

/*
 * =========================================================
 * 서버 전용 Supabase
 * =========================================================
 */

export function getUsageAdminSupabase() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

/*
 * =========================================================
 * 사용량 종류
 * =========================================================
 */

export const USAGE_LIMITS = {
  ai_photo_analysis: {
    limitField:
      "ai_photo_analysis_limit",
    label: "AI 사진분석",
    unit: "회",
  },

  auto_estimate: {
    limitField:
      "auto_estimate_limit",
    label: "자동견적",
    unit: "회",
  },

  similar_image_search: {
    limitField:
      "similar_image_search_limit",
    label: "유사이미지 검색",
    unit: "회",
  },

  virtual_remodel: {
    limitField:
      "virtual_remodel_limit",
    label: "가상시공",
    unit: "회",
  },

  image_upload: {
    limitField:
      "image_upload_limit",
    label: "이미지 업로드",
    unit: "장",
  },

  storage_mb: {
    limitField:
      "storage_mb_limit",
    label: "저장용량",
    unit: "MB",
  },

  customer_lead: {
    limitField:
      "customer_lead_limit",
    label: "고객상담",
    unit: "건",
  },
};

/*
 * =========================================================
 * 한국시간 기준 이번 달 범위
 *
 * BASIC / PRO / BUSINESS에서 사용합니다.
 *
 * TRIAL은 월별 초기화가 없으므로
 * 이 범위를 사용하지 않습니다.
 * =========================================================
 */

function getCurrentKoreanMonthRange() {
  const now = new Date();

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
      }
    ).formatToParts(now);

  const year = Number(
    parts.find(
      (item) =>
        item.type === "year"
    )?.value
  );

  const month = Number(
    parts.find(
      (item) =>
        item.type === "month"
    )?.value
  );

  /*
   * 한국시간 00:00은 UTC 전날 15:00
   */

  const monthStart =
    new Date(
      Date.UTC(
        year,
        month - 1,
        1,
        -9,
        0,
        0,
        0
      )
    );

  const nextMonthStart =
    new Date(
      Date.UTC(
        month === 12
          ? year + 1
          : year,

        month === 12
          ? 0
          : month,

        1,
        -9,
        0,
        0,
        0
      )
    );

  return {
    monthStart,
    nextMonthStart,
  };
}

/*
 * =========================================================
 * 업체 조회
 * =========================================================
 */

export async function resolveUsageCompany(
  companySlug
) {
  const normalizedSlug =
    String(companySlug || "")
      .trim()
      .toLowerCase();

  if (!normalizedSlug) {
    return {
      ok: false,
      status: 400,
      error:
        "company_slug가 없습니다.",
    };
  }

  if (
    !/^[a-z0-9-]+$/.test(
      normalizedSlug
    )
  ) {
    return {
      ok: false,
      status: 400,
      error:
        "올바르지 않은 회사 주소입니다.",
    };
  }

  const supabase =
    getUsageAdminSupabase();

  if (!supabase) {
    return {
      ok: false,
      status: 500,
      error:
        "Supabase 서버 설정을 확인할 수 없습니다.",
    };
  }

  const {
    data: company,
    error,
  } = await supabase
    .from("companies")
    .select(`
      id,
      slug,
      company_name,
      subscription_plan,
      is_active
    `)
    .eq(
      "slug",
      normalizedSlug
    )
    .maybeSingle();

  if (error) {
    console.error(
      "USAGE COMPANY LOOKUP ERROR:",
      error
    );

    return {
      ok: false,
      status: 500,
      error:
        "회사 정보를 확인하지 못했습니다.",
    };
  }

  if (
    !company ||
    company.is_active === false
  ) {
    return {
      ok: false,
      status: 404,
      error:
        "사용할 수 없는 회사 주소입니다.",
    };
  }

  return {
    ok: true,
    supabase,
    company,
  };
}

/*
 * =========================================================
 * 사용량 합계 조회
 *
 * TRIAL
 * - 회사의 전체 usage_events 누적
 * - 월이 바뀌어도 초기화하지 않음
 * - 유료 구독 후 TRIAL로 복귀해도 과거 사용량 유지
 *
 * BASIC / PRO / BUSINESS
 * - 기존과 동일
 * - KST 기준 이번 달 사용량
 * =========================================================
 */

async function getUsedQuantity({
  supabase,
  companyId,
  eventType,
  isTrial,
}) {
  let query =
    supabase
      .from("usage_events")
      .select("quantity")
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "event_type",
        eventType
      );

  /*
   * TRIAL은 날짜 조건을 넣지 않습니다.
   *
   * 즉 회사 생성 이후 기록된 해당 event_type의
   * usage_events 전체를 합산합니다.
   */

  if (!isTrial) {
    const {
      monthStart,
      nextMonthStart,
    } =
      getCurrentKoreanMonthRange();

    query =
      query
        .gte(
          "created_at",
          monthStart.toISOString()
        )
        .lt(
          "created_at",
          nextMonthStart.toISOString()
        );
  }

  const {
    data: usageRows,
    error: usageError,
  } = await query;

  if (usageError) {
    console.error(
      "USAGE LIMIT LOOKUP ERROR:",
      usageError
    );

    return {
      ok: false,
      error: usageError,
      used: 0,
    };
  }

  const used =
    (usageRows || [])
      .reduce(
        (sum, row) =>
          sum +
          Number(
            row?.quantity || 0
          ),
        0
      );

  return {
    ok: true,
    used,
  };
}

/*
 * =========================================================
 * 요금제 + 사용량 한도 검사
 *
 * requestedQuantity:
 * 이번 요청에서 사용할 양
 *
 * 예:
 * AI 사진 3장 = 3
 * 자동견적 = 1
 * 가상시공 = 1
 *
 * 0 한도 = 무제한
 *
 * TRIAL:
 * 전체 누적 한도
 *
 * BASIC / PRO / BUSINESS:
 * KST 이번 달 한도
 * =========================================================
 */

export async function checkUsageLimit({
  company,
  eventType,
  requestedQuantity = 1,
  supabase: providedSupabase = null,
}) {
  try {
    if (!company?.id) {
      return {
        ok: false,
        status: 400,
        error:
          "회사 정보가 없습니다.",
      };
    }

    const config =
      USAGE_LIMITS[eventType];

    if (!config) {
      return {
        ok: false,
        status: 400,
        error:
          `지원하지 않는 사용량 종류입니다: ${eventType}`,
      };
    }

    const supabase =
      providedSupabase ||
      getUsageAdminSupabase();

    if (!supabase) {
      return {
        ok: false,
        status: 503,
        error:
          "사용 한도를 확인할 수 없습니다.",
      };
    }

    const planCode =
      String(
        company.subscription_plan ||
        "basic"
      )
        .trim()
        .toLowerCase();

    const {
      data: plan,
      error: planError,
    } = await supabase
      .from(
        "subscription_plans"
      )
      .select(`
        plan_code,
        plan_name,
        is_active,
        ${config.limitField}
      `)
      .eq(
        "plan_code",
        planCode
      )
      .maybeSingle();

    if (planError) {
      console.error(
        "PLAN LIMIT LOOKUP ERROR:",
        planError
      );

      return {
        ok: false,
        status: 503,
        error:
          "요금제 사용 한도를 확인할 수 없습니다.",
      };
    }

    if (!plan) {
      return {
        ok: false,
        status: 503,
        error:
          "적용된 요금제를 찾을 수 없습니다.",
      };
    }

    if (
      plan.is_active === false
    ) {
      return {
        ok: false,
        status: 403,
        error:
          `${plan.plan_name || planCode} 요금제는 현재 사용할 수 없습니다.`,
      };
    }

    const normalizedPlanCode =
      String(
        plan.plan_code || ""
      )
        .trim()
        .toLowerCase();

    const isTrial =
      normalizedPlanCode ===
      "trial";

    const limit =
      Number(
        plan[
          config.limitField
        ] || 0
      );

    const requested =
      Math.max(
        0,
        Number(
          requestedQuantity || 0
        )
      );

    /*
     * 0 이하 = 무제한
     */

    if (
      !Number.isFinite(limit) ||
      limit <= 0
    ) {
      return {
        ok: true,

        unlimited: true,

        eventType,

        planCode:
          plan.plan_code,

        planName:
          plan.plan_name,

        usagePeriod:
          isTrial
            ? "lifetime"
            : "monthly",

        used: 0,

        limit: 0,

        requested,

        remaining: null,
      };
    }

    /*
     * 현재 사용량 조회
     *
     * TRIAL:
     * 전체 누적
     *
     * 유료 플랜:
     * 이번 달
     */

    const usageResult =
      await getUsedQuantity({
        supabase,
        companyId:
          company.id,
        eventType,
        isTrial,
      });

    if (!usageResult.ok) {
      return {
        ok: false,
        status: 503,
        error:
          "현재 사용량을 확인할 수 없습니다.",
      };
    }

    const used =
      Number(
        usageResult.used || 0
      );

    const remaining =
      Math.max(
        0,
        limit - used
      );

    /*
     * 이번 요청까지 포함해서 검사
     *
     * 예:
     * TRIAL 20회 한도
     * 누적 19회
     * 사진 2장 요청
     *
     * 19 + 2 > 20
     * → 시작 전에 차단
     */

    if (
      used + requested >
      limit
    ) {
      const periodLabel =
        isTrial
          ? "체험기간 누적"
          : "이번 달";

      return {
        ok: false,

        status: 429,

        limitReached: true,

        code:
          "USAGE_LIMIT_REACHED",

        eventType,

        label:
          config.label,

        unit:
          config.unit,

        planCode:
          plan.plan_code,

        planName:
          plan.plan_name,

        usagePeriod:
          isTrial
            ? "lifetime"
            : "monthly",

        used,

        limit,

        requested,

        remaining,

        error:
          `${plan.plan_name} 요금제의 ${periodLabel} ${config.label} 사용 한도(${limit}${config.unit})를 초과합니다. 현재 ${used}${config.unit} 사용, ${remaining}${config.unit} 남았습니다.`,
      };
    }

    return {
      ok: true,

      unlimited: false,

      eventType,

      label:
        config.label,

      unit:
        config.unit,

      planCode:
        plan.plan_code,

      planName:
        plan.plan_name,

      usagePeriod:
        isTrial
          ? "lifetime"
          : "monthly",

      used,

      limit,

      requested,

      remaining,

      remainingAfter:
        Math.max(
          0,
          remaining -
          requested
        ),
    };
  } catch (error) {
    console.error(
      "CHECK USAGE LIMIT ERROR:",
      error
    );

    return {
      ok: false,
      status: 503,
      error:
        "사용 한도를 확인하는 중 오류가 발생했습니다.",
    };
  }
}

/*
 * =========================================================
 * 한도 오류 → API 응답용 데이터
 * =========================================================
 */

export function makeUsageLimitError(
  result
) {
  const isTrialLifetime =
    result?.usagePeriod ===
    "lifetime";

  return {
    success: false,

    error:
      result?.error ||
      (
        isTrialLifetime
          ? "TRIAL 체험 사용 한도를 모두 사용했습니다."
          : "이번 달 사용 한도를 모두 사용했습니다."
      ),

    code:
      result?.code ||
      (
        result?.limitReached
          ? "USAGE_LIMIT_REACHED"
          : "USAGE_LIMIT_CHECK_FAILED"
      ),

    event_type:
      result?.eventType ||
      null,

    plan_code:
      result?.planCode ||
      null,

    plan_name:
      result?.planName ||
      null,

    usage_period:
      result?.usagePeriod ||
      null,

    used:
      Number(
        result?.used || 0
      ),

    limit:
      result?.limit ?? null,

    requested:
      Number(
        result?.requested || 0
      ),

    remaining:
      result?.remaining ?? null,
  };
    }
