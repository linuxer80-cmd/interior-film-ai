import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * ============================================================
 * 신규 관리자 샘플 시공 데이터 자동 생성 API
 * ============================================================
 *
 * 동작:
 *
 * 1. 브라우저에서 전달한 로그인 토큰 확인
 * 2. 로그인 사용자의 profile 확인
 * 3. profile의 company_id 확인
 * 4. 회사 생성일 확인
 * 5. 기존 회사 / 필름장이 원본 회사 제외
 * 6. 신규 회사에만 샘플 데이터 생성
 * 7. DB 함수 자체에서 중복 생성도 다시 방지
 *
 * ============================================================
 */

const SOURCE_COMPANY_ID =
  "2ddfe3d9-4411-4991-ae35-5b876be411bc";

/*
 * 자동 샘플 적용 시작 시점
 *
 * 이 시점 이후 만들어진 회사에만
 * 신규 관리자 샘플을 자동 생성합니다.
 *
 * 한국시간 2026-09-25 00:00
 * = UTC 2026-09-24 15:00
 */
const SAMPLE_START_AT =
  new Date("2026-09-24T15:00:00.000Z");

function getBearerToken(request) {
  const authorization =
    request.headers.get("authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return "";
  }

  return authorization
    .slice("Bearer ".length)
    .trim();
}

