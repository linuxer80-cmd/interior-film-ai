import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/* =========================================================
   JSON 응답
========================================================= */

function json(
  data,
  status = 200
) {
  return Response.json(
    data,
    {
      status,
    }
  );
}

/* =========================================================
   문자열 정리
========================================================= */

function cleanText(
  value
) {
  if (
    typeof value !==
    "string"
  ) {
    return "";
  }

  return value.trim();
}

/* =========================================================
   Supabase Admin
========================================================= */

function createAdminClient() {
  const supabaseUrl =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다."
    );
  }

  if (
    !serviceRoleKey
  ) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다."
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession:
          false,

        autoRefreshToken:
          false,
      },
    }
  );
}

/* =========================================================
   특정 사용자 Auth 이메일 확인
========================================================= */

async function getAuthEmail(
  supabase,
  userId
) {
  const {
    data,
    error,
  } =
    await supabase
      .auth
      .admin
      .getUserById(
        userId
      );

  if (error) {
    console.error(
      "Auth 사용자 조회 오류:",
      error
    );

    return "";
  }

  return String(
    data?.user?.email ||
    ""
  )
    .trim()
    .toLowerCase();
}

/* =========================================================
   POST
========================================================= */

export async function POST(
  request
) {
  try {
    const body =
      await request
        .json()
        .catch(
          () => ({})
        );

    const companyName =
      cleanText(
        body?.companyName
      );

    const email =
      cleanText(
        body?.email
      ).toLowerCase();

    /* ---------------------------------------------------------
       입력 확인
    --------------------------------------------------------- */

    if (
      !companyName
    ) {
      return json(
        {
          success:
            false,

          error:
            "업체명을 입력해주세요.",
        },
        400
      );
    }

    if (!email) {
      return json(
        {
          success:
            false,

          error:
            "가입할 때 사용한 이메일을 입력해주세요.",
        },
        400
      );
    }

    const supabase =
      createAdminClient();

    /* =========================================================
       1. 업체명 조회

       동일 업체명이 존재할 가능성을 고려해서
       단일행이 아니라 배열로 조회
    ========================================================= */

    const {
      data: companies,
      error: companyError,
    } =
      await supabase
        .from(
          "companies"
        )
        .select(
          "id, company_name, is_active"
        )
        .eq(
          "company_name",
          companyName
        );

    if (
      companyError
    ) {
      throw new Error(
        `업체 조회 실패: ${companyError.message}`
      );
    }

    if (
      !Array.isArray(
        companies
      ) ||
      companies.length ===
        0
    ) {
      return json(
        {
          success:
            false,

          error:
            "등록된 업체명을 확인할 수 없습니다.",
        },
        404
      );
    }

    /*
     * 활성 업체만 사용
     */
    const activeCompanies =
      companies.filter(
        (company) =>
          company?.is_active !==
          false
      );

    if (
      activeCompanies.length ===
      0
    ) {
      return json(
        {
          success:
            false,

          error:
            "현재 사용이 중지된 업체입니다.",
        },
        403
      );
    }

    const companyIds =
      activeCompanies
        .map(
          (company) =>
            company.id
        )
        .filter(
          Boolean
        );

    /* =========================================================
       2. 해당 업체에 연결된 대표(owner) 계정 조회

       업체 비밀번호 찾기는
       업체 대표 계정만 대상으로 처리
    ========================================================= */

    const {
      data: profiles,
      error: profileError,
    } =
      await supabase
        .from(
          "profiles"
        )
        .select(
          "id, company_id, role, is_active"
        )
        .in(
          "company_id",
          companyIds
        )
        .eq(
          "role",
          "owner"
        )
        .eq(
          "is_active",
          true
        );

    if (
      profileError
    ) {
      throw new Error(
        `업체 계정 조회 실패: ${profileError.message}`
      );
    }

    if (
      !Array.isArray(
        profiles
      ) ||
      profiles.length ===
        0
    ) {
      return json(
        {
          success:
            false,

          error:
            "해당 업체의 로그인 계정을 확인할 수 없습니다.",
        },
        404
      );
    }

    /* =========================================================
       3. Auth 이메일과 입력 이메일 확인

       profiles.id가 Auth user UUID
    ========================================================= */

    let matchedProfile =
      null;

    for (
      const profile of
      profiles
    ) {
      if (
        !profile?.id
      ) {
        continue;
      }

      const authEmail =
        await getAuthEmail(
          supabase,
          profile.id
        );

      if (
        authEmail &&
        authEmail ===
          email
      ) {
        matchedProfile =
          profile;

        break;
      }
    }

    /* =========================================================
       4. 업체 + 이메일 불일치
    ========================================================= */

    if (
      !matchedProfile
    ) {
      return json(
        {
          success:
            false,

          error:
            "해당 업체에 등록된 이메일이 아닙니다.",
        },
        404
      );
    }

    /* =========================================================
       5. 실제 비밀번호 재설정 메일 발송

       현재 운영 도메인 기준으로
       /reset-password 이동
    ========================================================= */

    const requestUrl =
      new URL(
        request.url
      );

    const origin =
      requestUrl.origin;

    const redirectTo =
      `${origin}/reset-password`;

    const {
      error:
        resetError,
    } =
      await supabase
        .auth
        .resetPasswordForEmail(
          email,
          {
            redirectTo,
          }
        );

    if (
      resetError
    ) {
      const lowerMessage =
        String(
          resetError.message ||
          ""
        ).toLowerCase();

      if (
        lowerMessage.includes(
          "rate limit"
        ) ||
        lowerMessage.includes(
          "too many"
        )
      ) {
        return json(
          {
            success:
              false,

            error:
              "재설정 메일 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
          },
          429
        );
      }

      throw resetError;
    }

    /* =========================================================
       6. 완료
    ========================================================= */

    return json({
      success:
        true,

      message:
        "비밀번호 재설정 메일을 발송했습니다.",
    });
  } catch (error) {
    console.error(
      "비밀번호 재설정 API 오류:",
      error
    );

    return json(
      {
        success:
          false,

        error:
          error?.message ||
          "비밀번호 재설정 요청 중 오류가 발생했습니다.",
      },
      500
    );
  }
}
