import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
 * 자동견적 사용량 이벤트 기록
 *
 * 중요:
 * estimate_usage 저장은 기존 핵심 기능입니다.
 *
 * usage_events 기록이 실패하더라도
 * 이미 정상 완료된 자동견적을 실패시키지 않습니다.
 * =========================================================
 */

async function recordAutoEstimateUsage({
  supabase,
  company,
  estimateUsageId,
  sessionId,
  category,
  subCategory,
  photoCount,
  estimateMin,
  estimateMax,
  estimateAverage,
  photoPaths,
}) {
  if (!supabase || !company?.id) {
    return false;
  }

  try {
    const { error } =
      await supabase
        .from("usage_events")
        .insert({
          company_id:
            company.id,

          event_type:
            "auto_estimate",

          quantity: 1,

          cost_krw: 0,

          provider: null,

          model: null,

          reference_id:
            estimateUsageId
              ? String(
                  estimateUsageId
                )
              : null,

          metadata: {
            company_slug:
              company.slug ||
              null,

            session_id:
              sessionId
                ? String(
                    sessionId
                  )
                : null,

            category:
              category ||
              null,

            sub_category:
              subCategory ||
              null,

            photo_count:
              Number(
                photoCount || 0
              ),

            estimate_min:
              estimateMin,

            estimate_max:
              estimateMax,

            estimate_average:
              estimateAverage,

            photo_path_count:
              Array.isArray(
                photoPaths
              )
                ? photoPaths.length
                : 0,

            estimate_usage_id:
              estimateUsageId ||
              null,
          },
        });

    if (error) {
      console.error(
        "AUTO ESTIMATE USAGE EVENT INSERT ERROR:",
        error
      );

      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "AUTO ESTIMATE USAGE EVENT ERROR:",
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
     * =======================================================
     * 요청 데이터
     * =======================================================
     */

    const body =
      await request.json();

    const {
      company_slug,
      session_id,
      category,
      sub_category,
      photo_count,
      estimate_min,
      estimate_max,
      estimate_average,
      photo_paths,
    } = body || {};

    /*
     * =======================================================
     * 업체 slug 정리
     * =======================================================
     */

    const normalizedCompanySlug =
      String(
        company_slug || ""
      )
        .trim()
        .toLowerCase();

    if (
      !normalizedCompanySlug
    ) {
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

    /*
     * 허용:
     * 영문 소문자
     * 숫자
     * -
     */

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
     * =======================================================
     * 세션 ID 확인
     * =======================================================
     */

    if (!session_id) {
      return NextResponse.json(
        {
          success: false,

          error:
            "session_id가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =======================================================
     * Supabase 환경변수 확인
     * =======================================================
     */

    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env
        .SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return NextResponse.json(
        {
          success: false,

          error:
            "NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.",
        },
        {
          status: 500,
        }
      );
    }

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,

          error:
            "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =======================================================
     * Supabase Service Role
     * =======================================================
     */

    const supabase =
      getAdminSupabase();

    if (!supabase) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Supabase 서버 연결 설정을 확인할 수 없습니다.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =======================================================
     * 업체 확인
     *
     * 클라이언트가 company_id를 보내더라도
     * 신뢰하지 않습니다.
     *
     * company_slug를 기준으로 서버가
     * 실제 활성 업체를 조회합니다.
     * =======================================================
     */

    const {
      data: company,
      error: companyError,
    } = await supabase
      .from("companies")
      .select(
        "id, slug"
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
        "COMPANY LOOKUP ERROR:",
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
     * =======================================================
     * 사진 경로 정리
     * =======================================================
     */

    const safePhotoPaths =
      Array.isArray(
        photo_paths
      )
        ? photo_paths
            .map(
              (path) =>
                String(
                  path || ""
                ).trim()
            )
            .filter(
              Boolean
            )
        : [];

    /*
     * =======================================================
     * 사진 수 정리
     * =======================================================
     */

    const safePhotoCount =
      Number.isFinite(
        Number(
          photo_count
        )
      )
        ? Number(
            photo_count
          )
        : safePhotoPaths.length;

    /*
     * =======================================================
     * 견적 금액 정리
     * =======================================================
     */

    const safeEstimateMin =
      estimate_min === null ||
      estimate_min ===
        undefined ||
      estimate_min === ""
        ? null
        : Number(
            estimate_min
          );

    const safeEstimateMax =
      estimate_max === null ||
      estimate_max ===
        undefined ||
      estimate_max === ""
        ? null
        : Number(
            estimate_max
          );

    const safeEstimateAverage =
      estimate_average ===
        null ||
      estimate_average ===
        undefined ||
      estimate_average === ""
        ? null
        : Number(
            estimate_average
          );

    /*
     * =======================================================
     * 기존 estimate_usage 저장 데이터
     * =======================================================
     */

    const insertData = {
      company_id:
        company.id,

      session_id:
        String(
          session_id
        ),

      category:
        category
          ? String(
              category
            )
          : null,

      sub_category:
        sub_category
          ? String(
              sub_category
            )
          : null,

      photo_count:
        safePhotoCount,

      estimate_min:
        Number.isFinite(
          safeEstimateMin
        )
          ? safeEstimateMin
          : null,

      estimate_max:
        Number.isFinite(
          safeEstimateMax
        )
          ? safeEstimateMax
          : null,

      estimate_average:
        Number.isFinite(
          safeEstimateAverage
        )
          ? safeEstimateAverage
          : null,

      converted_to_lead:
        false,

      photo_paths:
        safePhotoPaths,
    };

    /*
     * =======================================================
     * 기존 자동견적 로그 저장
     * =======================================================
     */

    const {
      data,
      error,
    } = await supabase
      .from(
        "estimate_usage"
      )
      .insert(
        insertData
      )
      .select(
        `
          id,
          company_id,
          session_id,
          category,
          sub_category,
          photo_count,
          estimate_min,
          estimate_max,
          estimate_average,
          converted_to_lead,
          photo_paths,
          created_at
        `
      )
      .single();

    /*
     * estimate_usage 저장 실패
     *
     * 이것은 기존 핵심 로그이므로
     * 실패 응답을 유지합니다.
     */

    if (error) {
      console.error(
        "estimate_usage INSERT ERROR:",
        error
      );

      return NextResponse.json(
        {
          success: false,

          error:
            error.message ||
            "자동견적 로그 저장 실패",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =======================================================
     * SaaS 사용량 기록
     *
     * 자동견적 1회 완료 =
     * auto_estimate quantity 1
     *
     * AI 사진 분석 횟수와는 별도입니다.
     *
     * 예:
     *
     * 사진 3장 자동견적 1회
     *
     * ai_photo_analysis = 3
     * auto_estimate = 1
     *
     * usage_events 저장이 실패해도
     * 기존 estimate_usage 결과는 성공으로 유지합니다.
     * =======================================================
     */

    const usageRecorded =
      await recordAutoEstimateUsage(
        {
          supabase,

          company,

          estimateUsageId:
            data.id,

          sessionId:
            data.session_id,

          category:
            data.category,

          subCategory:
            data.sub_category,

          photoCount:
            data.photo_count,

          estimateMin:
            data.estimate_min,

          estimateMax:
            data.estimate_max,

          estimateAverage:
            data.estimate_average,

          photoPaths:
            data.photo_paths,
        }
      );

    /*
     * =======================================================
     * 성공
     * =======================================================
     */

    return NextResponse.json({
      success: true,

      usage_id:
        data.id,

      usageRecorded,

      data,
    });
  } catch (error) {
    console.error(
      "ESTIMATE USAGE API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "자동견적 로그 저장 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}
