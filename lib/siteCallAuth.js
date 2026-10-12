import { createClient } from "@supabase/supabase-js";
function getBearerToken(request) {
  const authorization =
    request.headers.get("authorization") || "";

  if (
    !authorization.startsWith(
      "Bearer ",
    )
  ) {
    return "";
  }

  return authorization
    .slice("Bearer ".length)
    .trim();
}

/* =========================================================
   관리자 인증

   - access token으로 실제 로그인 사용자 확인
   - profiles의 company_id 확인
   - 비활성 관리자 차단
   - 업체가 실제 존재하는지 확인
   - 비활성 업체 차단
========================================================= */

export async function authenticateAdmin(
  request,
) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    return {
      error:
        "NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.",
      status: 500,
    };
  }

  if (!serviceRoleKey) {
    return {
      error:
        "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.",
      status: 500,
    };
  }

  const accessToken =
    getBearerToken(request);

  if (!accessToken) {
    return {
      error:
        "로그인 인증정보가 없습니다.",
      status: 401,
    };
  }

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
      "통화녹음 사용자 인증:",
      userError,
    );

    return {
      error:
        "로그인 정보를 확인할 수 없습니다.",
      status: 401,
    };
  }

  const userId =
    userData.user.id;

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
      "통화녹음 profile 조회:",
      profileError,
    );

    return {
      error:
        "관리자 정보를 확인하지 못했습니다.",
      status: 500,
    };
  }

  if (!profile?.company_id || profile.role !== 'owner') {
    return {
      error:
        "연결된 업체가 없습니다.",
      status: 403,
    };
  }

  if (profile.is_active === false) {
    return {
      error:
        "비활성화된 관리자 계정입니다.",
      status: 403,
    };
  }

  const companyId =
    profile.company_id;

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
          is_active
        `,
      )
      .eq("id", companyId)
      .maybeSingle();

  if (companyError) {
    console.error(
      "통화녹음 업체 조회:",
      companyError,
    );

    return {
      error:
        "업체 정보를 확인하지 못했습니다.",
      status: 500,
    };
  }

  if (!company) {
    return {
      error:
        "업체가 존재하지 않습니다.",
      status: 404,
    };
  }

  if (company.is_active === false) {
    return {
      error:
        "비활성화된 업체입니다.",
      status: 403,
    };
  }

  return {
    success: true,
    db: supabaseAdmin,
    userId,
    companyId,
    profile,
    company,
  };
}

