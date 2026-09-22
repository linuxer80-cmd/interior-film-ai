import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  checkUsageLimit,
  makeUsageLimitError,
} from "../../utils/serverUsageLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

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
 * POST
 *
 * 유사이미지 검색 1회 사용량 기록
 *
 * 추가 기능:
 * - 업체 요금제 확인
 * - similar_image_search_limit 확인
 * - 월 한도 초과 시 기록 차단
 * =========================================================
 */

export async function POST(request) {
  try {
    const body =
      await request.json();

    const {
      company_slug,
      category,
      sub_category,
      result_count,
      top_similarity,
    } = body || {};

    /*
     * =====================================================
     * 업체 slug 확인
     * =====================================================
     */

    const normalizedCompanySlug =
      String(company_slug || "")
        .trim()
        .toLowerCase();

    if (!normalizedCompanySlug) {
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
        normalizedCompanySlug
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
     * Supabase
     * =====================================================
     */

    const supabase =
      getAdminSupabase();

    if (!supabase) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Supabase 서버 환경변수를 확인해주세요.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 활성 업체 확인
     *
     * 브라우저에서 company_id를 받지 않고
     * company_slug로 서버에서 직접 확인합니다.
     *
     * 요금제 한도 확인을 위해
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
        normalizedCompanySlug
      )
      .eq(
        "is_active",
        true
      )
      .maybeSingle();

    if (companyError) {
      console.error(
        "SIMILAR SEARCH COMPANY LOOKUP ERROR:",
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
     * 유사이미지 검색 월 한도 검사
     *
     * 예:
     *
     * 체험판 한도 10회
     *
     * 0 / 10 → 허용
     * 9 / 10 → 마지막 1회 허용
     * 10 / 10 → 차단
     *
     * limit <= 0은 무제한입니다.
     * =====================================================
     */

    const limitCheck =
      await checkUsageLimit({
        company,

        eventType:
          "similar_image_search",

        requestedQuantity: 1,

        supabase,
      });

    /*
     * =====================================================
     * 한도 초과 또는 한도 확인 실패
     * =====================================================
     */

    if (!limitCheck.ok) {
      const errorPayload =
        makeUsageLimitError(
          limitCheck
        );

      return NextResponse.json(
        {
          ...errorPayload,

          code:
            limitCheck.limitReached
              ? "SIMILAR_IMAGE_SEARCH_LIMIT_REACHED"
              : "SIMILAR_IMAGE_SEARCH_LIMIT_CHECK_FAILED",
        },
        {
          status:
            limitCheck.status ||
            (
              limitCheck.limitReached
                ? 429
                : 503
            ),
        }
      );
    }

    /*
     * =====================================================
     * 값 정리
     * =====================================================
     */

    const safeResultCount =
      Number.isFinite(
        Number(result_count)
      )
        ? Number(result_count)
        : 0;

    const safeTopSimilarity =
      Number.isFinite(
        Number(top_similarity)
      )
        ? Number(top_similarity)
        : null;

    /*
     * =====================================================
     * usage_events 기록
     *
     * 실제 유사이미지 검색 1회 =
     * quantity 1
     * =====================================================
     */

    const {
      data: usageEvent,
      error: usageError,
    } = await supabase
      .from("usage_events")
      .insert({
        company_id:
          company.id,

        event_type:
          "similar_image_search",

        quantity: 1,

        cost_krw: 0,

        provider: null,

        model:
          "text-embedding-3-small",

        reference_id: null,

        metadata: {
          company_slug:
            company.slug,

          subscription_plan:
            company.subscription_plan ||
            null,

          category:
            category
              ? String(category)
              : null,

          sub_category:
            sub_category
              ? String(sub_category)
              : null,

          result_count:
            safeResultCount,

          top_similarity:
            safeTopSimilarity,
        },
      })
      .select("id")
      .single();

    /*
     * =====================================================
     * 사용량 기록 실패
     * =====================================================
     */

    if (usageError) {
      console.error(
        "SIMILAR SEARCH USAGE INSERT ERROR:",
        usageError
      );

      return NextResponse.json(
        {
          success: false,

          error:
            usageError.message ||
            "유사이미지 검색 사용량 저장 실패",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 성공 후 사용량 계산
     * =====================================================
     */

    const usedBefore =
      Number(
        limitCheck.used || 0
      );

    const usedAfter =
      usedBefore + 1;

    const limit =
      limitCheck.unlimited
        ? null
        : Number(
            limitCheck.limit || 0
          );

    const remaining =
      limitCheck.unlimited
        ? null
        : Math.max(
            0,
            limit - usedAfter
          );

    /*
     * =====================================================
     * 성공
     * =====================================================
     */

    return NextResponse.json({
      success: true,

      usage_event_id:
        usageEvent?.id ||
        null,

      planUsage: {
        event_type:
          "similar_image_search",

        plan_code:
          limitCheck.planCode ||
          company.subscription_plan ||
          null,

        plan_name:
          limitCheck.planName ||
          null,

        used_before:
          usedBefore,

        used_after:
          usedAfter,

        limit,

        remaining,

        unlimited:
          Boolean(
            limitCheck.unlimited
          ),
      },
    });
  } catch (error) {
    console.error(
      "SIMILAR SEARCH USAGE API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "유사이미지 검색 사용량 저장 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}
