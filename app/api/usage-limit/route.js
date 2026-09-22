import { NextResponse } from "next/server";
import {
  resolveUsageCompany,
  checkUsageLimit,
  makeUsageLimitError,
} from "../../utils/serverUsageLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * =========================================================
 * 사용 가능한 이벤트
 * =========================================================
 */

const ALLOWED_EVENT_TYPES =
  new Set([
    "ai_photo_analysis",
    "auto_estimate",
    "similar_image_search",
    "virtual_remodel",
    "image_upload",
    "storage_mb",
    "customer_lead",
  ]);

/*
 * =========================================================
 * POST
 *
 * 실제 AI / 검색 / 업로드 등을 실행하기 전에
 * 현재 요금제 사용 가능 여부를 확인합니다.
 *
 * 요청 예:
 *
 * {
 *   company_slug: "company-123",
 *   event_type: "ai_photo_analysis",
 *   requested_quantity: 3
 * }
 * =========================================================
 */

export async function POST(request) {
  try {
    const body =
      await request.json();

    const companySlug =
      String(
        body?.company_slug || ""
      )
        .trim()
        .toLowerCase();

    const eventType =
      String(
        body?.event_type || ""
      ).trim();

    const requestedQuantityRaw =
      Number(
        body?.requested_quantity ??
        1
      );

    /*
     * =====================================================
     * company_slug 검사
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
     * event_type 검사
     * =====================================================
     */

    if (
      !ALLOWED_EVENT_TYPES.has(
        eventType
      )
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "확인할 수 없는 사용량 항목입니다.",

          code:
            "INVALID_USAGE_EVENT_TYPE",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * storage_mb는 현재 별도 usage_event가 아니라
     * image_upload metadata의 file_size_mb로 계산하므로
     * 이 공통 사전검사에서는 제외합니다.
     *
     * 저장용량의 실제 강제 제한은
     * /api/estimate-photo에서 파일 크기까지 포함해
     * 검사합니다.
     * =====================================================
     */

    if (
      eventType ===
      "storage_mb"
    ) {
      return NextResponse.json(
        {
          success: false,

          code:
            "STORAGE_LIMIT_USE_UPLOAD_API",

          error:
            "저장용량은 사진 업로드 API에서 실제 파일 크기를 기준으로 확인합니다.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * 요청 수량 검사
     * =====================================================
     */

    if (
      !Number.isFinite(
        requestedQuantityRaw
      ) ||
      requestedQuantityRaw <= 0
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "requested_quantity가 올바르지 않습니다.",
        },
        {
          status: 400,
        }
      );
    }

    const requestedQuantity =
      Number(
        requestedQuantityRaw
      );

    /*
     * =====================================================
     * 회사 확인
     *
     * company_id는 브라우저에서 받지 않습니다.
     * slug를 이용해 서버에서 직접 확인합니다.
     * =====================================================
     */

    const companyResult =
      await resolveUsageCompany(
        companySlug
      );

    /*
     * helper 구현에 따라
     * 회사 객체 자체가 반환되는 경우와
     * { ok, company } 형태를 모두 처리합니다.
     */

    let company = null;

    if (
      companyResult?.company
    ) {
      company =
        companyResult.company;
    } else if (
      companyResult?.id
    ) {
      company =
        companyResult;
    }

    if (!company) {
      const status =
        Number(
          companyResult?.status
        ) || 404;

      return NextResponse.json(
        {
          success: false,

          code:
            companyResult?.code ||
            "COMPANY_NOT_AVAILABLE",

          error:
            companyResult?.error ||
            "사용할 수 없는 회사 주소입니다.",
        },
        {
          status,
        }
      );
    }

    /*
     * =====================================================
     * 사용량 한도 검사
     * =====================================================
     */

    const limitCheck =
      await checkUsageLimit({
        company,

        eventType,

        requestedQuantity,
      });

    /*
     * =====================================================
     * 한도 초과 / 검사 실패
     * =====================================================
     */

    if (!limitCheck.ok) {
      const payload =
        makeUsageLimitError(
          limitCheck
        );

      const isLimitReached =
        Number(
          limitCheck.status
        ) === 429;

      return NextResponse.json(
        {
          ...payload,

          success: false,

          code:
            isLimitReached
              ? "USAGE_LIMIT_REACHED"
              : "USAGE_LIMIT_CHECK_FAILED",

          event_type:
            eventType,

          requested_quantity:
            requestedQuantity,
        },
        {
          status:
            limitCheck.status ||
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
     * 사용 가능
     * =====================================================
     */

    const used =
      Number(
        limitCheck.used || 0
      );

    const unlimited =
      Boolean(
        limitCheck.unlimited
      );

    const limit =
      unlimited
        ? null
        : Number(
            limitCheck.limit || 0
          );

    const remaining =
      unlimited
        ? null
        : Math.max(
            0,
            limit - used
          );

    const remainingAfterRequest =
      unlimited
        ? null
        : Math.max(
            0,
            limit -
              (
                used +
                requestedQuantity
              )
          );

    return NextResponse.json({
      success: true,

      allowed: true,

      event_type:
        eventType,

      requested_quantity:
        requestedQuantity,

      plan_code:
        limitCheck.planCode ||
        company.subscription_plan ||
        null,

      plan_name:
        limitCheck.planName ||
        null,

      used,

      limit,

      remaining,

      remaining_after_request:
        remainingAfterRequest,

      unlimited,
    });
  } catch (error) {
    console.error(
      "USAGE LIMIT PREFLIGHT ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        allowed: false,

        code:
          "USAGE_LIMIT_CHECK_FAILED",

        error:
          error?.message ||
          "사용량 한도를 확인하지 못했습니다.",
      },
      {
        status: 503,
      }
    );
  }
            }
