import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * =========================================================
 * 공개 업체 정보 조회 API
 * =========================================================
 *
 * 사용 예:
 * /api/public-company?slug=gibun
 * /api/public-company?slug=film
 *
 * 목적:
 * - 고객용 업체별 견적 페이지에서 사용
 * - slug로 활성 업체를 조회
 * - 업체별 고객페이지 설정을 함께 반환
 *
 * 중요:
 * - 클라이언트가 company_id를 직접 지정하지 않음
 * - slug를 기준으로 서버에서 실제 company_id 확인
 * - SUPABASE_SERVICE_ROLE_KEY는 서버에서만 사용
 * =========================================================
 */

function createAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다."
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다."
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

export async function GET(request) {
  try {
    /*
     * =====================================================
     * 1. URL에서 slug 읽기
     * =====================================================
     */

    const { searchParams } =
      new URL(request.url);

    const slug = String(
      searchParams.get("slug") || ""
    )
      .trim()
      .toLowerCase();

    /*
     * =====================================================
     * 2. slug 확인
     * =====================================================
     */

    if (!slug) {
      return NextResponse.json(
        {
          success: false,
          error:
            "회사 주소(slug)가 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !/^[a-z0-9-]+$/.test(slug)
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
     * 3. Supabase 서버 클라이언트
     * =====================================================
     */

    const supabase =
      createAdminClient();

    /*
     * =====================================================
     * 4. 활성 업체 조회
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
          company_name,
          slug,
          representative_name,
          phone,
          logo_url,
          subscription_plan,
          is_active
        `
      )
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (companyError) {
      console.error(
        "PUBLIC COMPANY LOOKUP ERROR:",
        companyError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "업체 정보를 조회하지 못했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * 업체가 없거나 비활성 상태
     */

    if (!company?.id) {
      return NextResponse.json(
        {
          success: false,
          error:
            "존재하지 않거나 사용할 수 없는 업체입니다.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * =====================================================
     * 5. 업체별 고객페이지 설정 조회
     * =====================================================
     */

    const {
      data: settings,
      error: settingsError,
    } = await supabase
      .from("company_settings")
      .select(
        `
          estimate_enabled,
          ai_estimate_enabled,
          virtual_install_enabled,
          film_samples_enabled,
          minimum_estimate,
          similarity_threshold,
          estimate_title,
          estimate_description,
          customer_phone,
          contact_url
        `
      )
      .eq(
        "company_id",
        company.id
      )
      .maybeSingle();

    if (settingsError) {
      console.error(
        "PUBLIC COMPANY SETTINGS ERROR:",
        settingsError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "업체 설정을 조회하지 못했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * 6. 설정이 없는 업체를 위한 기본값
     * =====================================================
     */

    const companySettings =
      settings || {
        estimate_enabled: true,
        ai_estimate_enabled: true,
        virtual_install_enabled: true,
        film_samples_enabled: true,

        minimum_estimate: 0,

        similarity_threshold:
          0.65,

        estimate_title:
          "AI 인테리어필름 견적",

        estimate_description:
          "시공할 곳의 사진을 올려주시면 예상견적을 확인할 수 있습니다.",

        customer_phone:
          company.phone || null,

        contact_url: null,
      };

    /*
     * =====================================================
     * 7. 고객페이지에 필요한 정보만 반환
     * =====================================================
     */

    return NextResponse.json(
      {
        success: true,

        company: {
          id: company.id,

          company_name:
            company.company_name,

          slug:
            company.slug,

          representative_name:
            company.representative_name,

          phone:
            company.phone,

          logo_url:
            company.logo_url,
        },

        settings:
          companySettings,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error(
      "PUBLIC COMPANY API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          "업체 정보를 불러오는 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
          }