export async function POST(request) {
  try {
    /* ========================================================
       환경변수 확인
    ======================================================== */

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return NextResponse.json(
        {
          success: false,
          error:
            "NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.",
        },
        {
          status: 500,
        },
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
        },
      );
    }

    /* ========================================================
       로그인 토큰 확인
    ======================================================== */

    const accessToken =
      getBearerToken(request);

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            "로그인 인증정보가 없습니다.",
        },
        {
          status: 401,
        },
      );
    }

    /* ========================================================
       서버 전용 Supabase 클라이언트
    ======================================================== */

    const supabaseAdmin =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        },
      );

    /* ========================================================
       실제 로그인 사용자 검증

       브라우저가 임의로 company_id를 보내는 방식이 아니라
       access token으로 실제 사용자 ID를 확인합니다.
    ======================================================== */

    const {
      data: userData,
      error: userError,
    } =
      await supabaseAdmin.auth.getUser(
        accessToken,
      );

    if (
      userError ||
      !userData?.user?.id
    ) {
      console.error(
        "샘플 데이터 사용자 인증:",
        userError,
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "로그인 정보를 확인할 수 없습니다.",
        },
        {
          status: 401,
        },
      );
    }

    const userId =
      userData.user.id;

    /* ========================================================
       로그인 사용자의 profile 조회

       profile에 연결된 company_id만 사용합니다.
       요청자가 다른 회사 ID를 지정할 수 없습니다.
    ======================================================== */

    const {
      data: profile,
      error: profileError,
    } =
      await supabaseAdmin
        .from("profiles")
        .select(
          `
            id,
            company_id,
            role,
            is_active
          `,
        )
        .eq("id", userId)
        .maybeSingle();

    if (profileError) {
      console.error(
        "샘플 데이터 profile 조회:",
        profileError,
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "관리자 정보를 확인하지 못했습니다.",
        },
        {
          status: 500,
        },
      );
    }

    if (!profile?.company_id) {
      return NextResponse.json(
        {
          success: false,
          error:
            "연결된 업체가 없습니다.",
        },
        {
          status: 403,
        },
      );
    }

    if (profile.is_active === false) {
      return NextResponse.json(
        {
          success: false,
          error:
            "비활성화된 관리자 계정입니다.",
        },
        {
          status: 403,
        },
      );
    }

    const companyId =
      profile.company_id;

    /* ========================================================
       필름장이 원본 회사 보호
    ======================================================== */

    if (
      companyId ===
      SOURCE_COMPANY_ID
    ) {
      return NextResponse.json({
        success: true,
        created: false,
        skipped: true,
        reason: "source_company",
        message:
          "필름장이 원본 회사는 샘플 생성 대상이 아닙니다.",
      });
    }

    /* ========================================================
       회사 정보 확인
    ======================================================== */

    const {
      data: company,
      error: companyError,
    } =
      await supabaseAdmin
        .from("companies")
        .select(
          `
            id,
            company_name,
            slug,
            is_active,
            created_at
          `,
        )
        .eq("id", companyId)
        .maybeSingle();

    if (companyError) {
      console.error(
        "샘플 데이터 회사 조회:",
        companyError,
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "업체 정보를 확인하지 못했습니다.",
        },
        {
          status: 500,
        },
      );
    }

    if (!company) {
      return NextResponse.json(
        {
          success: false,
          error:
            "업체가 존재하지 않습니다.",
        },
        {
          status: 404,
        },
      );
    }

    if (company.is_active === false) {
      return NextResponse.json(
        {
          success: false,
          error:
            "비활성화된 업체입니다.",
        },
        {
          status: 403,
        },
      );
    }

    /* ========================================================
       기존 회사 보호

       2026-09-25 00:00 KST 이전에 생성된 회사에는
       자동 샘플 데이터를 넣지 않습니다.
    ======================================================== */

    if (!company.created_at) {
      return NextResponse.json({
        success: true,
        created: false,
        skipped: true,
        reason: "missing_created_at",
        message:
          "회사 생성일이 없어 샘플 생성을 건너뜁니다.",
      });
    }

    const companyCreatedAt =
      new Date(company.created_at);

    if (
      Number.isNaN(
        companyCreatedAt.getTime(),
      )
    ) {
      return NextResponse.json({
        success: true,
        created: false,
        skipped: true,
        reason: "invalid_created_at",
        message:
          "회사 생성일을 확인할 수 없어 샘플 생성을 건너뜁니다.",
      });
    }

    if (
      companyCreatedAt <
      SAMPLE_START_AT
    ) {
      return NextResponse.json({
        success: true,
        created: false,
        skipped: true,
        reason: "existing_company",
        message:
          "기존 업체이므로 자동 샘플 생성을 건너뜁니다.",
      });
    }

    /* ========================================================
       이미 샘플 프로젝트가 있는지 먼저 확인

       DB 함수에도 중복 방지가 있지만,
       불필요한 RPC 호출을 줄이기 위해 서버에서도 확인합니다.
    ======================================================== */

    const {
      data: existingSample,
      error: sampleCheckError,
    } =
      await supabaseAdmin
        .from("projects")
        .select("id")
        .eq(
          "company_id",
          companyId,
        )
        .eq(
          "is_sample",
          true,
        )
        .limit(1)
        .maybeSingle();

    if (sampleCheckError) {
      console.error(
        "기존 샘플 확인:",
        sampleCheckError,
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "기존 샘플 데이터를 확인하지 못했습니다.",
        },
        {
          status: 500,
        },
      );
    }

    if (existingSample?.id) {
      return NextResponse.json({
        success: true,
        created: false,
        skipped: true,
        reason: "already_exists",
        message:
          "샘플 데이터가 이미 있습니다.",
      });
    }

    /* ========================================================
       샘플 생성 함수 실행

       SQL에서 설치한:
       create_company_sample_data(uuid)
    ======================================================== */

    const {
      data: sampleResult,
      error: sampleError,
    } =
      await supabaseAdmin.rpc(
        "create_company_sample_data",
        {
          target_company_id:
            companyId,
        },
      );

    if (sampleError) {
      console.error(
        "샘플 데이터 생성 RPC:",
        sampleError,
      );

      return NextResponse.json(
        {
          success: false,
          error:
            sampleError.message ||
            "샘플 데이터를 생성하지 못했습니다.",
        },
        {
          status: 500,
        },
      );
    }

    /* ========================================================
       완료
    ======================================================== */

    return NextResponse.json({
      success: true,
      created:
        sampleResult?.created ===
        true,
      companyId,
      companyName:
        company.company_name,
      result: sampleResult,
      message:
        sampleResult?.message ||
        "샘플 데이터 확인이 완료되었습니다.",
    });
  } catch (error) {
    console.error(
      "ensure-sample-data API:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "샘플 데이터 처리 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      },
    );
  }
        }
