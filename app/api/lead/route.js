import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  checkUsageLimit,
  makeUsageLimitError,
} from "../../utils/serverUsageLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * =========================================================
 * Supabase 관리자 클라이언트
 * =========================================================
 */

function createAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase 서버 환경 변수가 설정되지 않았습니다."
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
    }
  );
}

/*
 * =========================================================
 * 공통 유틸
 * =========================================================
 */

function nullableText(value) {
  const text =
    String(value || "").trim();

  return text || null;
}

function nullableNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.round(number);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

/*
 * =========================================================
 * 고객상담 사용량 기록
 *
 * customer_leads 저장 성공 후에만 기록합니다.
 *
 * 중요:
 * 사용량 기록이 실패해도
 * 이미 저장된 고객 상담 신청은 실패 처리하지 않습니다.
 * =========================================================
 */

async function recordCustomerLeadUsage({
  supabase,
  company,
  lead,
  leadPayload,
  usageId,
}) {
  if (
    !supabase ||
    !company?.id ||
    !lead?.id
  ) {
    return false;
  }

  try {
    const {
      error: usageEventError,
    } = await supabase
      .from("usage_events")
      .insert({
        company_id:
          company.id,

        event_type:
          "customer_lead",

        quantity: 1,

        cost_krw: 0,

        provider: null,

        model: null,

        reference_id:
          lead.id,

        metadata: {
          company_slug:
            company.slug ||
            null,

          subscription_plan:
            company.subscription_plan ||
            null,

          lead_id:
            lead.id,

          source:
            "customer_estimate",

          category:
            leadPayload?.category ||
            null,

          sub_category:
            leadPayload?.sub_category ||
            null,

          region:
            leadPayload?.region ||
            null,

          photo_count:
            Array.isArray(
              leadPayload?.customer_photo_paths
            )
              ? leadPayload
                  .customer_photo_paths
                  .length
              : 0,

          estimate_min:
            leadPayload?.estimate_min ??
            null,

          estimate_max:
            leadPayload?.estimate_max ??
            null,

          estimate_average:
            leadPayload?.estimate_average ??
            null,

          estimate_usage_id:
            usageId &&
            isUuid(usageId)
              ? usageId
              : null,
        },
      });

    if (usageEventError) {
      console.error(
        "CUSTOMER LEAD USAGE INSERT ERROR:",
        usageEventError
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "CUSTOMER LEAD USAGE RECORD ERROR:",
      error
    );

    return false;
  }
}

/*
 * =========================================================
 * POST
 * =========================================================
 */

export async function POST(request) {
  try {
    /*
     * =====================================================
     * 요청 데이터
     * =====================================================
     */

    const body =
      await request.json();

    const companySlug =
      nullableText(
        body.company_slug
      )?.toLowerCase() ||
      null;

    /*
     * =====================================================
     * 회사 주소 확인
     * =====================================================
     */

    if (!companySlug) {
      return NextResponse.json(
        {
          success: false,

          error:
            "company_slug가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !/^[a-z0-9-]+$/.test(
        companySlug
      )
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "올바르지 않은 회사 주소입니다.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * 기본 입력값 확인
     * =====================================================
     */

    const customerName =
      nullableText(
        body.customer_name
      );

    const phone =
      nullableText(
        body.phone
      );

    const region =
      nullableText(
        body.region
      );

    if (!customerName) {
      return NextResponse.json(
        {
          success: false,

          error:
            "고객명을 입력해주세요.",
        },
        {
          status: 400,
        }
      );
    }

    if (!phone) {
      return NextResponse.json(
        {
          success: false,

          error:
            "전화번호를 입력해주세요.",
        },
        {
          status: 400,
        }
      );
    }

    if (!region) {
      return NextResponse.json(
        {
          success: false,

          error:
            "시공 지역을 입력해주세요.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * 고객사진 경로 정리
     * =====================================================
     */

    let customerPhotoPaths = [];

    if (
      Array.isArray(
        body.customer_photo_paths
      )
    ) {
      customerPhotoPaths =
        body.customer_photo_paths
          .map((path) =>
            String(
              path || ""
            ).trim()
          )
          .filter(Boolean);
    }

    /*
     * 예전 1장 방식도 계속 지원합니다.
     */

    if (
      customerPhotoPaths.length ===
        0 &&
      body.customer_photo_path
    ) {
      customerPhotoPaths = [
        String(
          body.customer_photo_path
        ).trim(),
      ].filter(Boolean);
    }

    /*
     * 같은 사진 경로 중복 제거
     */

    customerPhotoPaths = [
      ...new Set(
        customerPhotoPaths
      ),
    ];

    const customerPhotoPath =
      customerPhotoPaths[0] ||
      null;

    /*
     * =====================================================
     * Supabase 관리자 연결
     * =====================================================
     */

    const supabase =
      createAdminClient();

    /*
     * =====================================================
     * company_slug → 실제 회사 조회
     *
     * 클라이언트가 보낸 company_id는 사용하지 않습니다.
     *
     * 요금제 확인을 위해
     * subscription_plan도 함께 조회합니다.
     * =====================================================
     */

    const {
      data: company,
      error: companyError,
    } = await supabase
      .from("companies")
      .select(
        `
          id,
          slug,
          company_name,
          subscription_plan,
          is_active
        `
      )
      .eq(
        "slug",
        companySlug
      )
      .eq(
        "is_active",
        true
      )
      .maybeSingle();

    if (companyError) {
      console.error(
        "회사 조회 오류:",
        companyError
      );

      return NextResponse.json(
        {
          success: false,

          error:
            "회사 정보를 확인하지 못했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    if (!company?.id) {
      return NextResponse.json(
        {
          success: false,

          error:
            "사용할 수 없는 회사 주소입니다.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * =====================================================
     * 고객상담 월 사용량 한도 검사
     *
     * 반드시 customer_leads INSERT 전에 검사합니다.
     *
     * 예: 체험판 10회
     *
     * 0 / 10  → 허용
     * 9 / 10  → 10번째 상담 허용
     * 10 / 10 → 다음 상담 차단
     *
     * 현재 공통 규칙:
     * limit <= 0 = 무제한
     * =====================================================
     */

    const leadLimitCheck =
      await checkUsageLimit({
        company,

        eventType:
          "customer_lead",

        requestedQuantity: 1,

        supabase,
      });

    if (!leadLimitCheck.ok) {
      const errorPayload =
        makeUsageLimitError(
          leadLimitCheck
        );

      /*
       * 공통 helper가 반환한 HTTP 상태를 기준으로
       * 실제 한도 초과와 검사 실패를 구분합니다.
       *
       * 429 = 사용량 한도 초과
       * 그 외 = 한도 검사 실패
       */

      const isLimitReached =
        Number(
          leadLimitCheck.status
        ) === 429;

      return NextResponse.json(
        {
          ...errorPayload,

          code:
            isLimitReached
              ? "CUSTOMER_LEAD_LIMIT_REACHED"
              : "CUSTOMER_LEAD_LIMIT_CHECK_FAILED",
        },
        {
          status:
            leadLimitCheck.status ||
            (
              isLimitReached
                ? 429
                : 503
            ),
        }
      );
    }

    /*
     * =====================================================
     * 고객 상담 저장 데이터
     * =====================================================
     */

    const leadPayload = {
      company_id:
        company.id,

      customer_name:
        customerName,

      phone,

      region,

      category:
        nullableText(
          body.category
        ),

      sub_category:
        nullableText(
          body.sub_category
        ),

      ai_description:
        nullableText(
          body.ai_description
        ),

      estimate_min:
        nullableNumber(
          body.estimate_min
        ),

      estimate_max:
        nullableNumber(
          body.estimate_max
        ),

      estimate_average:
        nullableNumber(
          body.estimate_average
        ),

      customer_photo_path:
        customerPhotoPath,

      customer_photo_paths:
        customerPhotoPaths,

      /*
       * 관리자 화면 상태값
       *
       * new
       * contacted
       * scheduled
       * completed
       * cancelled
       */

      status:
        "new",

      memo:
        nullableText(
          body.memo
        ),

      is_read:
        false,

      read_at:
        null,
    };

    /*
     * =====================================================
     * customer_leads INSERT
     *
     * 여기까지 왔다는 것은
     * 고객상담 사용량 한도를 통과한 상태입니다.
     * =====================================================
     */

    const {
      data,
      error,
    } = await supabase
      .from(
        "customer_leads"
      )
      .insert(
        leadPayload
      )
      .select(
        `
          id,
          company_id,
          customer_name,
          phone,
          region,
          customer_photo_path,
          customer_photo_paths,
          created_at
        `
      )
      .single();
